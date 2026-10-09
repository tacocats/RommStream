import { createLogger } from '../utils/logger';
import { Config, Heartbeat, StreamingConfig } from '../utils/playPath';
import {
  MemoryCardImportRequiredError,
  RommApiError,
  RommCollection,
  RommLaunchingSession,
  RommMemoryCardImportRequired,
  RommSessionStatus,
  RommPlatform,
  RommRecommendation,
  RommRom,
  RommRomDetail,
  RommStats,
  RommUser,
  RommVirtualCollection,
} from './types';

const log = createLogger('api');

// What device pairing asks RomM for: read-only scopes for browsing, and
// roms.user.write to claim and release streaming containers.
export const REQUESTED_SCOPES =
  'me.read platforms.read roms.read collections.read roms.user.write';

export function normalizeServerUrl(rawUrl: string): string {
  let trimmed = rawUrl.trim();
  while (trimmed.endsWith('/')) {
    trimmed = trimmed.slice(0, -1);
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export async function parseJsonOrThrow(response: Response) {
  const text = await response.text();
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // Non-JSON body (e.g. an HTML error page from a reverse proxy).
    }
  }
  if (!response.ok) {
    log.warn(
      `HTTP ${response.status} from ${(response.url ?? '').split('?')[0]}`,
      `body=${text.slice(0, 200)}`,
    );
    // A short plain-text body is the server's own words (e.g. RomM's CSRF
    // rejection); an HTML error page from a proxy is not worth showing.
    const plainText =
      body === undefined && text && text.length <= 200 && !text.startsWith('<')
        ? text.trim()
        : '';
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : plainText || response.statusText;
    throw new RommApiError(
      detail || `Request failed (${response.status})`,
      response.status,
    );
  }
  return body;
}

