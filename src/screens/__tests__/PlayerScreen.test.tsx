import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { DeviceEventEmitter } from 'react-native';
import {
  getConfig,
  getHeartbeat,
  getRom,
  getStreamingConfig,
} from '../../api/rommClient';
import { useAuth } from '../../auth/AuthContext';
import { requestTVFocus } from '../../input/tvFocus';
import {
  setInBrowserPlayEnabled,
  setLoginPath,
} from '../../settings/settingsStore';
import { createAuthValue } from '../../testUtils/mockAuth';
import { createScreenProps } from '../../testUtils/navigation';
import { PlayerScreen } from '../PlayerScreen';

jest.mock('../../auth/AuthContext');
jest.mock('../../api/rommClient');
jest.mock('../../input/tvFocus');

const mockedUseAuth = jest.mocked(useAuth);
const mockedRequestTVFocus = jest.mocked(requestTVFocus);
const mockedGetRom = jest.mocked(getRom);
const mockedGetHeartbeat = jest.mocked(getHeartbeat);
const mockedGetConfig = jest.mocked(getConfig);
const mockedGetStreamingConfig = jest.mocked(getStreamingConfig);

const SERVER = 'https://romm.test';

function loginMessage(payload: unknown) {
  return { nativeEvent: { data: JSON.stringify(payload) } };
}

/** What the native key interceptor sends when the remote's Back is pressed. */
async function pressBack() {
  await act(async () => {
    DeviceEventEmitter.emit('rommstream.hardwareKey', {
      key: 'back',
      keyCode: 4,
    });
  });
}

async function renderPlayer(platformSlug = 'snes', { romFails = false } = {}) {
  if (romFails) {
    mockedGetRom.mockRejectedValue(new Error('500'));
  } else {
    mockedGetRom.mockResolvedValue({
      id: 5,
      name: 'Zelda',
      platform_id: 1,
      platform_slug: platformSlug,
      has_file_on_disk: true,
    });
  }
  const screenProps = createScreenProps('Player', {
    romId: 5,
    romName: 'Zelda',
    platformSlug,
  });
  await render(<PlayerScreen {...screenProps.props} />);
  const webview = await screen.findByTestId('player-webview');
  return { ...screenProps, webview };
}

/** The menu's focus container reaching the screen, which is what takes focus. */
async function layOutMenu() {
  await act(async () => {
    fireEvent(screen.getByTestId('player-menu-items'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 280, height: 120 } },
    });
  });
}

/** Sign in, then hand back the WebView showing the game. */
async function signIn(webview: ReturnType<typeof screen.getByTestId>) {
  await fireEvent(
    webview,
    'message',
    loginMessage({ type: 'login', ok: true, status: 200 }),
  );
  return screen.getByTestId('player-webview');
}

beforeEach(() => {
  mockedUseAuth.mockReturnValue(
    createAuthValue({
      serverUrl: SERVER,
      username: 'player',
      password: 'p@ss',
    }),
  );
  mockedGetHeartbeat.mockResolvedValue({ EMULATION: {} });
  mockedGetConfig.mockResolvedValue({});
  mockedGetStreamingConfig.mockResolvedValue({
    enabled: false,
    containers: [],
  });
});

