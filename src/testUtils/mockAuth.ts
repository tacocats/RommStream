import type { useAuth } from '../auth/AuthContext';

export type AuthValue = ReturnType<typeof useAuth>;

/**
 * A signed-in auth context value for screens that call `useAuth()`. Tests
 * `jest.mock('../../auth/AuthContext')` and feed this to the mocked hook.
 */
export function createAuthValue(overrides: Partial<AuthValue> = {}): AuthValue {
  const serverUrl = overrides.serverUrl ?? 'https://romm.test';
  const accessToken = overrides.accessToken ?? 'access-token';

  const withAuth = jest.fn(
    (fn: (url: string, token: string) => Promise<unknown>) =>
      fn(serverUrl, accessToken),
  ) as unknown as AuthValue['withAuth'];

  return {
    status: 'signedIn',
    serverUrl,
    username: 'player',
    accessToken,
    pairDevice: jest.fn().mockResolvedValue(undefined),
    signOut: jest.fn().mockResolvedValue(undefined),
    withAuth,
    ...overrides,
  };
}
