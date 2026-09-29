import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  login as apiLogin,
  normalizeServerUrl,
  refreshAccessToken,
} from '../api/rommClient';
import { RommApiError } from '../api/types';
import { createLogger } from '../utils/logger';
import {
  clearAll,
  loadCredentials,
  loadTokens,
  saveCredentials,
  saveTokens,
  StoredCredentials,
} from './secureStore';

const log = createLogger('auth');

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  serverUrl: string;
  username: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

interface AuthContextValue extends AuthState {
  signIn: (
    serverUrl: string,
    username: string,
    password: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Runs an authenticated API call, transparently refreshing the access
   * token once and retrying if the first attempt comes back as 401.
   */
  withAuth: <T>(
    fn: (serverUrl: string, accessToken: string) => Promise<T>,
  ) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const initialState: AuthState = {
  status: 'loading',
  serverUrl: '',
  username: '',
  password: '',
  accessToken: '',
  refreshToken: '',
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);

  useEffect(() => {
    (async () => {
      const [creds, tokens] = await Promise.all([
        loadCredentials(),
        loadTokens(),
      ]);
      if (creds && tokens) {
        setState({
          status: 'signedIn',
          serverUrl: creds.serverUrl,
          username: creds.username,
          password: creds.password,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        });
      } else {
        setState(prev => ({ ...prev, status: 'signedOut' }));
      }
    })();
  }, []);

  const signIn = useCallback(
    async (rawServerUrl: string, username: string, password: string) => {
      const serverUrl = normalizeServerUrl(rawServerUrl);
      const tokenResponse = await apiLogin(serverUrl, username, password);

      const credentials: StoredCredentials = { serverUrl, username, password };
      await saveCredentials(credentials);
      await saveTokens({
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
      });

      setState({
        status: 'signedIn',
        serverUrl,
        username,
        password,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
      });
    },
    [],
  );

  const signOut = useCallback(async () => {
    await clearAll();
    setState({ ...initialState, status: 'signedOut' });
  }, []);

  const withAuth = useCallback(
    async <T,>(
      fn: (serverUrl: string, accessToken: string) => Promise<T>,
    ): Promise<T> => {
      try {
        return await fn(state.serverUrl, state.accessToken);
      } catch (error) {
        if (
          error instanceof RommApiError &&
          error.status === 401 &&
          state.refreshToken
        ) {
          log.info('access token expired, refreshing');
          let refreshed;
          try {
            refreshed = await refreshAccessToken(
              state.serverUrl,
              state.refreshToken,
            );
          } catch (refreshError) {
            log.error('token refresh failed', refreshError);
            throw refreshError;
          }
          await saveTokens({
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token,
          });
          setState(prev => ({
            ...prev,
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token,
          }));
          return await fn(state.serverUrl, refreshed.access_token);
        }
        throw error;
      }
    },
    [state.serverUrl, state.accessToken, state.refreshToken],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signIn, signOut, withAuth }),
    [state, signIn, signOut, withAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