describe('PlayerScreen', () => {
  it('bootstraps the WebView with the login script', async () => {
    const { webview } = await renderPlayer();

    expect(screen.queryByTestId('player-loading')).toBeNull();
    expect(webview.props.source).toEqual({ uri: `${SERVER}/api/heartbeat` });
    expect(webview.props.injectedJavaScript).toContain('fetch("/api/login"');
    expect(webview.props.injectedJavaScript).toContain('"player"');
    expect(webview.props.injectedJavaScript).toContain('"p@ss"');
    expect(screen.getByText(`Signing in to ${SERVER}…`)).toBeOnTheScreen();
  });

  it('opens the web player for the rom once the login succeeds', async () => {
    const { webview } = await renderPlayer('snes');

    const player = await signIn(webview);

    expect(player.props.source).toEqual({ uri: `${SERVER}/rom/5/ejs` });
    expect(player.props.injectedJavaScript).not.toContain('/api/login');
    expect(player.props.injectedJavaScript).toContain('play-button');
    expect(screen.queryByText(/Signing in/)).toBeNull();
  });

  it('prefers the stream when the platform has a streaming container', async () => {
    mockedGetStreamingConfig.mockResolvedValue({
      enabled: true,
      containers: [{ platform: 'snes', container: 'romm-snes' }],
    });
    const { webview } = await renderPlayer('snes');

    expect((await signIn(webview)).props.source).toEqual({
      uri: `${SERVER}/rom/5/stream`,
    });
  });

  it('honours an emulator the server has switched off', async () => {
    mockedGetHeartbeat.mockResolvedValue({
      EMULATION: { DISABLE_EMULATOR_JS: true },
    });
    const { webview } = await renderPlayer('snes');

    expect((await signIn(webview)).props.source).toEqual({
      uri: `${SERVER}/rom/5`,
    });
  });

  it('still launches when the server lookups fail', async () => {
    // An older RomM has no /api/streaming/config; that must not stop the
    // launch, it just leaves streaming off.
    mockedGetStreamingConfig.mockRejectedValue(new Error('404'));
    mockedGetHeartbeat.mockRejectedValue(new Error('404'));
    mockedGetConfig.mockRejectedValue(new Error('404'));
    const { webview } = await renderPlayer('snes');

    expect((await signIn(webview)).props.source).toEqual({
      uri: `${SERVER}/rom/5/ejs`,
    });
  });

  it('falls back to the plain rom page when the rom lookup fails', async () => {
    const { webview } = await renderPlayer('snes', { romFails: true });

    expect((await signIn(webview)).props.source).toEqual({
      uri: `${SERVER}/rom/5`,
    });
  });

  it('keeps streaming on offer when in-browser play is disabled', async () => {
    await setInBrowserPlayEnabled(false);
    mockedGetStreamingConfig.mockResolvedValue({
      enabled: true,
      containers: [{ platform: 'snes', container: 'romm-snes' }],
    });
    const { webview } = await renderPlayer('snes');

    expect((await signIn(webview)).props.source).toEqual({
      uri: `${SERVER}/rom/5/stream`,
    });
  });

  it('falls back to the plain rom page when in-browser play is disabled', async () => {
    await setInBrowserPlayEnabled(false);
    const { webview } = await renderPlayer('snes');

    expect((await signIn(webview)).props.source).toEqual({
      uri: `${SERVER}/rom/5`,
    });
  });

  it('honours the stored login path', async () => {
    await setLoginPath('/custom/login');
    const { webview } = await renderPlayer('snes');

    expect(webview.props.injectedJavaScript).toContain('fetch("/custom/login"');
  });

  it('ignores messages that are not login results', async () => {
    const { webview } = await renderPlayer();

    await fireEvent(
      webview,
      'message',
      loginMessage({ type: 'other', ok: true }),
    );
    await fireEvent(webview, 'message', { nativeEvent: { data: 'not json' } });

    expect(screen.getByTestId('player-webview').props.source).toEqual({
      uri: `${SERVER}/api/heartbeat`,
    });
    expect(screen.getByText(/Signing in/)).toBeOnTheScreen();
  });

  it.each([
    [401, /rejected the username\/password/],
    [404, /Login endpoint not found at \/api\/login/],
    [500, /HTTP 500/],
  ])('explains a login failure with HTTP %i', async (status, message) => {
    const { webview } = await renderPlayer();

    await fireEvent(
      webview,
      'message',
      loginMessage({ type: 'login', ok: false, status }),
    );

    expect(screen.getByTestId('player-error')).toHaveTextContent(message);
    expect(screen.queryByText(/Signing in/)).toBeNull();
  });

  it('explains a login failure without a status', async () => {
    const { webview } = await renderPlayer();

    await fireEvent(
      webview,
      'message',
      loginMessage({
        type: 'login',
        ok: false,
        error: 'TypeError: Failed to fetch',
      }),
    );

    expect(screen.getByTestId('player-error')).toHaveTextContent(
      'Sign-in request failed: TypeError: Failed to fetch',
    );
  });

  it('focuses the game surface once the play button is pressed', async () => {
    const { webview } = await renderPlayer('snes');

    const script = (await signIn(webview)).props.injectedJavaScript;

    expect(script).toContain('focusGameSurface');
    expect(script).toContain('pointerdown');
    expect(script).toContain("post({ type: 'canvas' })");
  });

  it('takes Android focus when the page reports the canvas is focused', async () => {
    const { webview } = await renderPlayer('snes');
    const player = await signIn(webview);
    const { requestFocus } = player.props.imperativeHandle;
    requestFocus.mockClear();

    await fireEvent(player, 'message', loginMessage({ type: 'canvas' }));

    expect(requestFocus).toHaveBeenCalled();
  });

  describe('pause menu', () => {
    it('opens on Back instead of leaving the game', async () => {
      const { webview, navigation } = await renderPlayer('snes');
      await signIn(webview);

      await pressBack();

      expect(screen.getByTestId('player-menu')).toBeOnTheScreen();
      expect(screen.getByText('Zelda')).toBeOnTheScreen();
      expect(navigation.goBack).not.toHaveBeenCalled();
    });

    it('takes focus off the game as it opens', async () => {
      const { webview } = await renderPlayer('snes');
      await signIn(webview);
      await pressBack();

      await layOutMenu();

      // The WebView holds Android focus while the game runs, so the menu has
      // to ask for it — `autoFocus` alone never fires.
      expect(mockedRequestTVFocus).toHaveBeenCalled();
    });

    it('keeps focus while the page reports the canvas behind it', async () => {
      const { webview } = await renderPlayer('snes');
      const player = await signIn(webview);
      await pressBack();
      const { requestFocus } = player.props.imperativeHandle;
      requestFocus.mockClear();

      await fireEvent(player, 'message', loginMessage({ type: 'canvas' }));

      expect(requestFocus).not.toHaveBeenCalled();
      expect(screen.getByTestId('player-menu')).toBeOnTheScreen();
    });

    it('closes again on a second Back', async () => {
      const { webview } = await renderPlayer('snes');
      await signIn(webview);

      await pressBack();
      await pressBack();

      expect(screen.queryByTestId('player-menu')).toBeNull();
    });

    it('resumes the game and hands focus back to the WebView', async () => {
      const { webview } = await renderPlayer('snes');
      const player = await signIn(webview);
      await pressBack();
      const { requestFocus } = player.props.imperativeHandle;
      requestFocus.mockClear();

      await fireEvent.press(screen.getByTestId('player-menu-resume'));

      expect(screen.queryByTestId('player-menu')).toBeNull();
      expect(requestFocus).toHaveBeenCalled();
    });

    it('leaves the game from the exit item', async () => {
      const { webview, navigation } = await renderPlayer('snes');
      await signIn(webview);
      await pressBack();

      await fireEvent.press(screen.getByTestId('player-menu-exit'));

      expect(navigation.goBack).toHaveBeenCalled();
    });

    it('is not armed while still signing in', async () => {
      await renderPlayer('snes');

      await pressBack();

      expect(screen.queryByTestId('player-menu')).toBeNull();
    });

    it('is not armed once the player has failed', async () => {
      const { webview } = await renderPlayer('snes');
      const player = await signIn(webview);
      await fireEvent(player, 'error', {
        nativeEvent: { description: 'net::ERR_CONNECTION_REFUSED' },
      });
      expect(screen.getByTestId('player-error')).toBeOnTheScreen();

      await pressBack();

      expect(screen.queryByTestId('player-menu')).toBeNull();
    });
  });

  it('shows WebView load errors', async () => {
    const { webview } = await renderPlayer();

    await fireEvent(webview, 'error', {
      nativeEvent: { description: 'net::ERR_CONNECTION_REFUSED' },
    });

    expect(screen.getByTestId('player-error')).toHaveTextContent(
      'net::ERR_CONNECTION_REFUSED',
    );
  });
});
