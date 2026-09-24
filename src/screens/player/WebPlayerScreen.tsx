import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FocusGuideMethods,
  StyleSheet,
  Text,
  TVFocusGuideView,
  View,
} from 'react-native';
import {
  WebView as WebViewBase,
  WebViewMessageEvent,
  WebViewProps,
} from 'react-native-webview';
import { useAuth } from '../../auth/AuthContext';
import { FocusablePressable } from '../../components/FocusablePressable';
import { HardwareKey, useHardwareKeys } from '../../input/hardwareKeys';
import { requestTVFocus } from '../../input/tvFocus';
import { getLoginPath } from '../../settings/settingsStore';
import { colors } from '../../theme/colors';

/**
 * react-native-webview forwards an imperative handle but declares itself as a
 * plain FunctionComponent, so its typings drop it. Re-declare the component
 * with the one method used here rather than casting at the call site.
 */
interface WebViewHandle {
  requestFocus(): void;
}

const WebView = WebViewBase as unknown as React.ForwardRefExoticComponent<
  WebViewProps & React.RefAttributes<WebViewHandle>
>;

type Step = 'logging-in' | 'ready';

// Back would otherwise leave the game the instant it's pressed — easy to do by
// accident with a remote in your hand — so while the game is up it opens the
// pause menu instead, and pressing it again there closes it.
const MENU_KEYS: HardwareKey[] = ['back'];

// Any cheap same-origin page will do as a place to run the login script from;
// RomM's frontend needs a session cookie, and cookies are per-origin, so the
// login request has to originate from inside the WebView itself.
const BOOTSTRAP_PATH = '/api/heartbeat';

// RomM's session-login endpoint takes HTTP Basic credentials, and its CSRF
// middleware skips the token check when an Authorization header is present,
// so a plain fetch from the page is enough — no CSRF cookie dance required.
// Android's WebView can't attach headers to a POST navigation, hence fetch.
function buildLoginScript(
  loginPath: string,
  username: string,
  password: string,
): string {
  return `
    (function () {
      var post = function (payload) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      };
      try {
        var creds = ${JSON.stringify(username)} + ':' + ${JSON.stringify(
    password,
  )};
        var basic = btoa(unescape(encodeURIComponent(creds)));
        fetch(${JSON.stringify(loginPath)}, {
          method: 'POST',
          credentials: 'include',
          headers: { Authorization: 'Basic ' + basic },
        })
          .then(function (res) { post({ type: 'login', ok: res.ok, status: res.status }); })
          .catch(function (err) { post({ type: 'login', ok: false, error: String(err) }); });
      } catch (err) {
        post({ type: 'login', ok: false, error: String(err) });
      }
    })();
    true;
  `;
}

function describeLoginFailure(
  status: number | undefined,
  loginPath: string,
  error?: string,
): string {
  if (status === 401) {
    return 'RomM rejected the username/password. Sign out and sign in again.';
  }
  if (status === 404) {
    return `Login endpoint not found at ${loginPath}. Update "Login path" in Settings.`;
  }
  if (status !== undefined) {
    return `Sign-in request failed (HTTP ${status}) at ${loginPath}.`;
  }
  return `Sign-in request failed: ${error ?? 'unknown error'}`;
}

export interface WebPlayerScreenProps {
  romName: string;
  /** Fully-qualified URL to load once sign-in succeeds. */
  playUrl: string;
  /**
   * Script run once the play page has loaded, e.g. to press RomM's Play
   * button and focus the game surface. Owned by the caller so the two
   * player screens (in-browser emulator vs. streamed container) can diverge
   * as their launch sequences do.
   */
  autoPlayScript: string;
  onExit(): void;
}

/**
 * Hosts RomM's web player in a WebView: signs in with a same-origin fetch
 * (cookies are per-origin, so the login request has to run from inside the
 * WebView), then swaps to the play page and runs `autoPlayScript` there.
 *
 * Shared by the in-browser emulator and game-stream player screens, which
 * only differ in what `autoPlayScript` does once the page loads.
 */
