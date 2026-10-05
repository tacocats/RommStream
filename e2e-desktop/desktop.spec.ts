import {
  _electron as electron,
  ElectronApplication,
  expect,
  Page,
  test,
} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MockRomm, ROM, startMockRomm } from './mockRommServer';

/**
 * Smoke test of the desktop build (`npm run build:desktop` first): sign in,
 * browse and launch a game using only the keyboard, the way a couch setup
 * would with a remote.
 */

const APP_DIR = path.join(__dirname, '..', 'dist');

/**
 * Set to a packaged app's executable (e.g. release/linux-unpacked/rommstream)
 * to test that instead of dist/ run with the development Electron.
 */
const PACKAGED_EXECUTABLE = process.env.ROMMSTREAM_E2E_EXECUTABLE;

let romm: MockRomm;
let app: ElectronApplication;
let page: Page;
let userData: string;

async function launch(): Promise<void> {
  const env: Record<string, string> = { ROMMSTREAM_USER_DATA_DIR: userData };
  for (const [name, value] of Object.entries(process.env)) {
    // Set by VS Code's terminal; would start Electron as plain Node.
    if (value !== undefined && name !== 'ELECTRON_RUN_AS_NODE') {
      env[name] = value;
    }
  }
  app = await electron.launch(
    PACKAGED_EXECUTABLE
      ? { executablePath: PACKAGED_EXECUTABLE, args: [], env }
      : { args: [APP_DIR], env },
  );
  page = await app.firstWindow();
}

function byTestId(id: string) {
  return page.locator(`[data-testid="${id}"]`);
}

async function focusedTestId(): Promise<string | null> {
  return page.evaluate(
    () =>
      (document.activeElement as HTMLElement | null)?.dataset.testid ?? null,
  );
}

async function playerGuestUrl(): Promise<string | null> {
  return app.evaluate(({ webContents }) => {
    const guest = webContents
      .getAllWebContents()
      .find(contents => contents.getType() === 'webview');
    return guest ? guest.getURL() : null;
  });
}

// The second test picks up where the first left off.
/**
 * A key press into the game webview, as real keyboard input arrives: through
 * the main process. Playwright's page.keyboard injects keys past it (over the
 * DevTools protocol), so it can't exercise the main process taking keys off
 * the game.
 */
async function pressInGame(keyCode: string): Promise<void> {
  await app.evaluate(({ webContents }, key) => {
    const guest = webContents
      .getAllWebContents()
      .find(contents => contents.getType() === 'webview');
    guest?.sendInputEvent({ type: 'keyDown', keyCode: key });
    guest?.sendInputEvent({ type: 'keyUp', keyCode: key });
  }, keyCode);
}

/** Keys the mock streaming room received (see mockRommServer.ts). */
async function gameKeysSeen(): Promise<string[]> {
  return app.evaluate(async ({ webContents }) => {
    const guest = webContents
      .getAllWebContents()
      .find(contents => contents.getType() === 'webview');
    return guest ? guest.executeJavaScript('window.keysSeen') : [];
  });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  romm = await startMockRomm();
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'rommstream-e2e-'));
});

test.afterAll(async () => {
  await app?.close();
  await romm?.close();
  fs.rmSync(userData, { recursive: true, force: true });
});

test('signs in, browses and plays with the keyboard alone', async () => {
  await launch();

  // Sign in: the server field has preferred focus; arrows move between fields.
  await expect(byTestId('login-server-url')).toBeVisible();
  await expect.poll(focusedTestId).toBe('login-server-url');
  await page.keyboard.insertText(romm.url);
  await page.keyboard.press('ArrowDown');
  await expect.poll(focusedTestId).toBe('login-username');
  await page.keyboard.insertText('player');
  await page.keyboard.press('ArrowDown');
  await expect.poll(focusedTestId).toBe('login-password');
  await page.keyboard.insertText('secret');
  await page.keyboard.press('Enter');

  // Home: the API was reached without CORS headers, via the main process.
  const tile = `home-recent-tile-${ROM.id}`;
  await expect(byTestId(tile)).toBeVisible();
  expect(romm.requests).toContain('POST /api/token');
  await expect.poll(focusedTestId).toBe(tile);

  // Into the game's details and back out again with Escape (the remote's Back).
  await page.keyboard.press('Enter');
  await expect(byTestId('game-details-screen')).toBeVisible();
  await expect.poll(focusedTestId).toBe('play-button');
  await page.keyboard.press('Escape');
  await expect(byTestId('home-tab')).toBeVisible();

  // Launch the game: the app signs in to RomM for its socket, claims a
  // streaming container and opens the room it reports.
  await expect.poll(focusedTestId).toBe(tile);
  await page.keyboard.press('Enter');
  await expect.poll(focusedTestId).toBe('play-button');
  // Play works before the route resolves, but lands on the rom page.
  await expect(byTestId('game-details-loading')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect.poll(playerGuestUrl).toBe(romm.roomUrl);
  expect(romm.requests).toContain('POST /api/login');
  expect(romm.requests).toContain('POST /api/streaming/sessions');
  // The main process put the login cookie on the socket handshake.
  expect(romm.socketCookies).toEqual([
    expect.stringContaining('romm_session=session'),
  ]);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName))
    .toBe('WEBVIEW');

  // Escape is taken off the game by the main process and opens the menu;
  // the game itself never sees it.
  await pressInGame('Escape');
  await expect(byTestId('player-menu')).toBeVisible();
  expect(await gameKeysSeen()).toEqual([]);
  await expect.poll(focusedTestId).toBe('player-menu-resume');
  // Down past the stream's own actions to Exit.
  for (const id of [
    'player-menu-action-selkies-fullscreen',
    'player-menu-action-selkies-aspect-widescreen',
    'player-menu-action-selkies-aspect-standard',
    'player-menu-action-selkies-aspect-reset',
    'player-menu-action-selkies-gamepad-capture',
    'player-menu-exit',
  ]) {
    await page.keyboard.press('ArrowDown');
    await expect.poll(focusedTestId).toBe(id);
  }
  await page.keyboard.press('Enter');
  await expect(byTestId('game-details-screen')).toBeVisible();
  // Leaving the player releases the container.
  await expect
    .poll(() => romm.requests)
    .toContain('DELETE /api/streaming/sessions/gb');
});

test('remembers the sign-in across restarts', async () => {
  await app.close();
  await launch();
  await expect(byTestId('main-screen')).toBeVisible();
});
