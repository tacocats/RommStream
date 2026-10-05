import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { FocusablePressable } from './FocusablePressable';

export interface PopupMenuItem {
  id: string;
  label: string;
  onSelect(): void;
  /** Renders the label in the danger colour, e.g. for Sign Out. */
  destructive?: boolean;
}

/** Window coordinates of the bottom-left corner the menu grows up from. */
export interface PopupMenuAnchor {
  left: number;
  bottom: number;
}

interface Props {
  visible: boolean;
  anchor: PopupMenuAnchor | null;
  items: PopupMenuItem[];
  onClose(): void;
  testID?: string;
}

/**
 * A small floating list of actions, pinned to `anchor`. It's a Modal rather
 * than an absolutely positioned child so it draws above sibling views, keeps
 * D-pad focus inside it on TV, and closes on Back (Android) / Escape (web)
 * via `onRequestClose`. Pressing outside the menu also closes it.
 */
export function PopupMenu({ visible, anchor, items, onClose, testID }: Props) {
  return (
    <Modal
      transparent
      visible={visible && anchor !== null}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        focusable={false}
        accessible={false}
        testID={testID && `${testID}-backdrop`}
      />
      {anchor && (
        <View
          style={[styles.menu, { left: anchor.left, bottom: anchor.bottom }]}
          testID={testID}
        >
          {items.map((item, index) => (
            <FocusablePressable
              key={item.id}
              hasTVPreferredFocus={index === 0}
              accessibilityRole="menuitem"
              style={styles.item}
              focusedStyle={styles.itemFocused}
              onPress={() => {
                onClose();
                item.onSelect();
              }}
              testID={testID && `${testID}-${item.id}`}
            >
              <Text
                style={[styles.itemText, item.destructive && styles.danger]}
              >
                {item.label}
              </Text>
            </FocusablePressable>
          ))}
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    minWidth: 180,
    padding: 6,
    gap: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSolid,
  },
  item: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'transparent',
  },
  itemFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  itemText: { color: colors.textPrimary, fontSize: 15 },
  danger: { color: colors.danger },
});
