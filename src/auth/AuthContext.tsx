import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import {
  DevicePairingPrompt,
  pairingPrompt,
  startDeviceAuthorization,
  waitForDeviceApproval,
} from '../api/deviceAuth';
import { getCurrentUser, normalizeServerUrl } from '../api/rommClient';
import { getDeviceIdentifier } from '../settings/settingsStore';
import { createLogger } from '../utils/logger';
import {
  clearAll,
  loadCredentials,
  loadTokens,
  saveCredentials,
  saveTokens,
} from './secureStore';

const log = createLogger('auth');

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  serverUrl: string;
  username: string;
  /** This device's client API token, issued when it was paired. */
  accessToken: string;
}

interface AuthContextValue extends AuthState {
  /**
   * Sign in by pairing this device: RomM hands out a code, `onPrompt` shows
   * it, and once someone signed in to RomM approves it there, RomM issues
   * this device its own client API token. Abort `signal` to give up.
   */
  pairDevice: (
    serverUrl: string,
    options: {
      onPrompt: (prompt: DevicePairingPrompt) => void;
      signal?: AbortSignal;
    },
  ) => Promise<void>;
  signOut: () => Promise<void>;
  /** Runs an API call with the current server URL and token. */
  withAuth: <T>(
    fn: (serverUrl: string, accessToken: string) => Promise<T>,
  ) => Promise<T>;
}

// How this device shows up on RomM's approval page and device list.
const DEVICE_PLATFORM = Platform.OS === 'web' ? 'desktop' : Platform.OS;
const DEVICE_NAME =
  Platform.OS === 'android'
    ? 'RommStream (Android TV)'
    : 'RommStream (Desktop)';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const initialState: AuthState = {
  status: 'loading',
  serverUrl: '',
  username: '',
  accessToken: '',
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);

  useEffect(() => {
    (async () => {
      const [creds, tokens] = await Promise.all([
        loadCredentials(),
        loadTokens(),
      ]);
      if (creds?.authMethod === 'pairing' && tokens) {
        setState({
          status: 'signedIn',
          serverUrl: creds.serverUrl,
          username: creds.username,
          accessToken: tokens.accessToken,
        });
        return;
      }
      if (creds || tokens) {
        // A sign-in from before pairing was the only way in: username and
        // password, which the app no longer keeps. Pair instead.
        log.info('discarding a password sign-in; this device must be paired');
        await clearAll();
      }
      setState(prev => ({ ...prev, status: 'signedOut' }));
    })().catch(e => {
      // Unreadable storage shouldn't strand the app on the loading screen.
      log.error('failed to restore the saved sign-in', e);
      setState(prev => ({ ...prev, status: 'signedOut' }));
    });
  }, []);

  const pairDevice = useCallback<AuthContextValue['pairDevice']>(
    async (rawServerUrl, { onPrompt, signal }) => {
      const serverUrl = normalizeServerUrl(rawServerUrl);
      const flow = await startDeviceAuthorization(serverUrl, {
        clientDeviceIdentifier: await getDeviceIdentifier(),
        name: DEVICE_NAME,
        platform: DEVICE_PLATFORM,
      });
      onPrompt(pairingPrompt(serverUrl, flow));
      const token = await waitForDeviceApproval(serverUrl, flow, signal);
      const accessToken = token.access_token;

      // Only for display (the sidebar's initial). Approval can leave me.read
      // off the token, and then this device's name stands in.
      const username = await getCurrentUser(serverUrl, accessToken).then(
        user => user.username,
        e => {
          log.warn('could not look up the paired token owner', e);
          return DEVICE_NAME;
        },
      );

      await saveCredentials({ serverUrl, username, authMethod: 'pairing' });
      await saveTokens({ accessToken });

      setState({ status: 'signedIn', serverUrl, username, accessToken });
    },
    [],
  );

  const signOut = useCallback(async () => {
    await clearAll();
    setState({ ...initialState, status: 'signedOut' });
  }, []);

  const withAuth = useCallback(
    <T,>(fn: (serverUrl: string, accessToken: string) => Promise<T>) =>
      fn(state.serverUrl, state.accessToken),
    [state.serverUrl, state.accessToken],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, pairDevice, signOut, withAuth }),
    [state, pairDevice, signOut, withAuth],
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