export function WebPlayerScreen({
  romName,
  playUrl,
  autoPlayScript,
  onExit,
}: WebPlayerScreenProps) {
  const { serverUrl, username, password } = useAuth();
  const webviewRef = useRef<WebViewHandle>(null);
  const [loginPath, setLoginPath] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('logging-in');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    getLoginPath().then(setLoginPath);
  }, []);

  // Android routes key events to whichever view holds focus, so the WebView
  // has to hold it for the page to see the controller at all — and it has to
  // be taken back off the pause menu when that closes.
  const focusWebView = useCallback(() => {
    webviewRef.current?.requestFocus();
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    focusWebView();
  }, [focusWebView]);

  useHardwareKeys(
    MENU_KEYS,
    () => setMenuOpen(open => !open),
    step === 'ready' && !loadError,
  );

  useEffect(() => {
    if (menuOpen) {
      return;
    }
    focusWebView();
  }, [menuOpen, step, focusWebView]);

  const handleMessage = (event: WebViewMessageEvent) => {
    if (!loginPath) {
      return;
    }
    let payload: {
      type?: string;
      ok?: boolean;
      status?: number;
      error?: string;
    };
    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    // The page has handed DOM focus to the game canvas; give the WebView
    // itself Android focus so key presses reach it — unless the menu is up,
    // which owns focus until it closes.
    if (payload.type === 'canvas' && step === 'ready' && !menuOpen) {
      focusWebView();
      return;
    }
    if (payload.type !== 'login' || step !== 'logging-in') {
      return;
    }
    if (payload.ok) {
      setStep('ready');
    } else {
      setLoadError(
        describeLoginFailure(payload.status, loginPath, payload.error),
      );
    }
  };

  if (!loginPath) {
    return (
      <View style={styles.centerFill}>
        <ActivityIndicator
          color={colors.accent}
          size="large"
          testID="player-loading"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {step === 'logging-in' && !loadError && (
        <View style={styles.overlay}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.overlayText}>Signing in to {serverUrl}…</Text>
        </View>
      )}
      {loadError && (
        <View style={styles.overlay}>
          <Text style={styles.error} testID="player-error">
            {loadError}
          </Text>
        </View>
      )}
      {/* Keyed on step so the game page gets a fresh WebView that can't
          re-run the login script. The session cookie survives: the cookie
          store is shared across WebView instances on both platforms. */}
      <WebView
        key={step}
        ref={webviewRef}
        testID="player-webview"
        style={styles.webview}
        source={{
          uri:
            step === 'logging-in' ? `${serverUrl}${BOOTSTRAP_PATH}` : playUrl,
        }}
        injectedJavaScript={
          step === 'logging-in'
            ? buildLoginScript(loginPath, username, password)
            : autoPlayScript
        }
        onMessage={handleMessage}
        onError={syntheticEvent => {
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
        <PauseMenu romName={romName} onResume={closeMenu} onExit={onExit} />
      )}
    </View>
  );
}

interface PauseMenuProps {
  romName: string;
  onResume(): void;
  onExit(): void;
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
function PauseMenu({ romName, onResume, onExit }: PauseMenuProps) {
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
  container: { flex: 1, backgroundColor: colors.background },
  webview: { flex: 1, backgroundColor: colors.background },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
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
  overlayText: { color: colors.textMuted, fontSize: 16 },
  menuTitle: { color: colors.textPrimary, fontSize: 28, fontWeight: '600' },
  menu: { gap: 12, minWidth: 280 },
  menuItem: { paddingVertical: 14, paddingHorizontal: 24 },
  menuItemText: {
    color: colors.textPrimary,
    fontSize: 18,
    textAlign: 'center',
  },
  menuHint: { color: colors.textFaint, fontSize: 14 },
  error: {
    color: colors.danger,
    fontSize: 16,
    paddingHorizontal: 32,
    textAlign: 'center',
  },
});
