import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors } from '../theme/colors';

/**
 * Settings that only exist on the desktop build (see the .web.tsx sibling).
 * The TV apps have none.
 */
export function DesktopSettingsSection() {
  return (
    <Text style={styles.empty} testID="settings-empty">
      There is nothing to configure on this device.
    </Text>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.textMuted, fontSize: 15 },
});
