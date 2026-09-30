import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from './types';

/**
 * The root navigator, for code outside the React tree — e.g. the desktop
 * build's default Back handling (src/input/web/desktopInput.ts).
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** Leave the current root screen, if there's one to go back to. */
export function goBackIfPossible(): void {
  if (navigationRef.isReady() && navigationRef.canGoBack()) {
    navigationRef.goBack();
  }
}
