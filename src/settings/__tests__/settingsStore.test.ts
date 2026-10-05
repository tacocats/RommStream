import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_IN_BROWSER_PLAY_ENABLED,
  getDeviceIdentifier,
  getInBrowserPlayEnabled,
  setInBrowserPlayEnabled,
} from '../settingsStore';

describe('persisted settings', () => {
  it('defaults to in-browser play off', async () => {
    expect(DEFAULT_IN_BROWSER_PLAY_ENABLED).toBe(false);
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

  it('makes up a device identifier once and keeps it', async () => {
    const first = await getDeviceIdentifier();

    expect(first).toMatch(/^rommstream-[0-9a-f]{32}$/);
    await expect(getDeviceIdentifier()).resolves.toBe(first);
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  });

  it('ignores in-browser play saved on before it defaulted off', async () => {
    await AsyncStorage.setItem('rommstream.inBrowserPlayEnabled.v1', 'true');

    await expect(getInBrowserPlayEnabled()).resolves.toBe(false);
  });
});
