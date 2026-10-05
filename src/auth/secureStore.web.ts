import { getDesktopBridge } from '../desktop/bridge';
import { createLogger } from '../utils/logger';

/**
 * Web (Electron) counterpart of secureStore.ts. The main process encrypts
 * each entry with the OS keychain via Electron's safeStorage (see
 * electron/secureStore.ts). The same two entries as the native build are kept:
 * where the app is signed in, and the device's client API token.
 *
 * Outside Electron (`npm run dev:web` in a browser) there's no keychain to
 * reach, so values fall back to localStorage — fine for development against
 * a test server, and never used by a packaged build.
 */

const log = createLogger('secureStore');

const CREDENTIALS_SERVICE = 'com.rommstream.credentials';
const TOKENS_SERVICE = 'com.rommstream.tokens';

export interface StoredCredentials {
  serverUrl: string;
  /** Only for display. */
  username: string;
  /**
   * 'pairing' for a paired device. Missing on sign-ins saved by older
   * releases (username and password), which are discarded.
   */
  authMethod?: 'pairing';
}

export interface StoredTokens {
  /** The device's client API token. */
  accessToken: string;
}

let warnedAboutFallback = false;

const store = {
  async get(key: string): Promise<string | null> {
    const bridge = getDesktopBridge();
    if (bridge) {
      return bridge.secureStore.get(key);
    }
    warnFallback();
    return localStorage.getItem(key);
  },
  async set(key: string, value: string): Promise<void> {
    const bridge = getDesktopBridge();
    if (bridge) {
      return bridge.secureStore.set(key, value);
    }
    warnFallback();
    localStorage.setItem(key, value);
  },
  async delete(key: string): Promise<void> {
    const bridge = getDesktopBridge();
    if (bridge) {
      return bridge.secureStore.delete(key);
    }
    localStorage.removeItem(key);
  },
};

function warnFallback() {
  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    log.warn('not running in Electron; credentials go to localStorage');
  }
}

async function loadJson<T>(key: string): Promise<T | null> {
  const raw = await store.get(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    log.warn('stored value is not valid JSON, ignoring it', e);
    return null;
  }
}

export async function saveCredentials(creds: StoredCredentials): Promise<void> {
  await store.set(CREDENTIALS_SERVICE, JSON.stringify(creds));
}

export function loadCredentials(): Promise<StoredCredentials | null> {
  return loadJson<StoredCredentials>(CREDENTIALS_SERVICE);
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await store.set(TOKENS_SERVICE, JSON.stringify(tokens));
}

export function loadTokens(): Promise<StoredTokens | null> {
  return loadJson<StoredTokens>(TOKENS_SERVICE);
}

export async function clearAll(): Promise<void> {
  await store.delete(CREDENTIALS_SERVICE);
  await store.delete(TOKENS_SERVICE);
}
