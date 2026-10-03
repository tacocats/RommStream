import { io } from 'socket.io-client';
import { fetchCall, fetchMock, mockFetchOnce } from '../../testUtils/fetchMock';
import { ensureRommSession } from '../rommClient';
import { startStreamingSession } from '../streamingSession';
import { MemoryCardImportRequiredError, RommApiError } from '../types';

type Handler = (...args: any[]) => void;

// Just enough of a socket.io client to drive the launch from a test: `emit`
// delivers a server event to whatever the module registered.
class FakeSocket {
  handlers = new Map<string, Handler[]>();
  connected = false;
  disconnect = jest.fn();
  failConnect: Error | null = null;

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }

  once(event: string, handler: Handler) {
    return this.on(event, handler);
  }

  connect() {
    Promise.resolve().then(() => {
      if (this.failConnect) {
        this.emit('connect_error', this.failConnect);
      } else {
        this.connected = true;
        this.emit('connect');
      }
    });
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    (this.handlers.get(event) ?? []).forEach(handler => handler(...args));
  }
}

let mockSocket: FakeSocket;

jest.mock('socket.io-client', () => ({
  WebSocket: 'WebSocketTransport',
  io: jest.fn(() => mockSocket),
}));

const SERVER = 'https://romm.test';
const LOGIN = { username: 'player', password: 'p@ss', loginPath: '/api/login' };

// The cookie login is ensureRommSession's own concern (see its tests); here
// it just succeeds, leaving fetch to the claim and release calls.
jest.mock('../rommClient', () => ({
  ...jest.requireActual('../rommClient'),
  ensureRommSession: jest.fn(),
}));
const mockedEnsureRommSession = jest.mocked(ensureRommSession);
const LAUNCHING = {
  platform: 'ps2',
  container: 'romm-pcsx2',
  label: 'PCSX2',
  rom_name: 'Okami',
  claimed_at: '2026-10-01T12:00:00Z',
};

/** Let the connect + claim round trips settle. */
async function flush() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  mockSocket = new FakeSocket();
  mockedEnsureRommSession.mockResolvedValue(undefined);
});

it('connects over a WebSocket on the login session cookie', async () => {
  mockFetchOnce({ status: 202, body: LAUNCHING });
  const started = startStreamingSession(SERVER, 'tok', 42, { login: LOGIN });
  await flush();
  mockSocket.emit('streaming:launch-ready', {
    container: 'romm-pcsx2',
    platform: 'ps2',
    host: 'https://stream.test/room/abc',
  });
  await started;

  expect(io).toHaveBeenCalledWith(
    SERVER,
    expect.objectContaining({
      path: '/ws/socket.io/',
      transports: ['WebSocketTransport'],
    }),
  );
  // An expired bearer token fails RomM's socket handshake outright.
  expect(jest.mocked(io).mock.calls[0][1]).not.toHaveProperty('extraHeaders');
  expect(mockedEnsureRommSession).toHaveBeenCalledWith(SERVER, LOGIN);
});

it('fails without connecting when RomM rejects the session login', async () => {
  mockedEnsureRommSession.mockRejectedValueOnce(
    new RommApiError('Incorrect username or password', 401),
  );

  await expect(
    startStreamingSession(SERVER, 'tok', 42, { login: LOGIN }),
  ).rejects.toThrow('Incorrect username or password');
  expect(io).not.toHaveBeenCalled();
  expect(fetchMock()).not.toHaveBeenCalled();
});

it('claims the rom and resolves with the room URL for its container', async () => {
  mockFetchOnce({ status: 202, body: LAUNCHING });
  const started = startStreamingSession(SERVER, 'tok', 42, {
    login: LOGIN,
    stateId: 3,
  });
  await flush();

  expect(JSON.parse(String(fetchCall()[1]?.body))).toEqual({
    rom_id: 42,
    state_id: 3,
  });

  // Someone else's launch on another container is not ours.
  mockSocket.emit('streaming:launch-ready', {
    container: 'romm-other',
    platform: 'ps2',
    host: 'https://stream.test/room/other',
  });
  mockSocket.emit('streaming:launch-ready', {
    container: 'romm-pcsx2',
    platform: 'ps2',
    host: 'https://stream.test/room/abc',
    resume: true,
  });

  await expect(started).resolves.toEqual({
    url: 'https://stream.test/room/abc',
    platform: 'ps2',
    container: 'romm-pcsx2',
    label: 'PCSX2',
    romName: 'Okami',
    resumed: true,
  });
  expect(mockSocket.disconnect).toHaveBeenCalled();
});

