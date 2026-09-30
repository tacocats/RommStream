import { getDesktopBridge } from '../desktop/bridge';
import type { HardwareKey, HardwareKeyEvent } from './hardwareKeys';
import { keyboardKeysFor } from './web/keyboardMap';

/**
 * Where hardware key presses come from in the Electron build. Nothing here
 * listens for anything itself: src/input/web/desktopInput.ts turns keyboard,
 * gamepad and main-process key events into `offerHardwareKey` calls, and
 * whatever an intercepting handler doesn't take falls back to that module's
 * default handling (spatial navigation, Back = go back, …).
 */

let intercepted = new Set<HardwareKey>();
let dispatcher: ((event: HardwareKeyEvent) => boolean) | null = null;

export function setInterceptedKeys(keys: HardwareKey[]): void {
  intercepted = new Set(keys);
  // While a game runs, keys go to its webview — a separate web contents the
  // renderer never hears from — so the main process has to take them off it.
  // Backspace stays with the game: it's Back only outside text entry, and a
  // web page is free to use it for anything.
  getDesktopBridge()?.setInterceptedKeys(
    keyboardKeysFor(keys).filter(key => key !== 'Backspace'),
  );
}

export function listen(
  dispatch: (event: HardwareKeyEvent) => boolean,
): () => void {
  dispatcher = dispatch;
  return () => {
    if (dispatcher === dispatch) {
      dispatcher = null;
    }
  };
}

/** Hand `key` to the intercepting handlers; true if one of them took it. */
export function offerHardwareKey(key: HardwareKey, keyCode = 0): boolean {
  if (!dispatcher || !intercepted.has(key)) {
    return false;
  }
  return dispatcher({ key, keyCode });
}
