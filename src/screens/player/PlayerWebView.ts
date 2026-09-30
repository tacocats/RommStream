/**
 * The web view RomM's player runs in. Natively that's react-native-webview;
 * the desktop build swaps in PlayerWebView.web.tsx, an Electron <webview>
 * with the same props and imperative handle, so WebPlayerScreen is shared.
 */
export { WebView } from 'react-native-webview';
export type { WebViewMessageEvent, WebViewProps } from 'react-native-webview';
