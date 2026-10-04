import AsyncStorage from '@react-native-async-storage/async-storage';

// Keys are versioned: bumping one discards a saved value whose meaning or
// correct default changed, so it can't override a fix.
const LOGIN_PATH_KEY = 'rommstream.loginPath.v2';
const IN_BROWSER_PLAY_ENABLED_KEY = 'rommstream.inBrowserPlayEnabled.v2';

// Off: RommStream only launches games through server streaming. The
// in-browser players (EmulatorJS, js-dos, PICO-8, Ruffle...) are kept behind
// this flag, with no Settings toggle, in case they come back.
export const DEFAULT_IN_BROWSER_PLAY_ENABLED = false;

// The session-login endpoint the WebView calls (HTTP Basic) to pick up the
// session cookie RomM's web frontend needs. Verified against RomM's backend
// source (endpoints/auth.py mounted at /api), but kept editable in case a
// future release moves it.
export const DEFAULT_LOGIN_PATH = '/api/login';

export async function getLoginPath(): Promise<string> {
  const stored = await AsyncStorage.getItem(LOGIN_PATH_KEY);
  return stored ?? DEFAULT_LOGIN_PATH;
}

export async function setLoginPath(path: string): Promise<void> {
  await AsyncStorage.setItem(LOGIN_PATH_KEY, path);
}

export async function getInBrowserPlayEnabled(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(IN_BROWSER_PLAY_ENABLED_KEY);
  return stored === null ? DEFAULT_IN_BROWSER_PLAY_ENABLED : stored === 'true';
}

export async function setInBrowserPlayEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(IN_BROWSER_PLAY_ENABLED_KEY, String(enabled));
}
