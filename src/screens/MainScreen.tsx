import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { FocusablePressable } from '../components/FocusablePressable';
import { BackIcon, SearchIcon } from '../components/icons';
import { MainTab, Sidebar } from '../components/Sidebar';
import { ContentNavigation, RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { GameDetailsScreen } from './GameDetailsScreen';
import { HomeTab } from './HomeTab';
import { PlatformsTab } from './PlatformsTab';
import { RomListScreen } from './RomListScreen';
import { SearchTab } from './SearchTab';

type Props = NativeStackScreenProps<RootStackParamList, 'Main'>;

/** A view hosted in the content area: a tab, or a Roms/GameDetails view
 * pushed on top of one. */
type ContentView =
  | { screen: MainTab }
  | { screen: 'Roms'; params: RootStackParamList['Roms'] }
  | { screen: 'GameDetails'; params: RootStackParamList['GameDetails'] };

/**
 * The signed-in landing screen: a left nav rail switching between the Home
 * and Platforms tabs, plus a top-right search control.
 *
 * Drilling into a platform, collection or game pushes onto a local view
 * stack instead of the root navigator, so the sidebar and top bar stay on
 * screen the whole time — only the Player (actual gameplay) and Settings
 * take over the full screen via the root stack. Switching tabs from the
 * sidebar resets the stack, so it never accumulates history and the TV back
 * button keeps meaning "leave the app" at the root of each tab.
 */
export function MainScreen({ navigation }: Props) {
  const { signOut, username } = useAuth();
  const [stack, setStack] = useState<ContentView[]>([{ screen: 'Home' }]);

  const tab = stack[0].screen as MainTab;
  const current = stack[stack.length - 1];
  const canGoBack = stack.length > 1;

  const selectTab = (nextTab: MainTab) => setStack([{ screen: nextTab }]);
  const goBack = () => setStack(s => (s.length > 1 ? s.slice(0, -1) : s));

  const contentNavigation: ContentNavigation = useMemo(
    () => ({
      navigate: (
        screen:
          | 'Roms'
          | 'GameDetails'
          | 'EmulatorPlayer'
          | 'GameStreamPlayer'
          | 'Settings',
        params?:
          | RootStackParamList['Roms']
          | RootStackParamList['GameDetails']
          | RootStackParamList['EmulatorPlayer']
          | RootStackParamList['GameStreamPlayer'],
      ) => {
        if (screen === 'Roms') {
          setStack(s => [
            ...s,
            { screen: 'Roms', params: params as RootStackParamList['Roms'] },
          ]);
        } else if (screen === 'GameDetails') {
          setStack(s => [
            ...s,
            {
              screen: 'GameDetails',
              params: params as RootStackParamList['GameDetails'],
            },
          ]);
        } else if (screen === 'EmulatorPlayer') {
          navigation.navigate(
            'EmulatorPlayer',
            params as RootStackParamList['EmulatorPlayer'],
          );
        } else if (screen === 'GameStreamPlayer') {
          navigation.navigate(
            'GameStreamPlayer',
            params as RootStackParamList['GameStreamPlayer'],
          );
        } else {
          navigation.navigate('Settings');
        }
      },
      setOptions: () => {},
      goBack,
    }),
    [navigation],
  );

  return (
    <View style={styles.container} testID="main-screen">
      <Sidebar
        active={tab}
        username={username}
        onSelect={selectTab}
        onSettings={() => navigation.navigate('Settings')}
        onSignOut={signOut}
      />
      <View style={styles.main}>
        <View style={styles.topBar}>
          {canGoBack ? (
            <FocusablePressable
              style={styles.backButton}
              accessibilityLabel="Back"
              onPress={goBack}
              testID="content-back-button"
            >
              <BackIcon color={colors.textPrimary} />
            </FocusablePressable>
          ) : (
            <View />
          )}
          <FocusablePressable
            style={[
              styles.searchButton,
              tab === 'Search' && styles.searchButtonActive,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'Search' }}
            accessibilityLabel="Search"
            onPress={() => selectTab('Search')}
            testID="tab-search"
          >
            <SearchIcon
              color={tab === 'Search' ? colors.accent : colors.textMuted}
            />
          </FocusablePressable>
        </View>
        <View style={styles.content}>
          {current.screen === 'Home' && (
            <HomeTab navigation={contentNavigation} />
          )}
          {current.screen === 'Platforms' && (
            <PlatformsTab navigation={contentNavigation} />
          )}
          {current.screen === 'Search' && (
            <SearchTab navigation={contentNavigation} />
          )}
          {current.screen === 'Roms' && (
            <RomListScreen
              route={{ params: current.params }}
              navigation={contentNavigation}
            />
          )}
          {current.screen === 'GameDetails' && (
            <GameDetailsScreen
              route={{ params: current.params }}
              navigation={contentNavigation}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.background,
  },
  main: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingTop: 24,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSolid,
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSolid,
  },
  searchButtonActive: { backgroundColor: colors.accentSoft },
  content: { flex: 1 },
});
