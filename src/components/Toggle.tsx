import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';
import { FocusablePressable } from './FocusablePressable';

interface Props {
  value: boolean;
  onValueChange: () => void;
  testID: string;
}

/** A remote-friendly on/off switch, built on FocusablePressable rather than
 * RN's Switch so it gets the app's usual TV focus treatment for free. */
export function Toggle({ value, onValueChange, testID }: Props) {
  return (
    <FocusablePressable
      style={[styles.track, value && styles.trackOn]}
      onPress={onValueChange}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      testID={testID}
    >
      <View style={[styles.knob, value && styles.knobOn]} />
    </FocusablePressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 52,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSolid,
    padding: 2,
    justifyContent: 'center',
  },
  trackOn: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.textMuted,
    alignSelf: 'flex-start',
  },
  knobOn: {
    backgroundColor: colors.accent,
    alignSelf: 'flex-end',
  },
});
