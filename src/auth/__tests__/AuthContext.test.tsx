import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { fetchCall, mockFetchOnce } from '../../testUtils/fetchMock';
import { AuthProvider, useAuth } from '../AuthContext';
import {
  loadCredentials,
  loadTokens,
  saveCredentials,
  saveTokens,
} from '../secureStore';

const CLIENT_TOKEN = `rmm_${'a'.repeat(64)}`;

// interval 0: no waiting between polls in tests.
const FLOW = {
  device_code: 'device-secret',
  user_code: 'ABCD2345',
  verification_path: '/pair/device',
  verification_path_complete: '/pair/device?user_code=ABCD2345',
  expires_in: 600,
  interval: 0,
};

const APPROVED = {
  access_token: CLIENT_TOKEN,
  device_id: 'device-1',
  scopes: ['me.read', 'roms.read'],
  expires_at: null,
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

// RNTL's act hands back React's bare thenable, whose `then` returns
// undefined, so `expect(act(...)).resolves` / `.rejects` would not wait for
// it. Adopt it into a real Promise first.
function actAsync<T>(callback: () => Promise<T>): Promise<T> {
  return Promise.resolve(act(callback));
}

async function renderAuth() {
  const view = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(view.result.current.status).not.toBe('loading'));
  return view;
}

async function seedPaired() {
  await saveCredentials({
    serverUrl: 'https://romm.test',
    username: 'player',
    authMethod: 'pairing',
  });
  await saveTokens({ accessToken: CLIENT_TOKEN });
}

