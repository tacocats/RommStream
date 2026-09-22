import type { View } from 'react-native';

/**
 * react-native-tvos hangs `requestTVFocus()` off every View host instance —
 * it dispatches Android's own `requestFocus()` at the view — but it isn't in
 * the typings, and it isn't there at all off-TV (or under Jest, where host
 * instances are test stubs). Hence the narrowing here rather than a cast at
 * every call site.
 */
type TVFocusableView = View & { requestTVFocus?: () => void };

/**
 * Move platform focus onto `view`, if it's mounted and the platform has a
 * focus to move. Android only acts on this once the view is attached to the
 * window, so call it from `onLayout` rather than an effect.
 */
export function requestTVFocus(view: View | null | undefined): void {
  const target = view as TVFocusableView | null | undefined;
  if (typeof target?.requestTVFocus === 'function') {
    target.requestTVFocus();
  }
}
