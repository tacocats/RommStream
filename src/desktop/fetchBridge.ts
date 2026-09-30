import type {
  DesktopFetchRequest,
  RommStreamDesktopApi,
} from '../../electron/api';

/**
 * React Native's fetch has no CORS; a browser's does, and RomM doesn't send
 * CORS headers for arbitrary origins. So in Electron, requests to other
 * origins (the RomM API, platform icon probes) are made by the main process
 * instead — the app code keeps calling plain fetch() and doesn't know.
 *
 * Only what the app actually sends is supported: string or URLSearchParams
 * bodies. Anything else, and same-origin requests, go to the browser's own
 * fetch.
 */

const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

function toHeaderRecord(headers: HeadersInit | undefined) {
  const record: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

function toRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): DesktopFetchRequest | null {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    // The app never builds Request objects; leave them to the browser.
    return null;
  }
  const url = new URL(String(input), window.location.href);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  if (url.origin === window.location.origin) {
    return null;
  }
  const body = init?.body;
  if (body != null && typeof body !== 'string') {
    if (!(body instanceof URLSearchParams)) {
      return null;
    }
  }
  const headers = toHeaderRecord(init?.headers);
  if (body instanceof URLSearchParams && !headers['content-type']) {
    headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
  }
  return {
    url: url.toString(),
    method: (init?.method ?? 'GET').toUpperCase(),
    headers,
    body: body == null ? null : String(body),
  };
}

export function createBridgedFetch(
  bridge: RommStreamDesktopApi,
  browserFetch: typeof fetch,
): typeof fetch {
  return async (input, init) => {
    const request = toRequest(input, init);
    if (!request) {
      return browserFetch(input, init);
    }
    let result;
    try {
      result = await bridge.fetch(request);
    } catch (e) {
      // Match what a failed browser fetch looks like.
      throw new TypeError(
        `Network request failed: ${e instanceof Error ? e.message : e}`,
      );
    }
    const response = new Response(
      NULL_BODY_STATUSES.has(result.status)
        ? null
        : (result.body as Uint8Array<ArrayBuffer> | null),
      {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
      },
    );
    Object.defineProperty(response, 'url', { value: result.url });
    return response;
  };
}

/** Route cross-origin fetch() calls through the main process. */
export function installFetchBridge(bridge: RommStreamDesktopApi): void {
  globalThis.fetch = createBridgedFetch(
    bridge,
    globalThis.fetch.bind(globalThis),
  );
}