describe('AuthProvider', () => {
  describe('session restore', () => {
    it('is signed out when the keychain is empty', async () => {
      const { result } = await renderAuth();

      expect(result.current.status).toBe('signedOut');
      expect(result.current.serverUrl).toBe('');
      expect(result.current.accessToken).toBe('');
    });

    it('restores a paired session', async () => {
      await seedPaired();

      const { result } = await renderAuth();

      expect(result.current).toMatchObject({
        status: 'signedIn',
        serverUrl: 'https://romm.test',
        username: 'player',
        accessToken: CLIENT_TOKEN,
      });
    });

    it('discards a username and password sign-in from an older release', async () => {
      await saveCredentials({
        serverUrl: 'https://romm.test',
        username: 'player',
        password: 'pw',
      } as never);
      await saveTokens({
        accessToken: 'access-0',
        refreshToken: 'refresh-0',
      } as never);

      const { result } = await renderAuth();

      expect(result.current.status).toBe('signedOut');
      await expect(loadCredentials()).resolves.toBeNull();
      await expect(loadTokens()).resolves.toBeNull();
    });

    it('stays signed out when only credentials are stored', async () => {
      await saveCredentials({
        serverUrl: 'https://romm.test',
        username: 'player',
        authMethod: 'pairing',
      });

      const { result } = await renderAuth();

      expect(result.current.status).toBe('signedOut');
    });
  });

  describe('pairDevice', () => {
    it('shows the code, waits for approval and persists the issued token', async () => {
      const { result } = await renderAuth();
      mockFetchOnce({ status: 201, body: FLOW });
      mockFetchOnce({ status: 400, body: { detail: 'authorization_pending' } });
      mockFetchOnce({ body: APPROVED });
      mockFetchOnce({ body: { id: 1, username: 'player' } });
      const onPrompt = jest.fn();

      await act(() => result.current.pairDevice('romm.test/', { onPrompt }));

      const [initUrl, init] = fetchCall(0);
      expect(initUrl).toBe('https://romm.test/api/auth/device/init');
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        client: 'RommStream',
        requested_scopes: [
          'me.read',
          'platforms.read',
          'roms.read',
          'collections.read',
          'roms.user.write',
        ],
      });
      expect(body.client_device_identifier).toMatch(
        /^rommstream-[0-9a-f]{32}$/,
      );
      expect(onPrompt).toHaveBeenCalledWith({
        userCode: 'ABCD2345',
        verificationUrl: 'https://romm.test/pair/device?user_code=ABCD2345',
        expiresInSeconds: 600,
      });
      expect(fetchCall(1)[0]).toBe('https://romm.test/api/auth/device/token');
      expect(JSON.parse(String(fetchCall(2)[1]?.body))).toEqual({
        device_code: 'device-secret',
      });
      expect(fetchCall(3)[1]?.headers).toEqual({
        Authorization: `Bearer ${CLIENT_TOKEN}`,
      });
      expect(result.current).toMatchObject({
        status: 'signedIn',
        serverUrl: 'https://romm.test',
        username: 'player',
        accessToken: CLIENT_TOKEN,
      });
      await expect(loadCredentials()).resolves.toEqual({
        serverUrl: 'https://romm.test',
        username: 'player',
        authMethod: 'pairing',
      });
      await expect(loadTokens()).resolves.toEqual({
        accessToken: CLIENT_TOKEN,
      });
    });

    it('pairs again as the same device', async () => {
      const { result } = await renderAuth();
      for (let i = 0; i < 2; i++) {
        mockFetchOnce({ status: 201, body: FLOW });
        mockFetchOnce({ status: 400, body: { detail: 'access_denied' } });
        await actAsync(() =>
          result.current.pairDevice('romm.test', { onPrompt: jest.fn() }),
        ).catch(() => {});
      }

      const identifier = (call: number) =>
        JSON.parse(String(fetchCall(call)[1]?.body)).client_device_identifier;
      expect(identifier(2)).toBe(identifier(0));
    });

    it("falls back to the device's name when approval left out me.read", async () => {
      const { result } = await renderAuth();
      mockFetchOnce({ status: 201, body: FLOW });
      mockFetchOnce({ body: APPROVED });
      mockFetchOnce({ status: 403, body: { detail: 'Forbidden' } });

      await act(() =>
        result.current.pairDevice('romm.test', { onPrompt: jest.fn() }),
      );

      expect(result.current.status).toBe('signedIn');
      expect(result.current.username).toMatch(/^RommStream/);
    });

    it('persists nothing when the pairing is denied', async () => {
      const { result } = await renderAuth();
      mockFetchOnce({ status: 201, body: FLOW });
      mockFetchOnce({ status: 400, body: { detail: 'access_denied' } });

      await expect(
        actAsync(() =>
          result.current.pairDevice('romm.test', { onPrompt: jest.fn() }),
        ),
      ).rejects.toThrow('Pairing was denied in RomM.');

      expect(result.current.status).toBe('signedOut');
      await expect(loadCredentials()).resolves.toBeNull();
      await expect(loadTokens()).resolves.toBeNull();
    });
  });

  describe('signOut', () => {
    it('clears the keychain and returns to signed out', async () => {
      await seedPaired();
      const { result } = await renderAuth();

      await act(() => result.current.signOut());

      expect(result.current.status).toBe('signedOut');
      expect(result.current.accessToken).toBe('');
      await expect(loadCredentials()).resolves.toBeNull();
      await expect(loadTokens()).resolves.toBeNull();
    });
  });

  describe('withAuth', () => {
    it('runs the call with the current server URL and token', async () => {
      await seedPaired();
      const { result } = await renderAuth();
      const fn = jest.fn().mockResolvedValue('payload');

      await expect(actAsync(() => result.current.withAuth(fn))).resolves.toBe(
        'payload',
      );

      expect(fn).toHaveBeenCalledWith('https://romm.test', CLIENT_TOKEN);
    });

    it('passes failures through', async () => {
      await seedPaired();
      const { result } = await renderAuth();
      const fn = jest.fn().mockRejectedValue(new Error('Unauthorized'));

      await expect(actAsync(() => result.current.withAuth(fn))).rejects.toThrow(
        'Unauthorized',
      );
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});

describe('useAuth', () => {
  it('throws when used outside an AuthProvider', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(renderHook(() => useAuth())).rejects.toThrow(
      'useAuth must be used within an AuthProvider',
    );

    consoleError.mockRestore();
  });
});
