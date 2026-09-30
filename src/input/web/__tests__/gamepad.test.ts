import { GamepadPressTracker, heldButtons } from '../gamepad';

function pad(pressed: number[] = [], axes: number[] = [0, 0]): Gamepad {
  return {
    connected: true,
    axes,
    buttons: Array.from({ length: 17 }, (_, index) => ({
      pressed: pressed.includes(index),
      touched: false,
      value: pressed.includes(index) ? 1 : 0,
    })),
  } as unknown as Gamepad;
}

const A = 0;
const SELECT = 8;
const START = 9;
const DPAD_DOWN = 13;

describe('heldButtons', () => {
  it('names buttons by the standard mapping', () => {
    expect(Array.from(heldButtons(pad([A, DPAD_DOWN])))).toEqual(['a', 'down']);
  });

  it('folds the left stick into the D-pad', () => {
    expect(Array.from(heldButtons(pad([], [0.9, -0.8])))).toEqual([
      'right',
      'up',
    ]);
    expect(heldButtons(pad([], [0.2, 0.3])).size).toBe(0);
  });
});

describe('GamepadPressTracker', () => {
  it('reports a press once, not for as long as it is held', () => {
    const tracker = new GamepadPressTracker();

    expect(tracker.update([pad([A])], 0).map(p => p.button)).toEqual(['a']);
    expect(tracker.update([pad([A])], 1000)).toEqual([]);
    expect(tracker.update([pad()], 1100)).toEqual([]);
    expect(tracker.update([pad([A])], 1200).map(p => p.button)).toEqual(['a']);
  });

  it('repeats a held direction after a delay', () => {
    const tracker = new GamepadPressTracker();

    expect(tracker.update([pad([DPAD_DOWN])], 0)).toHaveLength(1);
    expect(tracker.update([pad([DPAD_DOWN])], 300)).toEqual([]);
    const [repeat] = tracker.update([pad([DPAD_DOWN])], 450);
    expect(repeat).toMatchObject({ button: 'down', repeat: true });
    expect(tracker.update([pad([DPAD_DOWN])], 500)).toEqual([]);
    expect(tracker.update([pad([DPAD_DOWN])], 600)).toHaveLength(1);
  });

  it('reports what else is held, for chords', () => {
    const tracker = new GamepadPressTracker();
    tracker.update([pad([SELECT])], 0);

    const [press] = tracker.update([pad([SELECT, START])], 100);
    expect(press.button).toBe('start');
    expect(press.held.has('select')).toBe(true);
  });

  it('combines every connected pad', () => {
    const tracker = new GamepadPressTracker();
    const presses = tracker.update([pad([A]), null, pad([DPAD_DOWN])], 0);
    expect(presses.map(p => p.button).sort()).toEqual(['a', 'down']);
  });
});
