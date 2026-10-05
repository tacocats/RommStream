import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from '../utils/logger';

const log = createLogger('iconCache');

export type ResolvedIcon =
  | { kind: 'svg'; xml: string }
  | { kind: 'ico'; url: string }
  | { kind: 'none' };

type IconCandidate = { url: string; kind: 'svg' | 'ico' };

// Bump to discard persisted entries whose shape or resolution rules changed.
const STORAGE_PREFIX = 'rommstream.platformIcon.v1:';

// One in-flight-or-settled promise per platform for the life of the app, so
// every tile that mounts (tab switches, list re-renders) shares a single
// resolution instead of probing the server again.
const memory = new Map<string, Promise<ResolvedIcon>>();

// The same results, readable synchronously so a remounting tile can paint its
// icon on the first frame instead of waiting a promise tick.
const settled = new Map<string, ResolvedIcon>();

// Each platform probes up to six URLs one after another. Running every
// platform at once floods the network stack and the JS thread with fetches
// and SVG parsing, which is what keeps the grid unresponsive after load.
const MAX_CONCURRENT_PROBES = 6;
let activeProbes = 0;
const probeQueue: Array<() => void> = [];

async function withProbeSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeProbes >= MAX_CONCURRENT_PROBES) {
    // The finishing task hands its slot straight to us.
    await new Promise<void>(resolve => probeQueue.push(resolve));
  } else {
    activeProbes++;
  }
  try {
    return await task();
  } finally {
    const next = probeQueue.shift();
    if (next) {
      next();
    } else {
      activeProbes--;
    }
  }
}

// RomM ships most platform icons as .ico and only some as .svg, and its web
// UI (components/common/Platform/PlatformIcon.vue) tries fs_slug then slug,
// .svg before .ico. Since v3.8 the repo also carries a larger vector set
// under assets/platforms/systematic/ that nothing in the web UI references
// but which the Docker image copies verbatim, so it is reachable and is
// preferred over the .ico for the same slug.
export function iconCandidates(
  serverUrl: string,
  slugs: Array<string | undefined>,
): IconCandidate[] {
  const base = `${serverUrl}/assets/platforms`;
  return normalizeSlugs(slugs).flatMap(slug => [
    { kind: 'svg', url: `${base}/${slug}.svg` },
    { kind: 'svg', url: `${base}/systematic/${slug}.svg` },
    { kind: 'ico', url: `${base}/${slug}.ico` },
  ]);
}

function normalizeSlugs(slugs: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      slugs
        .filter((s): s is string => !!s)
        .map(s => s.trim().toLowerCase())
        .filter(s => s.length > 0),
    ),
  );
}

function cacheKey(serverUrl: string, slugs: Array<string | undefined>) {
  return `${serverUrl}|${normalizeSlugs(slugs).join(',')}`;
}

// RomM's platform SVGs carry their colors in a <style> block keyed by CSS
// class (e.g. ".cls-1 { fill: #c1c1c1; }"). react-native-svg's renderer
// doesn't resolve stylesheet classes, so every shape would fall back to the
// SVG default fill of black. Inline each class's declarations onto the
// elements that use it before handing the markup to SvgXml.
export function inlineSvgClasses(svg: string): string {
  const styleMatch = svg.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (!styleMatch) {
    return svg;
  }

  const declarationsByClass = new Map<string, string>();
  const ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
  let rule: RegExpExecArray | null;
  while ((rule = ruleRegex.exec(styleMatch[1]))) {
    const [, selectorList, declarations] = rule;
    const trimmed = declarations.trim();
    if (!trimmed) {
      continue;
    }
    for (const selector of selectorList.split(',')) {
      const className = selector.trim().replace(/^\./, '');
      if (!className) {
        continue;
      }
      const existing = declarationsByClass.get(className);
      declarationsByClass.set(
        className,
        existing ? `${existing};${trimmed}` : trimmed,
      );
    }
  }

  return stripStyleBlocks(svg).replace(
    /class="([^"]+)"/g,
    (match, classNames: string) => {
      const declarations = classNames
        .split(/\s+/)
        .map((name: string) => declarationsByClass.get(name))
        .filter((d: string | undefined): d is string => !!d)
        .join(';');
      return declarations ? `${match} style="${declarations}"` : match;
    },
  );
}

// Repeat until nothing changes: removing one block can splice its
// neighbours into a new one (e.g. "<sty<style></style>le>").
function stripStyleBlocks(svg: string): string {
  let previous: string;
  let current = svg;
  do {
    previous = current;
    current = current.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  } while (current !== previous);
  return current;
}

// A missing asset doesn't always 404: RomM's SPA fallback can answer with
// 200 and index.html, which must not be handed to the SVG renderer or
// Image. An .ico starts with a zero byte, never with markup.
function looksLikeSvg(text: string): boolean {
  return /<svg[\s>]/i.test(text);
}

function looksLikeMarkup(text: string): boolean {
  return /^\s*</.test(text);
}

