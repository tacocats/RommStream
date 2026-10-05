import { fetchCall, fetchMock, mockFetchOnce } from '../../testUtils/fetchMock';
import { startStreamingSession } from '../streamingSession';
import { MemoryCardImportRequiredError } from '../types';

const SERVER = 'https://romm.test';
const LAUNCHING = {
  platform: 'ps2',
  container: 'romm-pcsx2',
  label: 'PCSX2',
  rom_name: 'Okami',
  claimed_at: '2026-10-01T12:00:00Z',
};
const ACTIVE = { status: 'active', platform: 'ps2' };

/** Let the claim and first poll settle. */
async function flush() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

it('claims the rom, then polls its status until the room is up', async () => {
  mockFetchOnce({ status: 202, body: LAUNCHING });
  mockFetchOnce({ body: ACTIVE });
  mockFetchOnce({ body: { ...ACTIVE, extraction_phase: 'extracting' } });
  mockFetchOnce({ body: { ...ACTIVE, host: '/stream/room/abc' } });
  const onPhase = jest.fn();

  const session = await startStreamingSession(SERVER, 'rmm_tok', 42, {
    pollIntervalMs: 0,
    stateId: 3,
    onPhase,
  });

  expect(session).toMatchObject({
    url: `${SERVER}/stream/room/abc`,
    platform: 'ps2',
    container: 'romm-pcsx2',
  });
  expect(onPhase).toHaveBeenCalledWith('extracting');
  expect(fetchCall(0)[0]).toBe(`${SERVER}/api/streaming/sessions`);
  expect(JSON.parse(String(fetchCall(0)[1]?.body))).toEqual({
    rom_id: 42,
    state_id: 3,
  });
  expect(fetchCall(1)[0]).toBe(`${SERVER}/api/streaming/sessions/ps2/status`);
  expect(fetchCall(1)[1]?.headers).toEqual({
    Authorization: 'Bearer rmm_tok',
  });
  expect(fetchMock()).toHaveBeenCalledTimes(4);
});

it('rejects with the reason and releases when the launch gives up', async () => {
  mockFetchOnce({ status: 202, body: LAUNCHING });
  mockFetchOnce({
    body: {
      status: 'ended',
      platform: 'ps2',
      termination: { reason: 'Emulator crashed' },
    },
  });
  mockFetchOnce({ body: { status: 'released' } });

  await expect(
    startStreamingSession(SERVER, 'rmm_tok', 42, { pollIntervalMs: 0 }),
  ).rejects.toThrow('Emulator crashed');
  const [url, init] = fetchCall(2);
  expect(url).toBe(
    `${SERVER}/api/streaming/sessions/ps2?container=romm-pcsx2&save=false`,
  );
  expect(init?.method).toBe('DELETE');
});

it('times out and releases the container', async () => {
  mockFetchOnce({ status: 202, body: LAUNCHING });
  mockFetchOnce({ body: ACTIVE });
  mockFetchOnce({ body: { status: 'released' } });

  await expect(
    startStreamingSession(SERVER, 'rmm_tok', 42, { timeoutMs: 0 }),
  ).rejects.toThrow('Timed out waiting for the stream');
  expect(fetchCall(2)[1]?.method).toBe('DELETE');
});

it('can be cancelled between polls', async () => {
  mockFetchOnce({ status: 202, body: LAUNCHING });
  mockFetchOnce({ body: ACTIVE });
  mockFetchOnce({ body: { status: 'released' } });
  const controller = new AbortController();
  const started = startStreamingSession(SERVER, 'rmm_tok', 42, {
    pollIntervalMs: 60_000,
    signal: controller.signal,
  });
  await flush();

  controller.abort();

  await expect(started).rejects.toThrow('Stream launch cancelled');
  expect(fetchMock()).toHaveBeenCalledTimes(3);
  expect(fetchCall(2)[1]?.method).toBe('DELETE');
});

it('keeps an absolute room URL as it is', async () => {
  mockFetchOnce({ status: 202, body: LAUNCHING });
  mockFetchOnce({ body: { ...ACTIVE, host: 'https://stream.test/room/abc' } });

  const session = await startStreamingSession(SERVER, 'rmm_tok', 42);

  expect(session.url).toBe('https://stream.test/room/abc');
});

it('passes a memory card prompt through without releasing anything', async () => {
  mockFetchOnce({
    status: 428,
    body: { code: 'memory_card_import_required', outcome: 'found' },
  });

  await expect(
    startStreamingSession(SERVER, 'rmm_tok', 42),
  ).rejects.toBeInstanceOf(MemoryCardImportRequiredError);
  expect(fetchMock()).toHaveBeenCalledTimes(1);
});

it('does nothing when already cancelled', async () => {
  const controller = new AbortController();
  controller.abort();

  await expect(
    startStreamingSession(SERVER, 'rmm_tok', 42, { signal: controller.signal }),
  ).rejects.toThrow('Stream launch cancelled');
  expect(fetchMock()).not.toHaveBeenCalled();
});
