/**
 * Turns the browser Gamepad API (polled — it has no button events) into
 * discrete presses, with key-repeat on the D-pad and left stick so holding a
 * direction scrolls a shelf the way holding a TV remote's arrow does.
 *
 * Buttons use the W3C "standard" mapping, which Chromium applies to Xbox,
 * PlayStation, Switch Pro and most XInput pads.
 */

export type GamepadButton =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'a'
  | 'b'
  | 'x'
  | 'y'
  | 'l1'
  | 'r1'
  | 'l2'
  | 'r2'
  | 'select'
  | 'start'
  | 'thumbL'
  | 'thumbR'
  | 'home';

const STANDARD_BUTTONS: GamepadButton[] = [
  'a',
  'b',
  'x',
  'y',
  'l1',
  'r1',
  'l2',
  'r2',
  'select',
  'start',
  'thumbL',
  'thumbR',
  'up',
  'down',
  'left',
  'right',
  'home',
];

const DIRECTIONS: GamepadButton[] = ['up', 'down', 'left', 'right'];

const STICK_THRESHOLD = 0.5;
const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 120;

export interface GamepadPress {
  button: GamepadButton;
  /** Every button currently held across all pads, for chords. */
  held: ReadonlySet<GamepadButton>;
  repeat: boolean;
}

/** Buttons held on one pad right now, sticks folded into the D-pad. */
export function heldButtons(pad: Gamepad): Set<GamepadButton> {
  const held = new Set<GamepadButton>();
  pad.buttons.forEach((button, index) => {
    const name = STANDARD_BUTTONS[index];
    if (name && button.pressed) {
      held.add(name);
    }
  });
  const [x = 0, y = 0] = pad.axes;
  if (x <= -STICK_THRESHOLD) {
    held.add('left');
  } else if (x >= STICK_THRESHOLD) {
    held.add('right');
  }
  if (y <= -STICK_THRESHOLD) {
    held.add('up');
  } else if (y >= STICK_THRESHOLD) {
    held.add('down');
  }
  return held;
}

/**
 * Tracks what was held on the previous poll and reports new presses (and
 * repeats of held directions) at `now`.
 */
export class GamepadPressTracker {
  private held = new Set<GamepadButton>();
  private repeatAt = new Map<GamepadButton, number>();

  update(pads: Iterable<Gamepad | null>, now: number): GamepadPress[] {
    const current = new Set<GamepadButton>();
    for (const pad of pads) {
      if (pad && pad.connected) {
        heldButtons(pad).forEach(button => current.add(button));
      }
    }

    const presses: GamepadPress[] = [];
    current.forEach(button => {
      if (!this.held.has(button)) {
        presses.push({ button, held: current, repeat: false });
        if (DIRECTIONS.includes(button)) {
          this.repeatAt.set(button, now + REPEAT_DELAY_MS);
        }
        return;
      }
      const due = this.repeatAt.get(button);
      if (due !== undefined && now >= due) {
        presses.push({ button, held: current, repeat: true });
        this.repeatAt.set(button, now + REPEAT_INTERVAL_MS);
      }
    });
    this.held.forEach(button => {
      if (!current.has(button)) {
        this.repeatAt.delete(button);
      }
    });
    this.held = current;
    return presses;
  }
}

/**
 * Poll every animation frame and report presses. Returns a stop function.
 * Polling only runs while a pad is connected.
 */
export function watchGamepads(
  onPress: (press: GamepadPress) => void,
): () => void {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) {
    return () => {};
  }
  const tracker = new GamepadPressTracker();
  let frame: number | null = null;

  const poll = () => {
    frame = null;
    const pads = navigator.getGamepads();
    tracker.update(pads, performance.now()).forEach(onPress);
    if (Array.from(pads).some(pad => pad?.connected)) {
      frame = requestAnimationFrame(poll);
    }
  };
  const start = () => {
    if (frame === null) {
      frame = requestAnimationFrame(poll);
    }
  };

  window.addEventListener('gamepadconnected', start);
  // A pad that was already connected before load only announces itself on
  // its first button press, which fires gamepadconnected anyway; this covers
  // a reload with the pad still attached.
  start();

  return () => {
    window.removeEventListener('gamepadconnected', start);
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  };
}
