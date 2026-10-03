/**
 * @jest-environment node
 */
// Node, not jsdom: it has the real fetch Response/Headers classes.
import type { RommStreamDesktopApi } from '../../bridge';
import { createBridgedFetch } from '../../fetchBridge';

const APP_ORIGIN = 'http://localhost:5173';

beforeAll(() => {
  (globalThis as { window?: unknown }).window = {
    location: { href: `${APP_ORIGIN}/index.html`, origin: APP_ORIGIN },
  };
});

afterAll(() => {
  delete (globalThis as { window?: unknown }).window;
});

function setUp() {
  const bridge = {
    fetch: jest.fn(async () => ({
      url: 'https://romm.example/api/platforms',
      status: 200,
      statusText: 'OK',
      headers: [['content-type', 'application/json']],
      body: new TextEncoder().encode('[{"id":1}]'),
    })),
  } as unknown as RommStreamDesktopApi;
  const browserFetch = jest.fn(async () => new Response('local'));
  return {
    bridge,
    browserFetch,
    fetch: createBridgedFetch(bridge, browserFetch as typeof fetch),
  };
}

describe('createBridgedFetch', () => {
  it('sends cross-origin requests through the main process', async () => {
    const { bridge, browserFetch, fetch } = setUp();

    const response = await fetch('https://romm.example/api/platforms', {
      headers: { Authorization: 'Bearer token' },
    });

    expect(bridge.fetch).toHaveBeenCalledWith({
      url: 'https://romm.example/api/platforms',
      method: 'GET',
      headers: { authorization: 'Bearer token' },
      body: null,
    });
    expect(browserFetch).not.toHaveBeenCalled();
    expect(response.ok).toBe(true);
    expect(response.url).toBe('https://romm.example/api/platforms');
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toEqual([{ id: 1 }]);
  });

  it('sends form bodies with their content type', async () => {
    const { bridge, fetch } = setUp();

    await fetch('https://romm.example/api/token', {
      method: 'post',
      body: new URLSearchParams({ grant_type: 'password' }),
    });

    expect(bridge.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        body: 'grant_type=password',
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
      }),
    );
  });

  it("asks the main process for its session's cookies on credentials: include", async () => {
    const { bridge, fetch } = setUp();

    await fetch('https://romm.example/api/login', {
      method: 'POST',
      credentials: 'include',
    });
    await fetch('https://romm.example/api/platforms', { credentials: 'omit' });

    expect(jest.mocked(bridge.fetch).mock.calls[0][0]).toMatchObject({
      credentials: 'include',
    });
    expect(jest.mocked(bridge.fetch).mock.calls[1][0]).not.toHaveProperty(
      'credentials',
    );
  });

  it('leaves same-origin requests to the browser', async () => {
    const { bridge, browserFetch, fetch } = setUp();

    await fetch('/assets/logo.svg');

    expect(browserFetch).toHaveBeenCalled();
    expect(bridge.fetch).not.toHaveBeenCalled();
  });

  it('gives a body-less response for 204', async () => {
    const { bridge, fetch } = setUp();
    jest.mocked(bridge.fetch).mockResolvedValueOnce({
      url: 'https://romm.example/x',
      status: 204,
      statusText: 'No Content',
      headers: [],
      body: new Uint8Array(),
    });

    const response = await fetch('https://romm.example/x');
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

  it('fails like a browser fetch when the request fails', async () => {
    const { bridge, fetch } = setUp();
    jest
      .mocked(bridge.fetch)
      .mockRejectedValueOnce(new Error('net::ERR_CONNECTION_REFUSED'));

    await expect(fetch('https://romm.example/x')).rejects.toThrow(TypeError);
  });
});