export async function getCurrentUser(
  serverUrl: string,
  accessToken: string,
): Promise<RommUser> {
  const response = await fetch(`${serverUrl}/api/users/me`, {
    ...bearer(accessToken),
  });
  return (await parseJsonOrThrow(response)) as RommUser;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

// Bearer calls leave cookies out (credentials: 'omit'): with a RomM login
// session cookie alongside, RomM's CSRF middleware no longer waves bearer
// requests through, and every POST/DELETE would fail with a 403.
function bearer(accessToken: string): RequestInit {
  return {
    headers: authHeaders(accessToken),
    credentials: 'omit',
  };
}

// /api/platforms returns a plain array; /api/roms returns a paginated
// { items: [...] } envelope. Accept either shape from either endpoint.
function unwrapList<T>(body: unknown): T[] {
  if (Array.isArray(body)) {
    return body as T[];
  }
  if (
    body &&
    typeof body === 'object' &&
    Array.isArray((body as { items?: unknown }).items)
  ) {
    return (body as { items: T[] }).items;
  }
  return [];
}

export async function getPlatforms(
  serverUrl: string,
  accessToken: string,
): Promise<RommPlatform[]> {
  const response = await fetch(`${serverUrl}/api/platforms`, {
    ...bearer(accessToken),
  });
  return unwrapList<RommPlatform>(await parseJsonOrThrow(response));
}

// GET /api/roms is limit/offset paginated ({ items, total, limit, offset })
// with a default page of 50 (max 10,000). The platform filter is the
// repeatable `platform_ids` parameter; `platform_id` is silently ignored.
const ROMS_PAGE_SIZE = 500;

// Free-text search across the whole library via the `search_term` filter of
// the same endpoint. One page is plenty for a search box.
const SEARCH_PAGE_SIZE = 100;

export async function searchRoms(
  serverUrl: string,
  accessToken: string,
  searchTerm: string,
): Promise<RommRom[]> {
  const params = new URLSearchParams({
    search_term: searchTerm,
    limit: String(SEARCH_PAGE_SIZE),
    offset: '0',
    order_by: 'name',
    order_dir: 'asc',
  });

  const response = await fetch(`${serverUrl}/api/roms?${params.toString()}`, {
    ...bearer(accessToken),
  });
  return unwrapList<RommRom>(await parseJsonOrThrow(response));
}

export async function getRom(
  serverUrl: string,
  accessToken: string,
  romId: number,
): Promise<RommRomDetail> {
  const response = await fetch(`${serverUrl}/api/roms/${romId}`, {
    ...bearer(accessToken),
  });
  return (await parseJsonOrThrow(response)) as RommRomDetail;
}

async function fetchAllRoms(
  serverUrl: string,
  accessToken: string,
  extraParams: Record<string, string>,
): Promise<RommRom[]> {
  const roms: RommRom[] = [];
  let offset = 0;

  for (;;) {
    const params = new URLSearchParams({
      limit: String(ROMS_PAGE_SIZE),
      offset: String(offset),
      order_by: 'name',
      order_dir: 'asc',
      ...extraParams,
    });

    const response = await fetch(`${serverUrl}/api/roms?${params.toString()}`, {
      ...bearer(accessToken),
    });
    const body = await parseJsonOrThrow(response);
    const page = unwrapList<RommRom>(body);
    roms.push(...page);

    const total =
      body &&
      typeof body === 'object' &&
      typeof (body as { total?: unknown }).total === 'number'
        ? (body as { total: number }).total
        : undefined;
    const exhausted =
      page.length < ROMS_PAGE_SIZE ||
      Array.isArray(body) ||
      (total !== undefined && roms.length >= total);
    if (exhausted) {
      return roms;
    }
    offset += page.length;
  }
}

export async function getRoms(
  serverUrl: string,
  accessToken: string,
  platformId?: number,
): Promise<RommRom[]> {
  return fetchAllRoms(
    serverUrl,
    accessToken,
    platformId !== undefined ? { platform_ids: String(platformId) } : {},
  );
}

export async function getRomsByCollection(
  serverUrl: string,
  accessToken: string,
  collectionId: number,
): Promise<RommRom[]> {
  return fetchAllRoms(serverUrl, accessToken, {
    collection_id: String(collectionId),
  });
}

export async function getRomsByVirtualCollection(
  serverUrl: string,
  accessToken: string,
  virtualCollectionId: string,
): Promise<RommRom[]> {
  return fetchAllRoms(serverUrl, accessToken, {
    virtual_collection_id: virtualCollectionId,
  });
}

// Home screen shelves: a single, unpaginated page is enough, and the
// char/filter/id-index sidecars that power the full gallery view would
// otherwise walk the whole library on every load.
const HOME_SHELF_LIMIT = 20;

export async function getRecentlyAddedRoms(
  serverUrl: string,
  accessToken: string,
  limit: number = HOME_SHELF_LIMIT,
): Promise<RommRom[]> {
  const params = new URLSearchParams({
    order_by: 'created_at',
    order_dir: 'desc',
    limit: String(limit),
    offset: '0',
    with_char_index: 'false',
    with_filter_values: 'false',
    with_rom_id_index: 'false',
  });

  const response = await fetch(`${serverUrl}/api/roms?${params.toString()}`, {
    ...bearer(accessToken),
  });
  return unwrapList<RommRom>(await parseJsonOrThrow(response));
}

export async function getRecommendations(
  serverUrl: string,
  accessToken: string,
  limit: number = HOME_SHELF_LIMIT,
): Promise<RommRecommendation[]> {
  const params = new URLSearchParams({ limit: String(limit) });

  const response = await fetch(
    `${serverUrl}/api/recommendations?${params.toString()}`,
    bearer(accessToken),
  );
  const body = await parseJsonOrThrow(response);
  return Array.isArray(body) ? (body as RommRecommendation[]) : [];
}

export async function getCollections(
  serverUrl: string,
  accessToken: string,
): Promise<RommCollection[]> {
  const response = await fetch(`${serverUrl}/api/collections`, {
    ...bearer(accessToken),
  });
  const body = await parseJsonOrThrow(response);
  return Array.isArray(body) ? (body as RommCollection[]) : [];
}

// RomM groups these on the fly by a shared metadata facet. "collection" is
// the IGDB series/collection facet (e.g. "The Legend of Zelda Collection"),
// the same default RomM's own UI ships with — other facets (franchise,
// genre, mode, company) are pickier and "all" is expensive to compute.
const DEFAULT_VIRTUAL_COLLECTION_TYPE = 'collection';

export async function getVirtualCollections(
  serverUrl: string,
  accessToken: string,
  type: string = DEFAULT_VIRTUAL_COLLECTION_TYPE,
  limit: number = HOME_SHELF_LIMIT,
): Promise<RommVirtualCollection[]> {
  const params = new URLSearchParams({ type, limit: String(limit) });

  const response = await fetch(
    `${serverUrl}/api/collections/virtual?${params.toString()}`,
    bearer(accessToken),
  );
  const body = await parseJsonOrThrow(response);
  return Array.isArray(body) ? (body as RommVirtualCollection[]) : [];
}

export async function getStats(
  serverUrl: string,
  accessToken: string,
): Promise<RommStats> {
  const response = await fetch(`${serverUrl}/api/stats`, {
    ...bearer(accessToken),
  });
  return (await parseJsonOrThrow(response)) as RommStats;
}

// The three lookups RomM's own Play button consults before picking a route.
// Only the fields the play-path resolver reads are modelled; the EMULATION
// block is normalised so a response without it can't crash the resolver.
export async function getHeartbeat(
  serverUrl: string,
  accessToken: string,
): Promise<Heartbeat> {
  const response = await fetch(`${serverUrl}/api/heartbeat`, {
    ...bearer(accessToken),
  });
  const body = (await parseJsonOrThrow(response)) as Partial<Heartbeat> | null;
  return { EMULATION: body?.EMULATION ?? {} };
}

export async function getConfig(
  serverUrl: string,
  accessToken: string,
): Promise<Config> {
  const response = await fetch(`${serverUrl}/api/config`, {
    ...bearer(accessToken),
  });
  return ((await parseJsonOrThrow(response)) ?? {}) as Config;
}

export async function getStreamingConfig(
  serverUrl: string,
  accessToken: string,
): Promise<StreamingConfig> {
  const response = await fetch(`${serverUrl}/api/streaming/config`, {
    credentials: 'omit',
    headers: {
      ...authHeaders(accessToken),
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
  const body = (await parseJsonOrThrow(
    response,
  )) as Partial<StreamingConfig> | null;
  return {
    enabled: body?.enabled ?? false,
    containers: body?.containers ?? [],
  };
}

export interface ClaimStreamingSessionOptions {
  stateId?: number;
  saveId?: number;
  memoryCardId?: number;
  /** The answer to a previous claim's MemoryCardImportRequiredError. */
  cardImport?: 'adopt' | 'discard';
  multiplayer?: boolean;
}

/**
 * Reserve a streaming container for a rom and start loading it. Answers as
 * soon as the container is reserved; the room URL comes later (see
 * api/streamingSession.ts).
 */
export async function claimStreamingSession(
  serverUrl: string,
  accessToken: string,
  romId: number,
  options: ClaimStreamingSessionOptions = {},
): Promise<RommLaunchingSession> {
  const body = {
    rom_id: romId,
    ...(options.stateId !== undefined && { state_id: options.stateId }),
    ...(options.saveId !== undefined && { save_id: options.saveId }),
    ...(options.memoryCardId !== undefined && {
      memory_card_id: options.memoryCardId,
    }),
    ...(options.cardImport !== undefined && {
      card_import: options.cardImport,
    }),
    ...(options.multiplayer !== undefined && {
      multiplayer: options.multiplayer,
    }),
  };

  const response = await fetch(`${serverUrl}/api/streaming/sessions`, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (response.status === 428) {
    const details = (await response
      .json()
      .catch(() => null)) as RommMemoryCardImportRequired | null;
    if (details?.code === 'memory_card_import_required') {
      throw new MemoryCardImportRequiredError(details);
    }
  }
  return (await parseJsonOrThrow(response)) as RommLaunchingSession;
}

/** Whether the caller still holds a platform's session, without extending it. */
export async function getStreamingSessionStatus(
  serverUrl: string,
  accessToken: string,
  platform: string,
): Promise<RommSessionStatus> {
  const response = await fetch(
    `${serverUrl}/api/streaming/sessions/${encodeURIComponent(
      platform,
    )}/status`,
    bearer(accessToken),
  );
  return (await parseJsonOrThrow(response)) as RommSessionStatus;
}

/**
 * Keep a claimed session alive. RomM's own player calls this every ~30s; a
 * session that stops refreshing counts as abandoned and can be taken over.
 */
export async function heartbeatStreamingSession(
  serverUrl: string,
  accessToken: string,
  platform: string,
  container?: string,
): Promise<RommSessionStatus> {
  const params = new URLSearchParams(
    container !== undefined ? { container } : {},
  );
  const query = params.toString();

  const response = await fetch(
    `${serverUrl}/api/streaming/sessions/${encodeURIComponent(
      platform,
    )}/heartbeat${query ? `?${query}` : ''}`,
    { method: 'POST', ...bearer(accessToken) },
  );
  return (await parseJsonOrThrow(response)) as RommSessionStatus;
}

/**
 * Release a session and stop its emulator. `save: false` leaves without
 * saving; RomM saves by default since a closed tab lands here too.
 */
export async function releaseStreamingSession(
  serverUrl: string,
  accessToken: string,
  platform: string,
  options: { save?: boolean; container?: string } = {},
): Promise<void> {
  const params = new URLSearchParams({
    ...(options.container !== undefined && { container: options.container }),
    ...(options.save === false && { save: 'false' }),
  });
  const query = params.toString();

  const response = await fetch(
    `${serverUrl}/api/streaming/sessions/${encodeURIComponent(platform)}${
      query ? `?${query}` : ''
    }`,
    { method: 'DELETE', ...bearer(accessToken) },
  );
  await parseJsonOrThrow(response);
}
