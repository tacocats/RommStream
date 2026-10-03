/**
 * The contract between the Electron main process and the React app: what
 * electron/preload.ts exposes as `window.rommstream`, and the IPC channels
 * behind it. Kept free of any `electron` import so the renderer bundle (see
 * src/desktop/bridge.ts) can import these types too.
 */

export const IPC = {
  fetch: 'rommstream:fetch',
  secureGet: 'rommstream:secure-get',
  secureSet: 'rommstream:secure-set',
  secureDelete: 'rommstream:secure-delete',
  setInterceptedKeys: 'rommstream:set-intercepted-keys',
  interceptedKey: 'rommstream:intercepted-key',
  getPreferences: 'rommstream:get-preferences',
  setPreferences: 'rommstream:set-preferences',
  toggleFullscreen: 'rommstream:toggle-fullscreen',
  setPlaying: 'rommstream:set-playing',
  quit: 'rommstream:quit',
} as const;

/** The webview partition RomM's web player runs in; see will-attach-webview. */
export const PLAYER_PARTITION = 'persist:romm';

/** Channel the game webview's preload posts `ReactNativeWebView` messages on. */
export const GUEST_MESSAGE_CHANNEL = 'rommstream:guest-message';

export interface DesktopFetchRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  /** 'include' sends and stores the default session's cookies; otherwise
   * none are sent, as with a browser's cross-origin fetch. */
  credentials?: 'include';
}

export interface DesktopFetchResponse {
  url: string;
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: Uint8Array | null;
}

export interface DesktopPreferences {
  /** Open fullscreen, TV-style. On by default; F11 toggles it for a session. */
  fullscreen: boolean;
  /** Start RommStream when the user logs in to the computer. */
  launchAtLogin: boolean;
  /**
   * Hosts (hostname or hostname:port) whose TLS certificate is accepted even
   * if it doesn't verify, e.g. a LAN RomM behind a self-signed certificate.
   */
  trustedCertificateHosts: string[];
}

/** A key the main process took off the game webview before it saw it. */
export interface InterceptedKey {
  /** `KeyboardEvent.key` value, e.g. "Escape". */
  key: string;
  code: string;
}

export interface RommStreamDesktopApi {
  /** `process.platform` of the host: "win32", "darwin" or "linux". */
  platform: string;
  /** fetch() performed by the main process, so it isn't subject to CORS. */
  fetch(request: DesktopFetchRequest): Promise<DesktopFetchResponse>;
  secureStore: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  };
  /**
   * `KeyboardEvent.key` values the main process should take off the game
   * webview and send back through `onInterceptedKey` instead.
   */
  setInterceptedKeys(keys: string[]): void;
  onInterceptedKey(listener: (key: InterceptedKey) => void): () => void;
  getPreferences(): Promise<DesktopPreferences>;
  setPreferences(
    changes: Partial<DesktopPreferences>,
  ): Promise<DesktopPreferences>;
  toggleFullscreen(): void;
  /** Keep the display awake while a game is up. */
  setPlaying(playing: boolean): void;
  quit(): void;
}
