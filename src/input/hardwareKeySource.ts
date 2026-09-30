import { DeviceEventEmitter } from 'react-native';
import NativeKeyEvents from '../native/NativeKeyEvents';
import type { HardwareKey, HardwareKeyEvent } from './hardwareKeys';

/**
 * Where hardware key presses come from on Android: `MainActivity` swallows
 * the keys it's told about and re-emits them over RCTDeviceEventEmitter.
 * The web (Electron) build swaps this file for hardwareKeySource.web.ts.
 */

/** Must match `KeyEventBridge.EVENT_NAME` on the Android side. */
const KEY_EVENT = 'rommstream.hardwareKey';

export function setInterceptedKeys(keys: HardwareKey[]): void {
  NativeKeyEvents?.setInterceptedKeys(keys);
}

/**
 * Deliver presses of intercepted keys to `dispatch` until the returned
 * function is called. `dispatch` reports whether a handler took the key; on
 * Android the key is already swallowed by then, so that goes unused here.
 */
export function listen(
  dispatch: (event: HardwareKeyEvent) => boolean,
): () => void {
  const subscription = DeviceEventEmitter.addListener(KEY_EVENT, dispatch);
  return () => subscription.remove();
}
