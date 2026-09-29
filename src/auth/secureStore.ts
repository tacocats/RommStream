import * as Keychain from 'react-native-keychain';
import { createLogger } from '../utils/logger';

const log = createLogger('secureStore');

// Two separate keychain entries: one for the RomM credentials (needed again
// later to authenticate the WebView session), one for the current tokens.
const CREDENTIALS_SERVICE = 'com.rommstream.credentials';
const TOKENS_SERVICE = 'com.rommstream.tokens';

export interface StoredCredentials {
  serverUrl: string;
  username: string;
  password: string;
}

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export async function saveCredentials(creds: StoredCredentials): Promise<void> {
  await Keychain.setGenericPassword(creds.username, JSON.stringify(creds), {
    service: CREDENTIALS_SERVICE,
  });
}

export async function loadCredentials(): Promise<StoredCredentials | null> {
  const result = await Keychain.getGenericPassword({
    service: CREDENTIALS_SERVICE,
  });
  if (!result) {
    return null;
  }
  try {
    return JSON.parse(result.password) as StoredCredentials;
  } catch (e) {
    log.warn('stored value is not valid JSON, ignoring it', e);
    return null;
  }
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await Keychain.setGenericPassword('tokens', JSON.stringify(tokens), {
    service: TOKENS_SERVICE,
  });
}

export async function loadTokens(): Promise<StoredTokens | null> {
  const result = await Keychain.getGenericPassword({ service: TOKENS_SERVICE });
  if (!result) {
    return null;
  }
  try {
    return JSON.parse(result.password) as StoredTokens;
  } catch (e) {
    log.warn('stored value is not valid JSON, ignoring it', e);
    return null;
  }
}

export async function clearAll(): Promise<void> {
  await Keychain.resetGenericPassword({ service: CREDENTIALS_SERVICE });
  await Keychain.resetGenericPassword({ service: TOKENS_SERVICE });
}
