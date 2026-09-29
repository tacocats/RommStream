import { createLogger } from '../utils/logger';
import { Config, Heartbeat, StreamingConfig } from '../utils/playPath';
import {
  RommApiError,
  RommCollection,
  RommPlatform,
  RommRecommendation,
  RommRom,
  RommRomDetail,
  RommStats,
  RommVirtualCollection,
  TokenResponse,
} from './types';

const log = createLogger('api');

// Read-only scopes are enough for browsing + launching the web player.
const REQUESTED_SCOPES = 'me.read platforms.read roms.read collections.read';

export function normalizeServerUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

async function parseJsonOrThrow(response: Response) {
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
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : response.statusText;
    throw new RommApiError(
      detail || `Request failed (${response.status})`,
      response.status,
    );
  }
  return body;
}

export async function login(
  serverUrl: string,
  username: string,
  password: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'password',
    username,
    password,
    scope: REQUESTED_SCOPES,
  });

  const response = await fetch(`${serverUrl}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  return (await parseJsonOrThrow(response)) as TokenResponse;
}

export async function refreshAccessToken(
  serverUrl: string,
  refreshToken: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch(`${serverUrl}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  return (await parseJsonOrThrow(response)) as TokenResponse;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
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
    headers: authHeaders(accessToken),
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
    headers: authHeaders(accessToken),
  });
  return unwrapList<RommRom>(await parseJsonOrThrow(response));
}

export async function getRom(
  serverUrl: string,
  accessToken: string,
  romId: number,
): Promise<RommRomDetail> {
  const response = await fetch(`${serverUrl}/api/roms/${romId}`, {
    headers: authHeaders(accessToken),
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
      headers: authHeaders(accessToken),
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
    headers: authHeaders(accessToken),
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
    { headers: authHeaders(accessToken) },
  );
  const body = await parseJsonOrThrow(response);
  return Array.isArray(body) ? (body as RommRecommendation[]) : [];
}

export async function getCollections(
  serverUrl: string,
  accessToken: string,
): Promise<RommCollection[]> {
  const response = await fetch(`${serverUrl}/api/collections`, {
    headers: authHeaders(accessToken),
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
    { headers: authHeaders(accessToken) },
  );
  const body = await parseJsonOrThrow(response);
  return Array.isArray(body) ? (body as RommVirtualCollection[]) : [];
}

export async function getStats(
  serverUrl: string,
  accessToken: string,
): Promise<RommStats> {
  const response = await fetch(`${serverUrl}/api/stats`, {
    headers: authHeaders(accessToken),
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
    headers: authHeaders(accessToken),
  });
  const body = (await parseJsonOrThrow(response)) as Partial<Heartbeat> | null;
  return { EMULATION: body?.EMULATION ?? {} };
}

export async function getConfig(
  serverUrl: string,
  accessToken: string,
): Promise<Config> {
  const response = await fetch(`${serverUrl}/api/config`, {
    headers: authHeaders(accessToken),
  });
  return ((await parseJsonOrThrow(response)) ?? {}) as Config;
}

export async function getStreamingConfig(
  serverUrl: string,
  accessToken: string,
): Promise<StreamingConfig> {
  const response = await fetch(`${serverUrl}/api/streaming/config`, {
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
