import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, focusRing } from '../theme/colors';
import { FocusablePressable } from './FocusablePressable';
import { GamepadIcon, HomeIcon, SettingsIcon } from './icons';
import { PopupMenu, PopupMenuAnchor, PopupMenuItem } from './PopupMenu';
import { anchorBeside } from './popupAnchor';

export type MainTab = 'Home' | 'Platforms' | 'Search';

type NavTab = 'Home' | 'Platforms';

const NAV_TABS: NavTab[] = ['Home', 'Platforms'];

/** Gap between the avatar and the account menu that pops out beside it. */
const MENU_OFFSET = 12;

const ICONS: Record<NavTab, typeof HomeIcon> = {
  Home: HomeIcon,
  Platforms: GamepadIcon,
};

interface Props {
  active: MainTab;
  username: string;
  onSelect: (tab: NavTab) => void;
  onSettings: () => void;
  onSignOut: () => void;
}

/**
 * Icon rail down the left edge of the main screen. Search isn't a place to
 * browse like Home/Platforms, so it lives outside this rail (top-right of
 * the content area) rather than as a third nav item here.
 */
export function Sidebar({
  active,
  username,
  onSelect,
  onSettings,
  onSignOut,
}: Props) {
  const initial = username.trim().charAt(0).toUpperCase() || '?';
  const avatarRef = useRef<View>(null);
  const [menuAnchor, setMenuAnchor] = useState<PopupMenuAnchor | null>(null);

  const accountItems: PopupMenuItem[] = [
    {
      id: 'sign-out',
      label: 'Sign Out',
      onSelect: onSignOut,
      destructive: true,
    },
  ];

  // Measured on open rather than on layout so the menu tracks window resizes
  // (desktop).
  const openAccountMenu = async () => {
    setMenuAnchor(await anchorBeside(avatarRef.current, MENU_OFFSET));
  };

  return (
    <View style={styles.bar} testID="sidebar">
      <View style={styles.nav}>
        {NAV_TABS.map(tab => {
          const Icon = ICONS[tab];
          const isActive = tab === active;
          return (
            <FocusablePressable
              key={tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab}
              style={[styles.item, isActive && styles.itemActive]}
              focusedStyle={styles.itemFocused}
              onPress={() => onSelect(tab)}
              testID={`tab-${tab.toLowerCase()}`}
            >
              <Icon
                color={isActive ? colors.accent : colors.textMuted}
                size={22}
              />
            </FocusablePressable>
          );
        })}
      </View>

      <View style={styles.bottom}>
        <FocusablePressable
          style={styles.item}
          focusedStyle={styles.itemFocused}
          accessibilityLabel="Settings"
          onPress={onSettings}
          testID="settings-button"
        >
          <SettingsIcon color={colors.textMuted} size={22} />
        </FocusablePressable>
        <FocusablePressable
          ref={avatarRef}
          style={styles.avatar}
          focusedStyle={styles.avatarFocused}
          accessibilityLabel={`Account: ${username}`}
          accessibilityState={{ expanded: menuAnchor !== null }}
          onPress={openAccountMenu}
          testID="account-button"
        >
          <Text style={styles.avatarText}>{initial}</Text>
        </FocusablePressable>
      </View>

      <PopupMenu
        visible={menuAnchor !== null}
        anchor={menuAnchor}
        items={accountItems}
        onClose={() => setMenuAnchor(null)}
        testID="account-menu"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: 88,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.navRail,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  nav: { gap: 16, alignItems: 'center' },
  bottom: { gap: 16, alignItems: 'center' },
  item: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  itemActive: { backgroundColor: colors.accentSoft },
  itemFocused: {
    borderColor: focusRing.borderColor,
    backgroundColor: colors.accentSoft,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.avatarBg,
  },
  avatarFocused: {
    borderColor: focusRing.borderColor,
    backgroundColor: colors.avatarBg,
  },
  avatarText: { color: colors.textPrimary, fontWeight: '700', fontSize: 16 },
});
