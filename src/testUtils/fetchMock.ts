// Helpers for the global fetch mock installed in jest.setupAfterEnv.js.

export interface MockResponseInit {
  status?: number;
  statusText?: string;
  /** JSON-serialised as the response body. */
  body?: unknown;
  /** Raw body text; takes precedence over `body`. */
  text?: string;
}

export function mockResponse({
  status = 200,
  statusText = '',
  body,
  text,
}: MockResponseInit = {}): Response {
  const payload =
    text !== undefined ? text : body === undefined ? '' : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => payload,
    json: async () => JSON.parse(payload),
  } as unknown as Response;
}

export function fetchMock(): jest.Mock {
  return globalThis.fetch as unknown as jest.Mock;
}

/** Queue one response for the next fetch call. */
export function mockFetchOnce(init: MockResponseInit = {}): void {
  fetchMock().mockResolvedValueOnce(mockResponse(init));
}

/** The `[url, init]` pair of the n-th fetch call. */
export function fetchCall(index = 0): [string, RequestInit | undefined] {
  const call = fetchMock().mock.calls[index];
  if (!call) {
    throw new Error(
      `fetch was called ${
        fetchMock().mock.calls.length
      } times; no call #${index}`,
    );
  }
  return call as [string, RequestInit | undefined];
}

// React Native's TypeScript config types URL / URLSearchParams as RN's own
// slimmed-down polyfills, so the WHATWG globals available in Jest are
// narrowed here to the parts the tests use.
export interface SearchParams {
  get(name: string): string | null;
  has(name: string): boolean;
}

export interface ParsedUrl {
  origin: string;
  pathname: string;
  searchParams: SearchParams;
}

type WhatwgUrl = new (url: string) => ParsedUrl;

/** The n-th fetch call's URL, parsed. */
export function fetchUrl(index = 0): ParsedUrl {
  const Url = (globalThis as unknown as { URL: WhatwgUrl }).URL;
  return new Url(fetchCall(index)[0]);
}
