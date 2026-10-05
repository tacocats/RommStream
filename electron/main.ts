import {
  app,
  BrowserWindow,
  ipcMain,
  IpcMainEvent,
  IpcMainInvokeEvent,
  Menu,
  powerSaveBlocker,
  session,
  Session,
  WebContents,
} from 'electron';
import path from 'node:path';
import { IPC, PLAYER_PARTITION } from './api';
import { trustConfiguredCertificates } from './certificates';
import { setLaunchAtLogin } from './launchAtLogin';
import { getPreferences, updatePreferences } from './preferences';
import { rommFetch } from './rommFetch';
import { secureDelete, secureGet, secureSet } from './secureStore';

/**
 * Electron shell for the desktop (Windows / macOS / Linux) build: one
 * fullscreen window running the web build of the React Native app (Vite, see
 * vite.config.mts), meant for a TV or monitor across the room and driven by
 * keyboard, gamepad or remote rather than a mouse.
 *
 * The app plays games in a <webview> of RomM's own web player; everything
 * about that guest is locked down here as it attaches, so the renderer can't
 * loosen it.
 */

/** Set by `npm run dev:desktop` to load the Vite dev server. */
const DEV_SERVER_URL = process.env.ROMMSTREAM_DEV_SERVER_URL;

// userData (credentials, preferences, the player's cookies) under a readable
// name rather than the package name. Tests point it somewhere disposable.
app.setName('RommStream');
if (process.env.ROMMSTREAM_USER_DATA_DIR) {
  app.setPath('userData', process.env.ROMMSTREAM_USER_DATA_DIR);
}

// Games start their own audio without a click: autoplay has to be allowed.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Hardware video decoding on Linux is off by default in Chromium, and
// breaks on some drivers, so it's opt-in; the streamed player benefits most.
if (
  process.platform === 'linux' &&
  process.env.ROMMSTREAM_ENABLE_VAAPI === '1'
) {
  app.commandLine.appendSwitch(
    'enable-features',
    'VaapiVideoDecoder,VaapiVideoDecodeLinuxGL',
  );
}

let mainWindow: BrowserWindow | null = null;

/** KeyboardEvent.key values the renderer wants taken off the game webview. */
let interceptedKeys = new Set<string>();

let displayBlocker: number | null = null;

interface KeyInput {
  type: string;
  key: string;
  alt: boolean;
  isAutoRepeat: boolean;
}

/** F11, or Alt+Enter as many PC games use. */
function isFullscreenToggle(input: KeyInput): boolean {
  return (
    input.type === 'keyDown' &&
    !input.isAutoRepeat &&
    (input.key === 'F11' || (input.alt && input.key === 'Enter'))
  );
}

function toggleFullscreen(): void {
  mainWindow?.setFullScreen(!mainWindow.isFullScreen());
}

function isAppUrl(url: string): boolean {
  if (DEV_SERVER_URL) {
    return url.startsWith(DEV_SERVER_URL);
  }
  return url.startsWith('file://');
}

function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** IPC is only for the app itself — never a page in the game webview. */
function fromApp(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return !!mainWindow && event.sender === mainWindow.webContents;
}

function handle<Args extends unknown[], Result>(
  channel: string,
  handler: (...args: Args) => Result,
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!fromApp(event)) {
      throw new Error(`${channel}: not from the app window`);
    }
    return handler(...(args as Args));
  });
}

function on<Args extends unknown[]>(
  channel: string,
  listener: (...args: Args) => void,
): void {
  ipcMain.on(channel, (event, ...args) => {
    if (fromApp(event)) {
      listener(...(args as Args));
    }
  });
}

