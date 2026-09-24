import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Login: undefined;
  /** Top bar host: Home / Platforms / Search tabs. */
  Main: undefined;
  Roms:
    | { platformId: number; platformName: string }
    | { collectionId: number; collectionName: string }
    | { virtualCollectionId: string; virtualCollectionName: string };
  GameDetails: { romId: number; romName: string; platformSlug: string };
  /** RomM's in-browser emulator (EmulatorJS, js-dos, PICO-8, Ruffle). */
  EmulatorPlayer: { romId: number; romName: string; playUrl: string };
  /** RomM's server-side streamed container (`/rom/:id/stream`). */
  GameStreamPlayer: { romId: number; romName: string; playUrl: string };
  Settings: undefined;
};

/** Navigation prop of the Main screen, handed down to the tabs it hosts. */
export type MainNavigation = NativeStackNavigationProp<
  RootStackParamList,
  'Main'
>;

/**
 * Navigation surface for views hosted inline in MainScreen's content area
 * (the Home/Platforms/Search tabs, and the Roms/GameDetails views they lead
 * to). Roms and GameDetails resolve to an in-frame view change instead of a
 * stack push, so the sidebar stays visible; the player screens and Settings
 * still hand off to the root stack navigator, which takes over the full
 * screen.
 */
export interface ContentNavigation {
  navigate(screen: 'Roms', params: RootStackParamList['Roms']): void;
  navigate(
    screen: 'GameDetails',
    params: RootStackParamList['GameDetails'],
  ): void;
  navigate(
    screen: 'EmulatorPlayer',
    params: RootStackParamList['EmulatorPlayer'],
  ): void;
  navigate(
    screen: 'GameStreamPlayer',
    params: RootStackParamList['GameStreamPlayer'],
  ): void;
  navigate(screen: 'Settings'): void;
  setOptions(options: { title?: string }): void;
  goBack(): void;
}
