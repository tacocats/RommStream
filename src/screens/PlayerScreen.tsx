import { NativeStackScreenProps } from '@react-navigation/native-stack';
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
import { getRom } from '../api/rommClient';
import { useAuth } from '../auth/AuthContext';
import { FocusablePressable } from '../components/FocusablePressable';
import { HardwareKey, useHardwareKeys } from '../input/hardwareKeys';
import { requestTVFocus } from '../input/tvFocus';
import { RootStackParamList } from '../navigation/types';
import {
  getInBrowserPlayEnabled,
  getLoginPath,
} from '../settings/settingsStore';
import { colors } from '../theme/colors';
import { resolvePlayPath } from '../utils/resolvePlayPath';

type Props = NativeStackScreenProps<RootStackParamList, 'Player'>;

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

// RomM's web player routes land on a pre-play lobby (saves/states picker)
// with a Play button that only appears once the rom has loaded: `.play-button`
// in the v1 UI (views/Player/EmulatorJS/Base.vue), `.r-v2-ejs__play` in the
// v2 UI. Its handler needs no user gesture, so press it for the user: a TV
// remote shouldn't have to scroll a web page to start the game. A button
// simply labelled "Play" is the last resort. The `/rom/:id/stream` route
// instead lands on a lobby whose button reads "Stream on <container>", so
// that's matched by prefix too. On pages without any of these (the plain
// rom page fallback) this gives up after a while.
//
// EmulatorJS also draws an on-screen touch gamepad whenever the device
// reports a touchscreen (Android TV does), which is just clutter on a TV.
// It's switched off through EmulatorJS's own "virtual-gamepad" setting once
// the emulator object exists (EmulatorJS persists that in localStorage), with
// a CSS rule injected up front so it never flashes on screen before then.
//
// Pressing Play with `.click()` leaves DOM focus sitting on the (now hidden)
// lobby button, so keys go nowhere — the game canvas has to be focused before
// a controller does anything. The canvas gets a real pointer sequence rather
// than another bare `.click()`: that both moves focus and counts as the user
// gesture the page needs before it may start audio. Focus is then held
// against EmulatorJS moving it around while the core boots, and `canvas` is
// posted back so the native side can put Android focus on the WebView too.
const AUTO_PLAY_SCRIPT = `
  (function () {
    var post = function (payload) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    };

    var style = document.createElement('style');
    style.textContent = '.ejs_virtualGamepad_parent { display: none !important; }';
    document.head.appendChild(style);

    var disableTouchGamepad = function () {
      var tries = 0;
      var timer = setInterval(function () {
        var ejs = window.EJS_emulator;
        if (ejs && typeof ejs.changeSettingOption === 'function') {
          clearInterval(timer);
          try { ejs.changeSettingOption('virtual-gamepad', 'disabled'); } catch (e) {}
        } else if (++tries > 300) {
          clearInterval(timer);
        }
      }, 200);
    };

    var pressCentre = function (el) {
      var rect = el.getBoundingClientRect();
      var base = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: Math.round(rect.left + rect.width / 2),
        clientY: Math.round(rect.top + rect.height / 2),
        button: 0,
      };
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (type) {
        var down = type === 'pointerdown' || type === 'mousedown';
        var Ctor = type.indexOf('pointer') === 0 && window.PointerEvent ? PointerEvent : MouseEvent;
        var init = {};
        for (var key in base) { init[key] = base[key]; }
        init.buttons = down ? 1 : 0;
        if (Ctor === window.PointerEvent) { init.pointerType = 'mouse'; init.isPrimary = true; }
        try { el.dispatchEvent(new Ctor(type, init)); } catch (e) {}
      });
    };

    // EmulatorJS draws into a canvas; the /rom/:id/stream route plays a remote
    // container in a video element instead, and wants the same treatment.
    var findGameSurface = function () {
      return document.querySelector('canvas.ejs_canvas') ||
        document.querySelector('#game canvas') ||
        document.querySelector('canvas') ||
        document.querySelector('video');
    };

    var focusGameSurface = function () {
      var pressed = false;
      var tries = 0;
      var held = 0;
      var timer = setInterval(function () {
        var surface = findGameSurface();
        if (!surface) {
          if (++tries > 150) { clearInterval(timer); }
          return;
        }
        // Neither element is focusable unless it's given a tab index.
        if (!surface.hasAttribute('tabindex')) { surface.setAttribute('tabindex', '-1'); }
        if (!pressed) {
          pressed = true;
          pressCentre(surface);
          post({ type: 'canvas' });
        }
        if (document.activeElement !== surface) {
          surface.focus({ preventScroll: true });
          held = 0;
        } else if (++held > 5) {
          // Focus has stayed put through a second of start-up; it's the game's now.
          clearInterval(timer);
        }
      }, 200);
    };

    var findPlayButton = function () {
      var byClass = document.querySelector('button.play-button, button.r-v2-ejs__play');
      if (byClass) { return byClass; }
      var buttons = document.querySelectorAll('button');
      for (var i = 0; i < buttons.length; i++) {
        var text = buttons[i].textContent.trim().toLowerCase();
        if (text === 'play' || text.indexOf('stream on') === 0) { return buttons[i]; }
      }
      return null;
    };
    var tries = 0;
    var timer = setInterval(function () {
      var btn = findPlayButton();
      if (btn) {
        clearInterval(timer);
        btn.click();
        disableTouchGamepad();
        focusGameSurface();
      } else if (++tries > 150) {
        clearInterval(timer);
      }
    }, 200);
  })();
  true;
`;

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

export function PlayerScreen({ navigation, route }: Props) {
  const { romId, romName, platformSlug } = route.params;
  const { serverUrl, username, password, withAuth } = useAuth();
  const webviewRef = useRef<WebViewHandle>(null);
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [loginPath, setLoginPath] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('logging-in');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    Promise.all([getLoginPath(), getInBrowserPlayEnabled()])
      .then(async ([login, inBrowserPlayEnabled]) => {
        setLoginPath(login);
        const rom = await withAuth((url, token) =>
          getRom(url, token, romId),
        ).catch(() => null);
        return resolvePlayPath(
          withAuth,
          rom,
          platformSlug,
          inBrowserPlayEnabled,
        );
      })
      // The rom page is the floor: it can't play the game itself, but RomM's
      // own UI is there if the app couldn't resolve a player.
      .then(path => setPlayUrl(`${serverUrl}${path ?? `/rom/${romId}`}`));
  }, [serverUrl, romId, platformSlug, withAuth]);

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

  if (!playUrl || !loginPath) {
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
            : AUTO_PLAY_SCRIPT
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
        <PauseMenu
          romName={romName}
          onResume={closeMenu}
          onExit={navigation.goBack}
        />
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