it('catches a launch that is ready before the claim answers', async () => {
  let answerClaim: (value: unknown) => void = () => {};
  fetchMock().mockReturnValueOnce(
    new Promise(resolve => {
      answerClaim = resolve;
    }),
  );
  const started = startStreamingSession(SERVER, 'tok', 42, { login: LOGIN });
  await flush();

  mockSocket.emit('streaming:launch-ready', {
    container: 'romm-pcsx2',
    platform: 'ps2',
    host: '/stream/room/abc',
    resume: false,
  });
  answerClaim({
    ok: true,
    status: 202,
    text: async () => JSON.stringify(LAUNCHING),
  });

  await expect(started).resolves.toMatchObject({
    // A relative room URL is resolved against the server.
    url: `${SERVER}/stream/room/abc`,
    resumed: false,
  });
});

it('reports launch phases for its container', async () => {
  mockFetchOnce({ status: 202, body: LAUNCHING });
  const onPhase = jest.fn();
  const started = startStreamingSession(SERVER, 'tok', 42, {
    login: LOGIN,
    onPhase,
  });
  await flush();

  mockSocket.emit('streaming:launch-phase', {
    container: 'romm-pcsx2',
    platform: 'ps2',
    phase: 'extracting',
  });
  mockSocket.emit('streaming:launch-phase', {
    container: 'romm-other',
    platform: 'ps2',
    phase: 'ignored',
  });
  mockSocket.emit('streaming:launch-ready', {
    container: 'romm-pcsx2',
    platform: 'ps2',
    host: 'https://stream.test/room/abc',
  });
  await started;

  expect(onPhase.mock.calls).toEqual([['extracting']]);
});

it('rejects with the detail and releases the container when the launch fails', async () => {
  mockFetchOnce({ status: 202, body: LAUNCHING });
  mockFetchOnce({ body: { status: 'released' } });
  const started = startStreamingSession(SERVER, 'tok', 42, { login: LOGIN });
  await flush();

  mockSocket.emit('streaming:launch-failed', {
    container: 'romm-pcsx2',
    platform: 'ps2',
    detail: 'Emulator crashed',
  });

  await expect(started).rejects.toThrow('Emulator crashed');
  const [url, init] = fetchCall(1);
  expect(url).toBe(
    `${SERVER}/api/streaming/sessions/ps2?container=romm-pcsx2&save=false`,
  );
  expect(init?.method).toBe('DELETE');
  expect(mockSocket.disconnect).toHaveBeenCalled();
});

it('times out and releases the container', async () => {
  jest.useFakeTimers();
  try {
    mockFetchOnce({ status: 202, body: LAUNCHING });
    mockFetchOnce({ body: { status: 'released' } });
    const started = startStreamingSession(SERVER, 'tok', 42, {
      login: LOGIN,
      timeoutMs: 1000,
    });
    const outcome = started.catch(e => e);
    await flush();

    jest.advanceTimersByTime(1000);

    const error = await outcome;
    expect(error).toBeInstanceOf(RommApiError);
    expect(error.message).toBe('Timed out waiting for the stream');
    expect(fetchCall(1)[1]?.method).toBe('DELETE');
  } finally {
    jest.useRealTimers();
  }
});

it('can be cancelled with an abort signal', async () => {
  mockFetchOnce({ status: 202, body: LAUNCHING });
  mockFetchOnce({ body: { status: 'released' } });
  const controller = new AbortController();
  const started = startStreamingSession(SERVER, 'tok', 42, {
    login: LOGIN,
    signal: controller.signal,
  });
  await flush();

  controller.abort();

  await expect(started).rejects.toThrow('Stream launch cancelled');
  expect(fetchCall(1)[1]?.method).toBe('DELETE');
});

it('passes a memory card prompt through without releasing anything', async () => {
  mockFetchOnce({
    status: 428,
    body: { code: 'memory_card_import_required', outcome: 'found' },
  });

  await expect(
    startStreamingSession(SERVER, 'tok', 42, { login: LOGIN }),
  ).rejects.toBeInstanceOf(MemoryCardImportRequiredError);
  expect(fetchMock()).toHaveBeenCalledTimes(1);
  expect(mockSocket.disconnect).toHaveBeenCalled();
});

it('fails without claiming when the socket cannot connect', async () => {
  mockSocket.failConnect = new Error('xhr poll error');

  await expect(
    startStreamingSession(SERVER, 'tok', 42, { login: LOGIN }),
  ).rejects.toThrow(
    "Could not connect to RomM's live updates (xhr poll error)",
  );
  expect(fetchMock()).not.toHaveBeenCalled();
});
