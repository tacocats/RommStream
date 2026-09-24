import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { DeviceEventEmitter } from 'react-native';
import { useAuth } from '../../../auth/AuthContext';
import { requestTVFocus } from '../../../input/tvFocus';
import { setLoginPath } from '../../../settings/settingsStore';
import { createAuthValue } from '../../../testUtils/mockAuth';
import { WebPlayerScreen } from '../WebPlayerScreen';

jest.mock('../../../auth/AuthContext');
jest.mock('../../../input/tvFocus');

const mockedUseAuth = jest.mocked(useAuth);
const mockedRequestTVFocus = jest.mocked(requestTVFocus);

const SERVER = 'https://romm.test';
const PLAY_URL = `${SERVER}/rom/5/ejs`;
const AUTO_PLAY_SCRIPT = 'AUTO_PLAY_SCRIPT_MARKER';

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

async function renderPlayer(onExit = jest.fn()) {
  await render(
    <WebPlayerScreen
      romName="Zelda"
      playUrl={PLAY_URL}
      autoPlayScript={AUTO_PLAY_SCRIPT}
      onExit={onExit}
    />,
  );
  const webview = await screen.findByTestId('player-webview');
  return { webview, onExit };
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
});

describe('WebPlayerScreen', () => {
  it('bootstraps the WebView with the login script', async () => {
    const { webview } = await renderPlayer();

    expect(screen.queryByTestId('player-loading')).toBeNull();
    expect(webview.props.source).toEqual({ uri: `${SERVER}/api/heartbeat` });
    expect(webview.props.injectedJavaScript).toContain('fetch("/api/login"');
    expect(webview.props.injectedJavaScript).toContain('"player"');
    expect(webview.props.injectedJavaScript).toContain('"p@ss"');
    expect(screen.getByText(`Signing in to ${SERVER}…`)).toBeOnTheScreen();
  });

  it('honours the stored login path', async () => {
    await setLoginPath('/custom/login');
    const { webview } = await renderPlayer();

    expect(webview.props.injectedJavaScript).toContain('fetch("/custom/login"');
  });

  it('switches to the play URL and runs the auto-play script once login succeeds', async () => {
    const { webview } = await renderPlayer();

    const player = await signIn(webview);

    expect(player.props.source).toEqual({ uri: PLAY_URL });
    expect(player.props.injectedJavaScript).toBe(AUTO_PLAY_SCRIPT);
    expect(screen.queryByText(/Signing in/)).toBeNull();
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

  it('takes Android focus when the page reports the canvas is focused', async () => {
    const { webview } = await renderPlayer();
    const player = await signIn(webview);
    const { requestFocus } = player.props.imperativeHandle;
    requestFocus.mockClear();

    await fireEvent(player, 'message', loginMessage({ type: 'canvas' }));

    expect(requestFocus).toHaveBeenCalled();
  });

  describe('pause menu', () => {
    it('opens on Back instead of leaving the game', async () => {
      const { webview, onExit } = await renderPlayer();
      await signIn(webview);

      await pressBack();

      expect(screen.getByTestId('player-menu')).toBeOnTheScreen();
      expect(screen.getByText('Zelda')).toBeOnTheScreen();
      expect(onExit).not.toHaveBeenCalled();
    });

    it('takes focus off the game as it opens', async () => {
      const { webview } = await renderPlayer();
      await signIn(webview);
      await pressBack();

      await layOutMenu();

      // The WebView holds Android focus while the game runs, so the menu has
      // to ask for it — `autoFocus` alone never fires.
      expect(mockedRequestTVFocus).toHaveBeenCalled();
    });

    it('keeps focus while the page reports the canvas behind it', async () => {
      const { webview } = await renderPlayer();
      const player = await signIn(webview);
      await pressBack();
      const { requestFocus } = player.props.imperativeHandle;
      requestFocus.mockClear();

      await fireEvent(player, 'message', loginMessage({ type: 'canvas' }));

      expect(requestFocus).not.toHaveBeenCalled();
      expect(screen.getByTestId('player-menu')).toBeOnTheScreen();
    });

    it('closes again on a second Back', async () => {
      const { webview } = await renderPlayer();
      await signIn(webview);

      await pressBack();
      await pressBack();

      expect(screen.queryByTestId('player-menu')).toBeNull();
    });

    it('resumes the game and hands focus back to the WebView', async () => {
      const { webview } = await renderPlayer();
      const player = await signIn(webview);
      await pressBack();
      const { requestFocus } = player.props.imperativeHandle;
      requestFocus.mockClear();

      await fireEvent.press(screen.getByTestId('player-menu-resume'));

      expect(screen.queryByTestId('player-menu')).toBeNull();
      expect(requestFocus).toHaveBeenCalled();
    });

    it('leaves the game from the exit item', async () => {
      const { webview, onExit } = await renderPlayer();
      await signIn(webview);
      await pressBack();

      await fireEvent.press(screen.getByTestId('player-menu-exit'));

      expect(onExit).toHaveBeenCalled();
    });

    it('is not armed while still signing in', async () => {
      await renderPlayer();

      await pressBack();

      expect(screen.queryByTestId('player-menu')).toBeNull();
    });

    it('is not armed once the player has failed', async () => {
      const { webview } = await renderPlayer();
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
