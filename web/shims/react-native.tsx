/**
 * What `react-native` resolves to in the web (Electron) build: all of
 * react-native-web, plus stand-ins for the react-native-tvos additions the app
 * relies on. The browser has no TV focus engine, so the TV focus props are
 * given web meanings here and src/input/web/spatialNavigation.ts does the
 * D-pad movement:
 *
 * - `hasTVPreferredFocus` on a Pressable or TextInput focuses it as it
 *   mounts (or whenever the prop turns on), like react-native-tvos does.
 * - `TVFocusGuideView` renders a plain View. Any `trapFocus*` prop marks it
 *   as a focus trap, which spatial navigation won't leave.
 */
import React, { forwardRef, useCallback, useEffect, useRef } from 'react';
import * as ReactNativeWeb from 'react-native-web';

export * from 'react-native-web';

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

interface Focusable {
  focus?: (options?: FocusOptions) => void;
}

function useMergedRef<T>(forwarded: React.ForwardedRef<T>) {
  const local = useRef<T | null>(null);
  const setRef = useCallback(
    (node: T | null) => {
      local.current = node;
      if (typeof forwarded === 'function') {
        forwarded(node);
      } else if (forwarded) {
        forwarded.current = node;
      }
    },
    [forwarded],
  );
  return [local, setRef] as const;
}

function withPreferredFocus(Component: React.ComponentType<AnyProps>) {
  const Wrapped = forwardRef<Focusable, AnyProps>(
    ({ hasTVPreferredFocus, ...props }, ref) => {
      const [local, setRef] = useMergedRef<Focusable>(ref);
      useEffect(() => {
        if (hasTVPreferredFocus) {
          local.current?.focus?.();
        }
      }, [hasTVPreferredFocus, local]);
      return <Component {...props} ref={setRef} />;
    },
  );
  Wrapped.displayName = `TVPreferredFocus(${
    Component.displayName ?? Component.name ?? 'Component'
  })`;
  return Wrapped;
}

export const Pressable = withPreferredFocus(
  ReactNativeWeb.Pressable as React.ComponentType<AnyProps>,
);

export const TextInput = Object.assign(
  withPreferredFocus(ReactNativeWeb.TextInput as React.ComponentType<AnyProps>),
  { State: (ReactNativeWeb.TextInput as { State?: unknown }).State },
);

const TRAP_PROPS = [
  'trapFocusUp',
  'trapFocusDown',
  'trapFocusLeft',
  'trapFocusRight',
] as const;

export const TVFocusGuideView = forwardRef<unknown, AnyProps>(
  (
    {
      autoFocus: _autoFocus,
      destinations: _destinations,
      trapFocusUp,
      trapFocusDown,
      trapFocusLeft,
      trapFocusRight,
      dataSet,
      ...props
    },
    ref,
  ) => {
    const traps = { trapFocusUp, trapFocusDown, trapFocusLeft, trapFocusRight };
    const trapped = TRAP_PROPS.some(name => traps[name]);
    const View = ReactNativeWeb.View as React.ComponentType<AnyProps>;
    return (
      <View
        {...props}
        ref={ref}
        dataSet={{
          ...(dataSet as object | undefined),
          ...(trapped ? { focusTrap: 'true' } : null),
        }}
      />
    );
  },
);
TVFocusGuideView.displayName = 'TVFocusGuideView';

/** No TV remote events on the web; keyboard/gamepad go through src/input. */
export function useTVEventHandler(): void {}
