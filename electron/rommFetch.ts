import { net } from 'electron';
import type { DesktopFetchRequest, DesktopFetchResponse } from './api';

/**
 * fetch() on the renderer's behalf (src/desktop/fetchBridge.ts), through
 * Chromium's network stack in the main process, where CORS doesn't apply.
 * Uses the default session, so trusted self-signed certificates (see
 * certificates.ts) work here too.
 */
export async function rommFetch(
  request: DesktopFetchRequest,
): Promise<DesktopFetchResponse> {
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`refusing to fetch ${url.protocol} URL`);
  }
  const response = await net.fetch(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body ?? undefined,
    // RomM answers some requests with redirects (e.g. to a trailing slash).
    redirect: 'follow',
  });
  const body = new Uint8Array(await response.arrayBuffer());
  return {
    url: response.url,
    status: response.status,
    statusText: response.statusText,
    headers: Array.from(response.headers.entries()),
    body,
  };
}
