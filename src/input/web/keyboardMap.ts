import type { HardwareKey } from '../hardwareKeys';

/**
 * Keyboard stand-ins for the TV remote, by `KeyboardEvent.key`. Escape is the
 * remote's Back; Backspace is too, but only outside text fields (see
 * isEditableTarget). Media and TV keys come from media keyboards and
 * HDMI-CEC / IR receivers that present as keyboards.
 */
const KEY_MAP: Record<string, HardwareKey> = {
  Escape: 'back',
  Backspace: 'back',
  BrowserBack: 'back',
  GoBack: 'back',
  ContextMenu: 'menu',
  Info: 'info',
  Guide: 'guide',
  Enter: 'select',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  MediaPlayPause: 'playPause',
  MediaPlay: 'play',
  MediaPause: 'pause',
  MediaStop: 'stop',
  MediaRewind: 'rewind',
  MediaFastForward: 'fastForward',
  MediaTrackNext: 'next',
  MediaTrackPrevious: 'previous',
  ChannelUp: 'channelUp',
  ChannelDown: 'channelDown',
};

export function hardwareKeyFor(key: string): HardwareKey | null {
  return KEY_MAP[key] ?? null;
}

/**
 * The `KeyboardEvent.key` values that produce any of `keys`, e.g. for telling
 * the main process which keys to take off the game webview.
 */
export function keyboardKeysFor(keys: readonly HardwareKey[]): string[] {
  return Object.keys(KEY_MAP).filter(key => keys.includes(KEY_MAP[key]));
}

/** Text fields keep Backspace, arrows and friends for themselves. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}
