import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { HardwareKey, useHardwareKeys } from '../../input/hardwareKeys';
import { colors } from '../../theme/colors';
import { createLogger } from '../../utils/logger';
import { PlayerMenu, PlayerMenuAction } from './PlayerMenu';
import {
  WebView as WebViewBase,
  WebViewMessageEvent,
  WebViewProps,
} from './PlayerWebView';

/**
 * react-native-webview forwards an imperative handle but declares itself as a
 * plain FunctionComponent, so its typings drop it. Re-declare the component
 * with the one method used here rather than casting at the call site.
 */
interface WebViewHandle {
  requestFocus(): void;
  injectJavaScript(script: string): void;
}

const WebView = WebViewBase as unknown as React.ForwardRefExoticComponent<
  WebViewProps & React.RefAttributes<WebViewHandle>
>;

const log = createLogger('player');

// Back would otherwise leave the game the instant it's pressed — easy to do by
// accident with a remote in your hand — so while the game is up it opens the
// pause menu instead, and pressing it again there closes it.
const MENU_KEYS: HardwareKey[] = ['back'];

export interface WebPlayerScreenProps {
  romName: string;
  /** Fully-qualified URL of the play page. */
  playUrl: string;
  /**
   * Script run once the play page has loaded, e.g. to press RomM's Play
   * button and focus the game surface. Owned by the caller so the two
   * player screens (in-browser emulator vs. streamed container) can diverge
   * as their launch sequences do.
   */
  autoPlayScript: string;
  /**
   * Builds extra pause-menu items (after Resume, before Exit) given a way to
   * inject JS into the already-loaded play page. Omit for the plain
   * Resume/Exit menu.
   */
  menuActions?(send: (script: string) => void): PlayerMenuAction[];
  onExit(): void;
}

/**
 * Hosts a play page in a WebView and runs `autoPlayScript` there once it has
 * loaded, with a pause menu over it.
 *
 * Shared by the in-browser emulator and game-stream player screens, which
 * only differ in what `autoPlayScript` does once the page loads. The page
 * isn't signed in to RomM: a stream room is on the container's own host and
 * needs no RomM session, and RomM's own pages show their sign-in instead.
 */
export function WebPlayerScreen({
  romName,
  playUrl,
  autoPlayScript,
  menuActions,
  onExit,
}: WebPlayerScreenProps) {
  const webviewRef = useRef<WebViewHandle>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Android routes key events to whichever view holds focus, so the WebView
  // has to hold it for the page to see the controller at all — and it has to
  // be taken back off the pause menu when that closes.
  const focusWebView = useCallback(() => {
    webviewRef.current?.requestFocus();
  }, []);

  const sendToPlayer = useCallback((script: string) => {
    webviewRef.current?.injectJavaScript(script);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    focusWebView();
  }, [focusWebView]);

  useHardwareKeys(MENU_KEYS, () => setMenuOpen(open => !open), !loadError);

  useEffect(() => {
    if (menuOpen) {
      return;
    }
    focusWebView();
  }, [menuOpen, focusWebView]);

  const handleMessage = (event: WebViewMessageEvent) => {
    let payload: { type?: string };
    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    // The page has handed DOM focus to the game canvas; give the WebView
    // itself Android focus so key presses reach it — unless the menu is up,
    // which owns focus until it closes.
    if (payload.type === 'canvas' && !menuOpen) {
      focusWebView();
    }
  };

  const extraActions = (menuActions?.(sendToPlayer) ?? []).map(action => ({
    ...action,
    onSelect: () => {
      action.onSelect();
      closeMenu();
    },
  }));

  return (
    <View style={styles.container}>
      {loadError && (
        <View style={styles.overlay}>
          <Text style={styles.error} testID="player-error">
            {loadError}
          </Text>
        </View>
      )}
      <WebView
        ref={webviewRef}
        testID="player-webview"
        style={styles.webview}
        source={{ uri: playUrl }}
        injectedJavaScript={autoPlayScript}
        onMessage={handleMessage}
        onError={syntheticEvent => {
          log.error('webview load error', syntheticEvent.nativeEvent);
          setLoadError(
            syntheticEvent.nativeEvent.description ||
              'Failed to load the web player',
          );
        }}
        webviewDebuggingEnabled={__DEV__}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
      />
      {menuOpen && (
        <PlayerMenu
          romName={romName}
          onResume={closeMenu}
          onExit={onExit}
          extraActions={extraActions}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  webview: { flex: 1, backgroundColor: colors.background },
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
  error: {
    color: colors.danger,
    fontSize: 16,
    paddingHorizontal: 32,
    textAlign: 'center',
  },
});