function registerIpc(): void {
  handle(IPC.fetch, rommFetch);
  handle(IPC.secureGet, (key: string) => secureGet(key));
  handle(IPC.secureSet, (key: string, value: string) => secureSet(key, value));
  handle(IPC.secureDelete, (key: string) => secureDelete(key));
  handle(IPC.getPreferences, () => getPreferences());
  handle(IPC.setPreferences, (changes: unknown) => {
    const before = getPreferences();
    const after = updatePreferences(changes);
    if (after.launchAtLogin !== before.launchAtLogin) {
      setLaunchAtLogin(after.launchAtLogin);
    }
    if (
      after.trustedCertificateHosts.join() !==
      before.trustedCertificateHosts.join()
    ) {
      // Re-installing the verifier also drops Chromium's cached verdicts.
      appSessions().forEach(trustConfiguredCertificates);
    }
    return after;
  });

  on(IPC.setInterceptedKeys, (keys: unknown) => {
    interceptedKeys = new Set(
      Array.isArray(keys) ? keys.filter(k => typeof k === 'string') : [],
    );
  });
  on(IPC.toggleFullscreen, toggleFullscreen);
  on(IPC.setPlaying, (playing: unknown) => {
    if (playing && displayBlocker === null) {
      displayBlocker = powerSaveBlocker.start('prevent-display-sleep');
    } else if (!playing && displayBlocker !== null) {
      powerSaveBlocker.stop(displayBlocker);
      displayBlocker = null;
    }
  });
  on(IPC.quit, () => app.quit());
}

function appSessions(): Session[] {
  return [session.defaultSession, session.fromPartition(PLAYER_PARTITION)];
}

/**
 * The game webview gets fullscreen and pointer lock (emulators and the
 * stream use both); the app itself only fullscreen. Nothing asks for the
 * camera, location, notifications and so on, so nothing gets them.
 */
function restrictPermissions(): void {
  session.defaultSession.setPermissionRequestHandler(
    (_contents, permission, callback) => callback(permission === 'fullscreen'),
  );
  session
    .fromPartition(PLAYER_PARTITION)
    .setPermissionRequestHandler((_contents, permission, callback) =>
      callback(
        ['fullscreen', 'pointerLock', 'clipboard-sanitized-write'].includes(
          permission,
        ),
      ),
    );
}

function setUpGuest(guest: WebContents): void {
  guest.setWindowOpenHandler(() => ({ action: 'deny' }));
  guest.on('will-navigate', (event, url) => {
    if (!isWebUrl(url)) {
      event.preventDefault();
    }
  });
  // Keys typed into the game never reach the app's own document, so the
  // ones it has intercepted (Escape for the pause menu) are taken off the
  // guest here and forwarded.
  guest.on('before-input-event', (event, input) => {
    if (isFullscreenToggle(input)) {
      event.preventDefault();
      toggleFullscreen();
      return;
    }
    if (
      input.type === 'keyDown' &&
      !input.isAutoRepeat &&
      interceptedKeys.has(input.key)
    ) {
      event.preventDefault();
      mainWindow?.webContents.send(IPC.interceptedKey, {
        key: input.key,
        code: input.code,
      });
    }
  });
}

function setUpAppContents(contents: WebContents): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
    }
  });

  // Whatever the renderer asks for, the game webview gets the guest preload
  // (and nothing else from Node), runs in the player partition, and can only
  // load a web page.
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    webPreferences.preload = path.join(__dirname, 'guestPreload.js');
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    if (params.partition !== PLAYER_PARTITION || !isWebUrl(params.src)) {
      event.preventDefault();
    }
  });
  contents.on('did-attach-webview', (_event, guest) => setUpGuest(guest));

  contents.on('before-input-event', (event, input) => {
    if (isFullscreenToggle(input)) {
      event.preventDefault();
      toggleFullscreen();
    } else if (
      DEV_SERVER_URL &&
      input.type === 'keyDown' &&
      input.key === 'F12'
    ) {
      contents.toggleDevTools();
    }
  });
}

function createWindow(): void {
  const { fullscreen } = getPreferences();
  mainWindow = new BrowserWindow({
    title: 'RommStream',
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    fullscreen,
    backgroundColor: '#0A0A10',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      spellcheck: false,
    },
  });
  setUpAppContents(mainWindow.webContents);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../web/index.html'));
  }
}

/**
 * No menu bar on Windows/Linux — there's no mouse on the couch. macOS keeps
 * the standard app menu, which is where Cmd+Q and copy/paste live.
 */
function setUpMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          { role: 'togglefullscreen' },
          ...(DEV_SERVER_URL
            ? [{ role: 'toggleDevTools' as const }, { role: 'reload' as const }]
            : []),
        ],
      },
      { role: 'windowMenu' },
    ]),
  );
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    appSessions().forEach(trustConfiguredCertificates);
    restrictPermissions();
    registerIpc();
    setUpMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  // A couch app has one window; closing it means done, macOS included.
  app.on('window-all-closed', () => app.quit());
}
