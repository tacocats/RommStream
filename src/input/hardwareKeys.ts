import { useEffect, useRef } from 'react';
import { DeviceEventEmitter, EmitterSubscription } from 'react-native';
import NativeKeyEvents from '../native/NativeKeyEvents';

/**
 * Remote/controller keys the app can take for itself before anything else
 * sees them — the RN focus engine, react-native-tvos' TV events, and the
 * WebView the emulator runs in all sit downstream of the interception point
 * (`MainActivity.dispatchKeyEvent`), so an intercepted key never reaches the
 * page at all.
 *
 * HOME and the recents key aren't here because Android keeps them: the system
 * acts on them without ever delivering them to the app, and no amount of
 * native code changes that. Volume is left out deliberately rather than
 * technically — swallowing it would just break the TV's volume.
 *
 * Android only. On every other platform the native module is absent and
 * everything below quietly does nothing.
 */
export type HardwareKey =
  | 'back'
  | 'menu'
  | 'info'
  | 'guide'
  | 'select'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'playPause'
  | 'play'
  | 'pause'
  | 'stop'
  | 'rewind'
  | 'fastForward'
  | 'next'
  | 'previous'
  | 'channelUp'
  | 'channelDown'
  | 'buttonA'
  | 'buttonB'
  | 'buttonX'
  | 'buttonY'
  | 'buttonL1'
  | 'buttonR1'
  | 'buttonL2'
  | 'buttonR2'
  | 'buttonThumbL'
  | 'buttonThumbR'
  | 'buttonStart'
  | 'buttonSelect';

export interface HardwareKeyEvent {
  key: HardwareKey;
  /** Raw Android key code, handy in logs when a remote sends something odd. */
  keyCode: number;
}

/**
 * Return `false` to decline the key: it then travels on to the next handler
 * out, and to the system if nobody wants it. Anything else (including
 * `undefined`) counts as handled and the key stops there.
 */
export type HardwareKeyHandler = (event: HardwareKeyEvent) => boolean | void;

/** Must match `KeyEventBridge.EVENT_NAME` on the Android side. */
const KEY_EVENT = 'rommstream.hardwareKey';

interface Registration {
  keys: readonly HardwareKey[];
  handler: HardwareKeyHandler;
}

const registrations: Registration[] = [];
let subscription: EmitterSubscription | null = null;

function dispatch(event: HardwareKeyEvent): void {
  // Newest first: the last thing to register is the one on top of the UI, and
  // it can still hand the key back down by returning false.
  for (let i = registrations.length - 1; i >= 0; i--) {
    const registration = registrations[i];
    if (
      registration.keys.includes(event.key) &&
      registration.handler(event) !== false
    ) {
      return;
    }
  }
}

/**
 * Native only knows the union of everything anyone wants, and only listens
 * while somebody does — so a crashed or unmounted screen can't leave the
 * remote's back button dead.
 */
function syncNative(): void {
  const keys = new Set<HardwareKey>();
  registrations.forEach(registration =>
    registration.keys.forEach(key => keys.add(key)),
  );
  NativeKeyEvents?.setInterceptedKeys(Array.from(keys));

  if (registrations.length > 0 && !subscription) {
    subscription = DeviceEventEmitter.addListener(KEY_EVENT, dispatch);
  } else if (registrations.length === 0 && subscription) {
    subscription.remove();
    subscription = null;
  }
}

/**
 * Take `keys` away from the rest of the app until the returned subscription is
 * removed. Prefer {@link useHardwareKeys} from a component.
 */
export function interceptHardwareKeys(
  keys: readonly HardwareKey[],
  handler: HardwareKeyHandler,
): { remove(): void } {
  const registration: Registration = { keys, handler };
  registrations.push(registration);
  syncNative();

  return {
    remove() {
      const index = registrations.indexOf(registration);
      if (index === -1) {
        return;
      }
      registrations.splice(index, 1);
      syncNative();
    },
  };
}

/**
 * Intercept `keys` for as long as the component is mounted and `enabled`.
 *
 * `handler` is read fresh on every press, so it doesn't need memoising; `keys`
 * is compared by content, so a fresh array literal is fine too.
 */
export function useHardwareKeys(
  keys: readonly HardwareKey[],
  handler: HardwareKeyHandler,
  enabled: boolean = true,
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  const keyList = keys.join(',');
  useEffect(() => {
    if (!enabled || keyList === '') {
      return;
    }
    const registration = interceptHardwareKeys(
      keyList.split(',') as HardwareKey[],
      event => handlerRef.current(event),
    );
    return () => registration.remove();
  }, [keyList, enabled]);
}
