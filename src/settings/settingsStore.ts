import AsyncStorage from '@react-native-async-storage/async-storage';

// Keys are versioned: bumping one discards a saved value whose meaning or
// correct default changed, so it can't override a fix.
const IN_BROWSER_PLAY_ENABLED_KEY = 'rommstream.inBrowserPlayEnabled.v2';
const DEVICE_IDENTIFIER_KEY = 'rommstream.deviceIdentifier.v1';

// Off: RommStream only launches games through server streaming. The
// in-browser players (EmulatorJS, js-dos, PICO-8, Ruffle...) are kept behind
// this flag, with no Settings toggle, in case they come back.
export const DEFAULT_IN_BROWSER_PLAY_ENABLED = false;

export async function getInBrowserPlayEnabled(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(IN_BROWSER_PLAY_ENABLED_KEY);
  return stored === null ? DEFAULT_IN_BROWSER_PLAY_ENABLED : stored === 'true';
}

export async function setInBrowserPlayEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(IN_BROWSER_PLAY_ENABLED_KEY, String(enabled));
}

function randomHex(bytes: number): string {
  let out = '';
  for (let i = 0; i < bytes; i++) {
    out += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0');
  }
  return out;
}

/**
 * This install's identifier for RomM's device pairing, made up on first use.
 * Not a secret: it only lets pairing again update RomM's record of this
 * device rather than add another.
 */
export async function getDeviceIdentifier(): Promise<string> {
  const stored = await AsyncStorage.getItem(DEVICE_IDENTIFIER_KEY);
  if (stored) {
    return stored;
  }
  const created = `rommstream-${randomHex(16)}`;
  await AsyncStorage.setItem(DEVICE_IDENTIFIER_KEY, created);
  return created;
}
