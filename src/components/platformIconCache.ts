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

  return svg
    .replace(/<style[^>]*>[\s\S]*?<\/style>/i, '')
    .replace(/class="([^"]+)"/g, (match, classNames: string) => {
      const declarations = classNames
        .split(/\s+/)
        .map((name: string) => declarationsByClass.get(name))
        .filter((d: string | undefined): d is string => !!d)
        .join(';');
      return declarations ? `${match} style="${declarations}"` : match;
    });
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
  try {
    const res = await fetch(candidate.url);
    if (!res.ok) {
      return null;
    }
    const text = await res.text();
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
): Promise<ResolvedIcon> {
  const storageKey = STORAGE_PREFIX + key;
  try {
    const stored = await AsyncStorage.getItem(storageKey);
    if (stored) {
      return JSON.parse(stored) as ResolvedIcon;
    }
  } catch (e) {
    log.warn('icon cache unreadable, probing instead', e);
    // Unreadable storage just means a fresh probe.
  }

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
  return { kind: 'none' };
}

/** The icon for a platform, resolved at most once per app session. */
export function resolvePlatformIcon(
  serverUrl: string,
  slugs: Array<string | undefined>,
): Promise<ResolvedIcon> {
  const key = cacheKey(serverUrl, slugs);
  let pending = memory.get(key);
  if (!pending) {
    pending = resolveUncached(key, iconCandidates(serverUrl, slugs));
    memory.set(key, pending);
  }
  return pending;
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
  AsyncStorage.removeItem(STORAGE_PREFIX + key).catch(e =>
    log.warn('could not evict cached icon', e),
  );
}

/** Test hook: drop the in-memory cache. */
export function resetPlatformIconCache(): void {
  memory.clear();
}