async function probe(candidate: IconCandidate): Promise<ResolvedIcon | null> {
  const t0 = Date.now();
  try {
    const res = await fetch(candidate.url);
    if (!res.ok) {
      log.debug(`probe ${res.status} ${Date.now() - t0}ms ${candidate.url}`);
      return null;
    }
    const text = await res.text();
    log.debug(
      `probe 200 ${Date.now() - t0}ms ${text.length}B ${candidate.url}`,
    );
    if (candidate.kind === 'svg') {
      return looksLikeSvg(text)
        ? { kind: 'svg', xml: inlineSvgClasses(text) }
        : null;
    }
    return looksLikeMarkup(text) ? null : { kind: 'ico', url: candidate.url };
  } catch (e) {
    log.debug(`icon probe failed for ${candidate.url}`, e);
    return null;
  }
}

async function resolveUncached(
  key: string,
  candidates: IconCandidate[],
  checkStorage = true,
): Promise<ResolvedIcon> {
  const storageKey = STORAGE_PREFIX + key;
  if (checkStorage) {
    try {
      const stored = await AsyncStorage.getItem(storageKey);
      if (stored) {
        return JSON.parse(stored) as ResolvedIcon;
      }
    } catch (e) {
      log.warn('icon cache unreadable, probing instead', e);
      // Unreadable storage just means a fresh probe.
    }
  }

  return withProbeSlot(async () => {
    for (const candidate of candidates) {
      const resolved = await probe(candidate);
      if (resolved) {
        AsyncStorage.setItem(storageKey, JSON.stringify(resolved)).catch(e =>
          log.warn('could not cache icon', e),
        );
        return resolved;
      }
    }
    // A miss is remembered for the session only, so a platform whose icon
    // appears in a later RomM release is picked up on the next launch.
    return { kind: 'none' } as ResolvedIcon;
  });
}

function track(
  key: string,
  pending: Promise<ResolvedIcon>,
): Promise<ResolvedIcon> {
  memory.set(key, pending);
  pending.then(icon => {
    // Skip if the entry was invalidated while the probe was in flight.
    if (memory.get(key) === pending) {
      settled.set(key, icon);
    }
  });
  return pending;
}

/** The icon for a platform, resolved at most once per app session. */
export function resolvePlatformIcon(
  serverUrl: string,
  slugs: Array<string | undefined>,
): Promise<ResolvedIcon> {
  const key = cacheKey(serverUrl, slugs);
  return (
    memory.get(key) ??
    track(key, resolveUncached(key, iconCandidates(serverUrl, slugs)))
  );
}

/** The icon if it is already resolved this session, without waiting. */
export function peekPlatformIcon(
  serverUrl: string,
  slugs: Array<string | undefined>,
): ResolvedIcon | null {
  return settled.get(cacheKey(serverUrl, slugs)) ?? null;
}

/**
 * Warm the cache for a whole list: one batched storage read instead of a
 * read per tile, then probe the misses in list order under the probe limit.
 */
export async function prefetchPlatformIcons(
  serverUrl: string,
  platforms: Array<Array<string | undefined>>,
): Promise<void> {
  const pending = platforms
    .map(slugs => ({ slugs, key: cacheKey(serverUrl, slugs) }))
    .filter(({ key }) => !memory.has(key));
  if (pending.length === 0) {
    return;
  }

  const t0 = Date.now();
  let stored: Record<string, string | null> = {};
  try {
    stored = await AsyncStorage.getMany(
      pending.map(({ key }) => STORAGE_PREFIX + key),
    );
  } catch (e) {
    log.warn('icon cache unreadable, probing instead', e);
  }
  log.debug(
    `prefetch: getMany ${Date.now() - t0}ms, ${
      Object.values(stored).filter(Boolean).length
    }/${pending.length} cached, ${Object.values(stored).reduce(
      (n, v) => n + (v?.length ?? 0),
      0,
    )} chars`,
  );

  for (const { slugs, key } of pending) {
    if (memory.has(key)) {
      continue;
    }
    const raw = stored[STORAGE_PREFIX + key];
    if (raw) {
      try {
        track(key, Promise.resolve(JSON.parse(raw) as ResolvedIcon));
        continue;
      } catch (e) {
        log.warn('discarding corrupt cached icon', e);
      }
    }
    track(key, resolveUncached(key, iconCandidates(serverUrl, slugs), false));
  }
  log.debug(`prefetch: parsed and queued after ${Date.now() - t0}ms`);
}

/**
 * Forget a platform's icon, e.g. when a cached .ico turns out not to
 * render, so the next mount probes the server again.
 */
export function invalidatePlatformIcon(
  serverUrl: string,
  slugs: Array<string | undefined>,
): void {
  const key = cacheKey(serverUrl, slugs);
  memory.delete(key);
  settled.delete(key);
  AsyncStorage.removeItem(STORAGE_PREFIX + key).catch(e =>
    log.warn('could not evict cached icon', e),
  );
}

/** Test hook: drop the in-memory cache. */
export function resetPlatformIconCache(): void {
  memory.clear();
  settled.clear();
  activeProbes = 0;
  probeQueue.length = 0;
}
