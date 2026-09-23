import { DeviceEventEmitter } from 'react-native';
import NativeKeyEvents from '../../native/NativeKeyEvents';
import { HardwareKeyEvent, interceptHardwareKeys } from '../hardwareKeys';

jest.mock('../../native/NativeKeyEvents', () => ({
  __esModule: true,
  default: { setInterceptedKeys: jest.fn() },
}));

const setInterceptedKeys = jest.mocked(NativeKeyEvents!.setInterceptedKeys);

function press(key: string, keyCode = 0) {
  DeviceEventEmitter.emit('rommstream.hardwareKey', { key, keyCode });
}

/** Key codes native sends alongside the name; irrelevant beyond being passed on. */
const BACK_CODE = 4;

describe('interceptHardwareKeys', () => {
  it('reports presses of the keys it asked for', () => {
    const handler = jest.fn();
    const registration = interceptHardwareKeys(['back'], handler);

    press('back', BACK_CODE);

    expect(handler).toHaveBeenCalledWith<[HardwareKeyEvent]>({
      key: 'back',
      keyCode: BACK_CODE,
    });
    registration.remove();
  });

  it('ignores keys it did not ask for', () => {
    const handler = jest.fn();
    const registration = interceptHardwareKeys(['back'], handler);

    press('menu');

    expect(handler).not.toHaveBeenCalled();
    registration.remove();
  });

  it('tells native the union of every registered key', () => {
    const first = interceptHardwareKeys(['back'], jest.fn());
    const second = interceptHardwareKeys(['back', 'menu'], jest.fn());

    expect(setInterceptedKeys).toHaveBeenLastCalledWith(['back', 'menu']);

    second.remove();
    expect(setInterceptedKeys).toHaveBeenLastCalledWith(['back']);

    first.remove();
    expect(setInterceptedKeys).toHaveBeenLastCalledWith([]);
  });

  it('stops listening once the last registration is gone', () => {
    const handler = jest.fn();
    interceptHardwareKeys(['back'], handler).remove();

    press('back');

    expect(handler).not.toHaveBeenCalled();
  });

  it('gives the key to the newest registration only', () => {
    const outer = jest.fn();
    const inner = jest.fn();
    const outerReg = interceptHardwareKeys(['back'], outer);
    const innerReg = interceptHardwareKeys(['back'], inner);

    press('back');

    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();

    innerReg.remove();
    outerReg.remove();
  });

  it('passes the key on when a handler declines it', () => {
    const outer = jest.fn();
    const inner = jest.fn(() => false);
    const outerReg = interceptHardwareKeys(['back'], outer);
    const innerReg = interceptHardwareKeys(['back'], inner);

    press('back');

    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).toHaveBeenCalledTimes(1);

    innerReg.remove();
    outerReg.remove();
  });
});
