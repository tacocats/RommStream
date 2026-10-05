import { fetchCall, fetchMock, mockFetchOnce } from '../../testUtils/fetchMock';
import {
  DevicePairingError,
  pairingPrompt,
  startDeviceAuthorization,
  waitForDeviceApproval,
} from '../deviceAuth';
import { RommApiError } from '../types';

const SERVER = 'https://romm.test';
const FLOW = {
  device_code: 'device-secret',
  user_code: 'ABCD2345',
  verification_path: '/pair/device',
  verification_path_complete: '/pair/device?user_code=ABCD2345',
  expires_in: 600,
  interval: 0,
};
const APPROVED = {
  access_token: 'rmm_tok',
  device_id: 'device-1',
  scopes: ['roms.read'],
  expires_at: null,
};

const pending = () =>
  mockFetchOnce({ status: 400, body: { detail: 'authorization_pending' } });

describe('startDeviceAuthorization', () => {
  it('describes the device and asks for the scopes the app uses', async () => {
    mockFetchOnce({ status: 201, body: FLOW });

    await expect(
      startDeviceAuthorization(SERVER, {
        clientDeviceIdentifier: 'rommstream-abc',
        name: 'RommStream (Desktop)',
        platform: 'desktop',
      }),
    ).resolves.toEqual(FLOW);

    const [url, init] = fetchCall();
    expect(url).toBe(`${SERVER}/api/auth/device/init`);
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('omit');
    expect(JSON.parse(String(init?.body))).toEqual({
      client_device_identifier: 'rommstream-abc',
      name: 'RommStream (Desktop)',
      client: 'RommStream',
      platform: 'desktop',
      requested_scopes: [
        'me.read',
        'platforms.read',
        'roms.read',
        'collections.read',
        'roms.user.write',
      ],
    });
  });

  it("surfaces RomM's answer on a server without device pairing", async () => {
    mockFetchOnce({ status: 404, body: { detail: 'Not Found' } });

    await expect(
      startDeviceAuthorization(SERVER, {
        clientDeviceIdentifier: 'x',
        name: 'y',
        platform: 'desktop',
      }),
    ).rejects.toThrow('Not Found');
  });
});

describe('waitForDeviceApproval', () => {
  it('polls while approval is pending, then resolves with the token', async () => {
    pending();
    pending();
    mockFetchOnce({ body: APPROVED });

    await expect(waitForDeviceApproval(SERVER, FLOW)).resolves.toEqual(
      APPROVED,
    );
    expect(fetchMock()).toHaveBeenCalledTimes(3);
    expect(fetchCall(0)[0]).toBe(`${SERVER}/api/auth/device/token`);
    expect(JSON.parse(String(fetchCall(0)[1]?.body))).toEqual({
      device_code: 'device-secret',
    });
  });

  it('waits the interval RomM asks for, and longer after slow_down', async () => {
    jest.useFakeTimers();
    try {
      mockFetchOnce({ status: 400, body: { detail: 'slow_down' } });
      mockFetchOnce({ body: APPROVED });
      const approved = waitForDeviceApproval(SERVER, { ...FLOW, interval: 5 });

      await jest.advanceTimersByTimeAsync(4999);
      expect(fetchMock()).toHaveBeenCalledTimes(0);
      await jest.advanceTimersByTimeAsync(1);
      expect(fetchMock()).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(9999);
      expect(fetchMock()).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      await expect(approved).resolves.toEqual(APPROVED);
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects when the pairing is denied', async () => {
    mockFetchOnce({ status: 400, body: { detail: 'access_denied' } });

    const error = await waitForDeviceApproval(SERVER, FLOW).catch(e => e);
    expect(error).toBeInstanceOf(DevicePairingError);
    expect(error.reason).toBe('denied');
  });

  it('rejects when the code has expired', async () => {
    pending();
    mockFetchOnce({ status: 400, body: { detail: 'expired_token' } });

    const error = await waitForDeviceApproval(SERVER, FLOW).catch(e => e);
    expect(error).toBeInstanceOf(DevicePairingError);
    expect(error.reason).toBe('expired');
    expect(error.message).toBe(
      'The pairing code expired. Get a new one to try again.',
    );
  });

  it('passes other failures through', async () => {
    mockFetchOnce({ status: 429, body: { detail: 'Too many requests' } });

    await expect(waitForDeviceApproval(SERVER, FLOW)).rejects.toThrow(
      'Too many requests',
    );
  });

  it('stops polling when aborted', async () => {
    const controller = new AbortController();
    const approved = waitForDeviceApproval(
      SERVER,
      { ...FLOW, interval: 60 },
      controller.signal,
    );

    controller.abort();

    await expect(approved).rejects.toBeInstanceOf(RommApiError);
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});

it('builds the approval link on the server the app signed in to', () => {
  expect(pairingPrompt(SERVER, FLOW)).toEqual({
    userCode: 'ABCD2345',
    verificationUrl: `${SERVER}/pair/device?user_code=ABCD2345`,
    expiresInSeconds: 600,
  });
});
