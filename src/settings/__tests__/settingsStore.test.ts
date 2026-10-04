import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_IN_BROWSER_PLAY_ENABLED,
  DEFAULT_LOGIN_PATH,
  getInBrowserPlayEnabled,
  getLoginPath,
  setInBrowserPlayEnabled,
  setLoginPath,
} from '../settingsStore';

describe('persisted settings', () => {
  it('defaults to /api/login and in-browser play off', async () => {
    expect(DEFAULT_LOGIN_PATH).toBe('/api/login');
    expect(DEFAULT_IN_BROWSER_PLAY_ENABLED).toBe(false);
    await expect(getLoginPath()).resolves.toBe('/api/login');
    await expect(getInBrowserPlayEnabled()).resolves.toBe(false);
  });

  it('round-trips in-browser play under a versioned key', async () => {
    await setInBrowserPlayEnabled(true);

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'rommstream.inBrowserPlayEnabled.v2',
      'true',
    );
    await expect(getInBrowserPlayEnabled()).resolves.toBe(true);

    await setInBrowserPlayEnabled(false);
    await expect(getInBrowserPlayEnabled()).resolves.toBe(false);
  });

  it('round-trips the login path under a versioned key', async () => {
    await setLoginPath('/custom/login');

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'rommstream.loginPath.v2',
      '/custom/login',
    );
    await expect(getLoginPath()).resolves.toBe('/custom/login');
  });

  it('ignores values saved under an older key version', async () => {
    await AsyncStorage.setItem('rommstream.loginPath.v1', '/old/login');

    await expect(getLoginPath()).resolves.toBe('/api/login');
  });

  it('ignores in-browser play saved on before it defaulted off', async () => {
    await AsyncStorage.setItem('rommstream.inBrowserPlayEnabled.v1', 'true');

    await expect(getInBrowserPlayEnabled()).resolves.toBe(false);
  });
});
