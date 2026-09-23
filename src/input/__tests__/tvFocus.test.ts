import type { View } from 'react-native';
import { requestTVFocus } from '../tvFocus';

/** Stand-in for a host instance, which is all the helper ever sees. */
function fakeView(overrides: object = {}) {
  return overrides as unknown as View;
}

describe('requestTVFocus', () => {
  it('asks the view for focus', () => {
    const requestTVFocusMock = jest.fn();

    requestTVFocus(fakeView({ requestTVFocus: requestTVFocusMock }));

    expect(requestTVFocusMock).toHaveBeenCalled();
  });

  it('does nothing without a view', () => {
    expect(() => requestTVFocus(null)).not.toThrow();
    expect(() => requestTVFocus(undefined)).not.toThrow();
  });

  it('does nothing off-TV, where the method is absent', () => {
    expect(() => requestTVFocus(fakeView())).not.toThrow();
  });
});
