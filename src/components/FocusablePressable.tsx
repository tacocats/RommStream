import React, { useState } from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { colors, focusRing } from '../theme/colors';

interface Props extends PressableProps {
  ref?: React.Ref<View>;
  style?: StyleProp<ViewStyle>;
  focusedStyle?: StyleProp<ViewStyle>;
}

/**
 * TV remotes drive focus, not hover/press, so every actionable element needs
 * a visible focused state. This wraps Pressable to add a default one while
 * still letting screens override it.
 */
export function FocusablePressable({
  style,
  focusedStyle,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      {...rest}
      onFocus={e => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={e => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[styles.base, style, focused && (focusedStyle ?? styles.focused)]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
  },
  focused: {
    borderColor: focusRing.borderColor,
    backgroundColor: colors.accentSoft,
  },
});
