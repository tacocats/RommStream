import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { DeviceEventEmitter } from 'react-native';
import { requestTVFocus } from '../../../input/tvFocus';
import { PlayerMenuAction } from '../PlayerMenu';
import { WebPlayerScreen } from '../WebPlayerScreen';

jest.mock('../../../input/tvFocus');

const mockedRequestTVFocus = jest.mocked(requestTVFocus);

const SERVER = 'https://romm.test';
const PLAY_URL = `${SERVER}/rom/5/ejs`;
const AUTO_PLAY_SCRIPT = 'AUTO_PLAY_SCRIPT_MARKER';

function pageMessage(payload: unknown) {
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

async function renderPlayer(
  onExit = jest.fn(),
  menuActions?: (send: (script: string) => void) => PlayerMenuAction[],
) {
  await render(
    <WebPlayerScreen
      romName="Zelda"
      playUrl={PLAY_URL}
      autoPlayScript={AUTO_PLAY_SCRIPT}
      onExit={onExit}
      menuActions={menuActions}
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

describe('WebPlayerScreen', () => {
  it('loads the play URL and runs the auto-play script there', async () => {
    const { webview } = await renderPlayer();

    expect(webview.props.source).toEqual({ uri: PLAY_URL });
    expect(webview.props.injectedJavaScript).toBe(AUTO_PLAY_SCRIPT);
  });

  it('ignores page messages it does not know', async () => {
    const { webview } = await renderPlayer();

    await fireEvent(webview, 'message', pageMessage({ type: 'other' }));
    await fireEvent(webview, 'message', { nativeEvent: { data: 'not json' } });

    expect(screen.getByTestId('player-webview').props.source).toEqual({
      uri: PLAY_URL,
    });
    expect(screen.queryByTestId('player-error')).toBeNull();
  });

  it('takes Android focus when the page reports the canvas is focused', async () => {
    const { webview: player } = await renderPlayer();
    const { requestFocus } = player.props.imperativeHandle;
    requestFocus.mockClear();

    await fireEvent(player, 'message', pageMessage({ type: 'canvas' }));

    expect(requestFocus).toHaveBeenCalled();
  });

  describe('pause menu', () => {
    it('opens on Back instead of leaving the game', async () => {
      const { onExit } = await renderPlayer();

      await pressBack();

      expect(screen.getByTestId('player-menu')).toBeOnTheScreen();
      expect(screen.getByText('Zelda')).toBeOnTheScreen();
      expect(onExit).not.toHaveBeenCalled();
    });

    it('takes focus off the game as it opens', async () => {
      await renderPlayer();
      await pressBack();

      await layOutMenu();

      // The WebView holds Android focus while the game runs, so the menu has
      // to ask for it — `autoFocus` alone never fires.
      expect(mockedRequestTVFocus).toHaveBeenCalled();
    });

    it('keeps focus while the page reports the canvas behind it', async () => {
      const { webview: player } = await renderPlayer();
      await pressBack();
      const { requestFocus } = player.props.imperativeHandle;
      requestFocus.mockClear();

      await fireEvent(player, 'message', pageMessage({ type: 'canvas' }));

      expect(requestFocus).not.toHaveBeenCalled();
      expect(screen.getByTestId('player-menu')).toBeOnTheScreen();
    });

    it('closes again on a second Back', async () => {
      await renderPlayer();

      await pressBack();
      await pressBack();

      expect(screen.queryByTestId('player-menu')).toBeNull();
    });

    it('resumes the game and hands focus back to the WebView', async () => {
      const { webview: player } = await renderPlayer();
      await pressBack();
      const { requestFocus } = player.props.imperativeHandle;
      requestFocus.mockClear();

      await fireEvent.press(screen.getByTestId('player-menu-resume'));

      expect(screen.queryByTestId('player-menu')).toBeNull();
      expect(requestFocus).toHaveBeenCalled();
    });

    it('leaves the game from the exit item', async () => {
      const { onExit } = await renderPlayer();
      await pressBack();

      await fireEvent.press(screen.getByTestId('player-menu-exit'));

      expect(onExit).toHaveBeenCalled();
    });

    it('is not armed once the player has failed', async () => {
      const { webview: player } = await renderPlayer();
      await fireEvent(player, 'error', {
        nativeEvent: { description: 'net::ERR_CONNECTION_REFUSED' },
      });
      expect(screen.getByTestId('player-error')).toBeOnTheScreen();

      await pressBack();

      expect(screen.queryByTestId('player-menu')).toBeNull();
    });
  });

  describe('extra menu actions', () => {
    it('renders none by default', async () => {
      await renderPlayer();
      await pressBack();

      expect(screen.queryByTestId('player-menu-action-test-action')).toBeNull();
    });

    it('runs a supplied action and closes the menu', async () => {
      const onSelect = jest.fn();
      const { webview: player } = await renderPlayer(jest.fn(), send => [
        {
          id: 'test-action',
          label: 'Test Action',
          onSelect: () => onSelect(send),
        },
      ]);
      await pressBack();
      const { requestFocus, injectJavaScript } = player.props.imperativeHandle;
      requestFocus.mockClear();

      expect(screen.getByText('Test Action')).toBeOnTheScreen();
      await fireEvent.press(
        screen.getByTestId('player-menu-action-test-action'),
      );

      expect(onSelect).toHaveBeenCalledWith(expect.any(Function));
      expect(screen.queryByTestId('player-menu')).toBeNull();
      expect(requestFocus).toHaveBeenCalled();

      // The `send` handed to the builder injects into this WebView instance.
      const send = onSelect.mock.calls[0][0];
      send('SOME_SCRIPT');
      expect(injectJavaScript).toHaveBeenCalledWith('SOME_SCRIPT');
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
