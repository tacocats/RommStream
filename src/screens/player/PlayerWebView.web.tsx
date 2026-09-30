import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { StyleSheet, View } from 'react-native';
import type { WebViewMessageEvent, WebViewProps } from 'react-native-webview';
import {
  getDesktopBridge,
  GUEST_MESSAGE_CHANNEL,
  PLAYER_PARTITION,
} from '../../desktop/bridge';
import { createLogger } from '../../utils/logger';

export type { WebViewMessageEvent, WebViewProps };

/**
 * Desktop (Electron) counterpart of PlayerWebView.ts: an Electron <webview>
 * standing in for react-native-webview, for the props WebPlayerScreen uses.
 *
 * - `injectedJavaScript` runs after every page load, as it does natively.
 * - Page scripts reach the app through `window.ReactNativeWebView.postMessage`,
 *   which electron/guestPreload.ts provides, so the player scripts are shared
 *   as-is.
 * - Every instance runs in one persistent partition: the RomM session cookie
 *   the sign-in step picks up is still there for the play page's fresh
 *   webview, the way the shared cookie store works natively.
 *
 * The main process forces the preload and locks down the guest when it
 * attaches (electron/main.ts, will-attach-webview).
 */

const log = createLogger('webview');

/** The bits of Electron's WebviewTag used here. */
interface WebviewElement extends HTMLElement {
  executeJavaScript(code: string): Promise<unknown>;
}

interface IpcMessageEvent extends Event {
  channel: string;
  args: unknown[];
}

interface DidFailLoadEvent extends Event {
  errorCode: number;
  errorDescription: string;
  validatedURL: string;
  isMainFrame: boolean;
}

/** Chromium's net::ERR_ABORTED: a load superseded by another, not a failure. */
const ERR_ABORTED = -3;

export interface WebViewHandle {
  requestFocus(): void;
  injectJavaScript(script: string): void;
}

const fillStyle = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'flex',
  border: 'none',
} as const;

export const WebView = forwardRef<WebViewHandle, WebViewProps>(
  function PlayerWebView(
    { source, injectedJavaScript, onMessage, onError, style, testID },
    ref,
  ) {
    const element = useRef<WebviewElement | null>(null);
    const uri = (source as { uri?: string } | undefined)?.uri;

    // Handlers are read fresh at event time, like react-native-webview does.
    const latest = useRef({ injectedJavaScript, onMessage, onError });
    useEffect(() => {
      latest.current = { injectedJavaScript, onMessage, onError };
    });

    useImperativeHandle(
      ref,
      () => ({
        requestFocus: () => element.current?.focus(),
        injectJavaScript: script => {
          element.current
            ?.executeJavaScript(script)
            .catch(e => log.warn('injected script failed', e));
        },
      }),
      [],
    );

    useEffect(() => {
      const webview = element.current;
      if (!webview) {
        return;
      }
      const onFinishLoad = () => {
        const script = latest.current.injectedJavaScript;
        if (script) {
          webview
            .executeJavaScript(script)
            .catch(e => log.warn('injected script failed', e));
        }
      };
      const onIpcMessage = (event: Event) => {
        const { channel, args } = event as IpcMessageEvent;
        if (channel !== GUEST_MESSAGE_CHANNEL) {
          return;
        }
        latest.current.onMessage?.({
          nativeEvent: { data: String(args[0]) },
        } as WebViewMessageEvent);
      };
      const onFailLoad = (event: Event) => {
        const failure = event as DidFailLoadEvent;
        if (!failure.isMainFrame || failure.errorCode === ERR_ABORTED) {
          return;
        }
        latest.current.onError?.({
          nativeEvent: {
            code: failure.errorCode,
            description: failure.errorDescription,
            url: failure.validatedURL,
          },
        } as Parameters<NonNullable<WebViewProps['onError']>>[0]);
      };

      webview.addEventListener('did-finish-load', onFinishLoad);
      webview.addEventListener('ipc-message', onIpcMessage);
      webview.addEventListener('did-fail-load', onFailLoad);
      return () => {
        webview.removeEventListener('did-finish-load', onFinishLoad);
        webview.removeEventListener('ipc-message', onIpcMessage);
        webview.removeEventListener('did-fail-load', onFailLoad);
      };
    }, []);

    // Keep the screen awake while a game is up.
    useEffect(() => {
      const bridge = getDesktopBridge();
      bridge?.setPlaying(true);
      return () => bridge?.setPlaying(false);
    }, []);

    return (
      <View style={[styles.container, style]}>
        {React.createElement('webview', {
          ref: element,
          // src and partition are only read as the element attaches, which is
          // why WebPlayerScreen re-keys the WebView rather than changing its
          // source.
          src: uri,
          partition: PLAYER_PARTITION,
          'data-testid': testID,
          style: fillStyle,
        })}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: { flex: 1 },
});
