import type { RommStreamDesktopApi } from '../../../desktop/bridge';
import { interceptHardwareKeys } from '../../hardwareKeys';
import { installDesktopInput } from '../desktopInput';

// jsdom has no layout; stack the focusable elements top to bottom.
function button(id: string, index: number) {
  const element = document.createElement('div');
  element.tabIndex = 0;
  element.dataset.testid = id;
  element.getBoundingClientRect = () =>
    ({
      left: 0,
      top: index * 60,
      width: 100,
      height: 50,
      right: 100,
      bottom: index * 60 + 50,
    } as DOMRect);
  element.scrollIntoView = jest.fn();
  document.body.appendChild(element);
  return element;
}

function press(key: string, target: EventTarget = document.activeElement!) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

function focusedId() {
  return (document.activeElement as HTMLElement).dataset.testid;
}

let goBack: jest.Mock;
let uninstall: () => void;

beforeEach(() => {
  document.body.innerHTML = '';
  goBack = jest.fn();
  uninstall = installDesktopInput({ goBack });
});

afterEach(() => {
  uninstall();
  delete (globalThis as { rommstream?: unknown }).rommstream;
});

describe('installDesktopInput', () => {
  it('moves focus with the arrow keys', () => {
    button('first', 0).focus();
    button('second', 1);

    const event = press('ArrowDown');

    expect(focusedId()).toBe('second');
    expect(event.defaultPrevented).toBe(true);
  });

  it('goes back on Escape when nothing intercepts it', () => {
    button('first', 0).focus();
    press('Escape');
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it('offers Back to an intercepting handler first', () => {
    button('first', 0).focus();
    const handler = jest.fn();
    const registration = interceptHardwareKeys(['back'], handler);

    press('Escape');

    expect(handler).toHaveBeenCalledWith({ key: 'back', keyCode: 0 });
    expect(goBack).not.toHaveBeenCalled();
    registration.remove();
  });

  it('falls back when the handler declines the key', () => {
    button('first', 0).focus();
    const registration = interceptHardwareKeys(['back'], () => false);

    press('Escape');

    expect(goBack).toHaveBeenCalledTimes(1);
    registration.remove();
  });

  it('leaves Backspace and the caret to text fields', () => {
    const field = document.createElement('input');
    field.value = 'abc';
    document.body.appendChild(field);
    field.focus();
    field.setSelectionRange(1, 1);

    expect(press('Backspace').defaultPrevented).toBe(false);
    expect(press('ArrowLeft').defaultPrevented).toBe(false);
    expect(goBack).not.toHaveBeenCalled();
  });

  it('ignores a held Back', () => {
    button('first', 0).focus();
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', repeat: true }),
    );
    expect(goBack).not.toHaveBeenCalled();
  });
});

describe('keys taken off the game webview', () => {
  it('tells the main process which keys to take, and handles them', () => {
    uninstall();
    let deliver: (key: { key: string; code: string }) => void = () => {};
    const bridge = {
      setInterceptedKeys: jest.fn(),
      onInterceptedKey: jest.fn(listener => {
        deliver = listener;
        return () => {};
      }),
    } as unknown as RommStreamDesktopApi;
    (globalThis as { rommstream?: unknown }).rommstream = bridge;
    uninstall = installDesktopInput({ goBack });

    const handler = jest.fn();
    const registration = interceptHardwareKeys(['back'], handler);
    // Backspace stays with the game.
    expect(bridge.setInterceptedKeys).toHaveBeenLastCalledWith([
      'Escape',
      'BrowserBack',
      'GoBack',
    ]);

    deliver({ key: 'Escape', code: 'Escape' });
    expect(handler).toHaveBeenCalledWith({ key: 'back', keyCode: 0 });

    registration.remove();
    expect(bridge.setInterceptedKeys).toHaveBeenLastCalledWith([]);
  });
});
