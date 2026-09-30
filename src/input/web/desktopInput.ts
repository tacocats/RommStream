import { getDesktopBridge } from '../../desktop/bridge';
// Explicitly the web key source: it's the one with offerHardwareKey.
import { offerHardwareKey } from '../hardwareKeySource.web';
import type { HardwareKey } from '../hardwareKeys';
import { GamepadButton, GamepadPress, watchGamepads } from './gamepad';
import { hardwareKeyFor, isEditableTarget } from './keyboardMap';
import {
  Direction,
  focusFirst,
  moveFocus,
  shouldLeaveTextField,
} from './spatialNavigation';

/**
 * Couch-style input for the desktop build: keyboard, gamepad and TV remote
 * (via HDMI-CEC / IR receivers that present as keyboards) all drive the same
 * UI a TV remote does on Android TV.
 *
 * Every press is first offered to whatever intercepted it through
 * `useHardwareKeys` (the in-game pause menu, say); if nobody takes it,
 * directions move focus (spatialNavigation), Select/A presses the focused
 * control, and Back/B goes back.
 *
 * While a game's webview has focus it gets the gamepad to itself, apart from
 * the Guide button or Select+Start together, which act as Back so there's a
 * way into the pause menu that no game will ever use. The keyboard needs no
 * such rule: the main process only takes keys off the game that something
 * intercepted (Escape, for the pause menu).
 */

export interface DesktopInputOptions {
  /** Default Back: leave the current screen, if there's one to leave. */
  goBack(): void;
}

const DIRECTIONS: readonly string[] = ['up', 'down', 'left', 'right'];

const PAD_KEYS: Partial<Record<GamepadButton, HardwareKey>> = {
  x: 'buttonX',
  y: 'buttonY',
  l1: 'buttonL1',
  r1: 'buttonR1',
  l2: 'buttonL2',
  r2: 'buttonR2',
  select: 'buttonSelect',
  thumbL: 'buttonThumbL',
  thumbR: 'buttonThumbR',
};

const CURSOR_HIDDEN_CLASS = 'rommstream-cursor-hidden';
const CURSOR_IDLE_MS = 3000;

function isDirection(key: string): key is Direction {
  return DIRECTIONS.includes(key);
}

function gameHasFocus(): boolean {
  return document.activeElement?.tagName === 'WEBVIEW';
}

/** Enter presses made by activateFocused, which are for the page, not us. */
const syntheticEvents = new WeakSet<Event>();

/**
 * Press the focused control the way the Enter key does: react-native-web
 * presses a Pressable on Enter, and a TextInput submits.
 */
function activateFocused(): void {
  const target = document.activeElement;
  if (!(target instanceof HTMLElement) || target === document.body) {
    focusFirst();
    return;
  }
  const init = {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    bubbles: true,
    cancelable: true,
  } as KeyboardEventInit;
  (['keydown', 'keyup'] as const).forEach(type => {
    const event = new KeyboardEvent(type, init);
    syntheticEvents.add(event);
    target.dispatchEvent(event);
  });
}

export function installDesktopInput({
  goBack,
}: DesktopInputOptions): () => void {
  const bridge = getDesktopBridge();
  let cursorTimer: ReturnType<typeof setTimeout> | null = null;

  const hideCursor = () => document.body.classList.add(CURSOR_HIDDEN_CLASS);
  const onMouseMove = () => {
    document.body.classList.remove(CURSOR_HIDDEN_CLASS);
    if (cursorTimer !== null) {
      clearTimeout(cursorTimer);
    }
    cursorTimer = setTimeout(hideCursor, CURSOR_IDLE_MS);
  };

  /** What an unclaimed key does. Returns whether it did anything. */
  const defaultAction = (key: HardwareKey): boolean => {
    if (isDirection(key)) {
      return moveFocus(key);
    }
    if (key === 'back') {
      goBack();
      return true;
    }
    return false;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (syntheticEvents.has(event)) {
      return;
    }
    hideCursor();
    const editable = isEditableTarget(event.target);
    const key = hardwareKeyFor(event.key);
    if (!key || (event.key === 'Backspace' && editable)) {
      return;
    }
    // Holding a direction scrolls; holding Back shouldn't flap a menu.
    if (event.repeat && !isDirection(key)) {
      event.preventDefault();
      return;
    }
    if (
      isDirection(key) &&
      editable &&
      !shouldLeaveTextField(
        event.target as HTMLInputElement | HTMLTextAreaElement,
        key,
      )
    ) {
      return;
    }
    if (offerHardwareKey(key, event.keyCode) || defaultAction(key)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onPadPress = ({ button, held, repeat }: GamepadPress) => {
    hideCursor();
    if (gameHasFocus()) {
      const menuChord =
        button === 'home' ||
        ((button === 'select' || button === 'start') &&
          held.has('select') &&
          held.has('start'));
      if (menuChord && !repeat) {
        offerHardwareKey('back');
      }
      return;
    }

    if (isDirection(button)) {
      if (!offerHardwareKey(button)) {
        moveFocus(button);
      }
      return;
    }
    if (repeat) {
      return;
    }
    switch (button) {
      case 'a':
        if (!offerHardwareKey('buttonA') && !offerHardwareKey('select')) {
          activateFocused();
        }
        return;
      case 'b':
        if (!offerHardwareKey('buttonB') && !offerHardwareKey('back')) {
          goBack();
        }
        return;
      case 'start':
        if (!offerHardwareKey('buttonStart')) {
          offerHardwareKey('menu');
        }
        return;
      case 'home':
        offerHardwareKey('guide');
        return;
      default: {
        const key = PAD_KEYS[button];
        if (key) {
          offerHardwareKey(key);
        }
      }
    }
  };

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('mousemove', onMouseMove, true);
  const stopGamepads = watchGamepads(onPadPress);
  // Keys the main process took off the game webview (see
  // hardwareKeySource.web.ts). Only intercepted keys ever arrive here.
  const stopIntercepted =
    bridge?.onInterceptedKey(({ key }) => {
      const hardwareKey = hardwareKeyFor(key);
      if (hardwareKey) {
        offerHardwareKey(hardwareKey);
      }
    }) ?? (() => {});

  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('mousemove', onMouseMove, true);
    stopGamepads();
    stopIntercepted();
    if (cursorTimer !== null) {
      clearTimeout(cursorTimer);
    }
  };
}
