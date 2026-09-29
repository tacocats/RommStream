import React, { useCallback, useRef } from 'react';
import {
  FocusGuideMethods,
  StyleSheet,
  Text,
  TVFocusGuideView,
  View,
} from 'react-native';
import { FocusablePressable } from '../../components/FocusablePressable';
import { requestTVFocus } from '../../input/tvFocus';
import { colors } from '../../theme/colors';

export interface PlayerMenuAction {
  id: string;
  label: string;
  onSelect(): void;
}

interface PlayerMenuProps {
  romName: string;
  onResume(): void;
  onExit(): void;
  /** Extra items rendered between Resume and Exit, e.g. selkies-mimicking commands. */
  extraActions?: PlayerMenuAction[];
}

/**
 * Sits over the running game. `TVFocusGuideView` hands focus to the first
 * button and traps it so arrow keys can't wander back out to the game.
 *
 * Its `autoFocus` alone isn't enough to get focus here in the first place:
 * that only fires when Android's focus search arrives at the guide, and
 * nothing sends it there — the WebView holds focus while the game runs and
 * keeps it when the menu appears, so the menu draws unfocused and the D-pad
 * goes on driving the game behind it. The guide is therefore asked for focus
 * outright as it lands, which is what passes it on to the first button.
 */
export function PlayerMenu({
  romName,
  onResume,
  onExit,
  extraActions = [],
}: PlayerMenuProps) {
  const menuRef = useRef<View & FocusGuideMethods>(null);

  // `onLayout` rather than an effect: Android ignores a focus request for a
  // view that isn't attached to the window yet, and layout is the first point
  // at which it is.
  const takeFocus = useCallback(() => requestTVFocus(menuRef.current), []);

  return (
    <View style={styles.overlay} testID="player-menu">
      <Text style={styles.menuTitle}>{romName}</Text>
      <TVFocusGuideView
        ref={menuRef}
        onLayout={takeFocus}
        testID="player-menu-items"
        autoFocus
        trapFocusUp
        trapFocusDown
        trapFocusLeft
        trapFocusRight
        style={styles.menu}
      >
        {/* Focus lands here. `hasTVPreferredFocus` is what makes the button
            focusable while the device is in touch mode — a TV that's been
            poked with a mouse or a touchscreen — where a plain focusable view
            can't be focused at all. */}
        <FocusablePressable
          hasTVPreferredFocus
          style={styles.menuItem}
          onPress={onResume}
          testID="player-menu-resume"
        >
          <Text style={styles.menuItemText}>Resume</Text>
        </FocusablePressable>
        {extraActions.map(action => (
          <FocusablePressable
            key={action.id}
            style={styles.menuItem}
            onPress={action.onSelect}
            testID={`player-menu-action-${action.id}`}
          >
            <Text style={styles.menuItemText}>{action.label}</Text>
          </FocusablePressable>
        ))}
        <FocusablePressable
          style={styles.menuItem}
          onPress={onExit}
          testID="player-menu-exit"
        >
          <Text style={styles.menuItemText}>Exit game</Text>
        </FocusablePressable>
      </TVFocusGuideView>
      <Text style={styles.menuHint}>Press Back again to resume</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: 12,
  },
  menuTitle: { color: colors.textPrimary, fontSize: 28, fontWeight: '600' },
  menu: { gap: 12, minWidth: 280 },
  menuItem: { paddingVertical: 14, paddingHorizontal: 24 },
  menuItemText: {
    color: colors.textPrimary,
    fontSize: 18,
    textAlign: 'center',
  },
  menuHint: { color: colors.textFaint, fontSize: 14 },
});
