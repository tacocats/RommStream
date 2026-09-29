import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  WebView as WebViewBase,
  WebViewMessageEvent,
  WebViewProps,
} from 'react-native-webview';
import { useAuth } from '../../auth/AuthContext';
import { HardwareKey, useHardwareKeys } from '../../input/hardwareKeys';
import { getLoginPath } from '../../settings/settingsStore';
import { colors } from '../../theme/colors';
import { createLogger } from '../../utils/logger';
import { PlayerMenu, PlayerMenuAction } from './PlayerMenu';

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

const log = createLogger('login');

type Step = 'logging-in' | 'ready';

// Back would otherwise leave the game the instant it's pressed — easy to do by
// accident with a remote in your hand — so while the game is up it opens the
// pause menu instead, and pressing it again there closes it.
const MENU_KEYS: HardwareKey[] = ['back'];

// Any cheap same-origin page will do as a place to run the login script from;
// RomM's frontend needs a session cookie, and cookies are per-origin, so the
// login request has to originate from inside the WebView itself.
const BOOTSTRAP_PATH = '/api/heartbeat';

// RomM's session-login endpoint takes HTTP Basic credentials. Its CSRF
// middleware sets a readable `romm_csrftoken` cookie on the bootstrap GET and
// wants it echoed back in an `x-csrftoken` header on the POST, so the script
// does that (some deployments reject the login without it). Android's WebView
// can't attach headers to a POST navigation, hence fetch.
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
        var csrf = (document.cookie.match(/(?:^|;\\s*)romm_csrftoken=([^;]*)/) || [])[1];
        var headers = { Authorization: 'Basic ' + basic };
        if (csrf) { headers['x-csrftoken'] = decodeURIComponent(csrf); }
        fetch(${JSON.stringify(loginPath)}, {
          method: 'POST',
          credentials: 'include',
          headers: headers,
        })
          .then(function (res) {
            var headers = {};
            res.headers.forEach(function (v, k) { headers[k] = v; });
            return res.text().then(function (body) {
              post({
                type: 'login',
                ok: res.ok,
                status: res.status,
                headers: headers,
                body: body.slice(0, 500),
              });
            });
          })
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
  /**
   * For players whose stream lives in a cross-origin iframe inside the play
   * page: when `autoPlayScript` posts `{type: 'streamFrame', src}`, the
   * WebView navigates to that URL and runs this script there instead. Being
   * top-level on the frame's own origin is what lets menu commands reach it.
   */
  frameScript?: string;
  /**
   * Builds extra pause-menu items (after Resume, before Exit) given a way to
   * inject JS into the already-loaded play page. Omit for the plain
   * Resume/Exit menu.
   */
  menuActions?(send: (script: string) => void): PlayerMenuAction[];
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
  frameScript,
  menuActions,
  onExit,
}: WebPlayerScreenProps) {
  const { serverUrl, username, password } = useAuth();
  const webviewRef = useRef<WebViewHandle>(null);
  const [loginPath, setLoginPath] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('logging-in');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);

  useEffect(() => {
    getLoginPath().then(setLoginPath);
  }, []);

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
      src?: string;
      ok?: boolean;
      status?: number;
      error?: string;
      headers?: Record<string, string>;
      body?: string;
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
    if (
      payload.type === 'streamFrame' &&
      frameScript &&
      step === 'ready' &&
      payload.src
    ) {
      log.info(`switching to stream frame ${payload.src.split('?')[0]}`);
      setFrameUrl(payload.src);
      return;
    }
    if (payload.type !== 'login' || step !== 'logging-in') {
      return;
    }
    if (payload.ok) {
      log.info(`sign-in ok (HTTP ${payload.status}) at ${loginPath}`);
      setStep('ready');
    } else {
      log.error(
        `sign-in failed at ${serverUrl}${loginPath}: status=${payload.status}`,
        `error=${payload.error}`,
        `headers=${JSON.stringify(payload.headers)}`,
        `body=${payload.body}`,
      );
      setLoadError(
        describeLoginFailure(payload.status, loginPath, payload.error),
      );
    }
  };

  const extraActions = (menuActions?.(sendToPlayer) ?? []).map(action => ({
    ...action,
    onSelect: () => {
      action.onSelect();
      closeMenu();
    },
  }));

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
        key={`${step}:${frameUrl ?? ''}`}
        ref={webviewRef}
        testID="player-webview"
        style={styles.webview}
        source={{
          uri:
            step === 'logging-in'
              ? `${serverUrl}${BOOTSTRAP_PATH}`
              : frameUrl ?? playUrl,
        }}
        injectedJavaScript={
          step === 'logging-in'
            ? buildLoginScript(loginPath, username, password)
            : frameUrl && frameScript
            ? frameScript
            : autoPlayScript
        }
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
  error: {
    color: colors.danger,
    fontSize: 16,
    paddingHorizontal: 32,
    textAlign: 'center',
  },
});
