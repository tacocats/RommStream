import { contextBridge, ipcRenderer } from 'electron';
import { GUEST_MESSAGE_CHANNEL } from './api';

/**
 * Preload for the game webview (RomM's web player). Recreates the one piece
 * of react-native-webview the player scripts rely on,
 * `window.ReactNativeWebView.postMessage`, delivering to the app's <webview>
 * element as an `ipc-message` (src/screens/player/PlayerWebView.web.tsx).
 */
contextBridge.exposeInMainWorld('ReactNativeWebView', {
  postMessage: (data: unknown) =>
    ipcRenderer.sendToHost(GUEST_MESSAGE_CHANNEL, String(data)),
});
