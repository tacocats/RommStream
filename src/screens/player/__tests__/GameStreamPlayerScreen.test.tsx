import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { DeviceEventEmitter } from 'react-native';
import {
  heartbeatStreamingSession,
  releaseStreamingSession,
} from '../../../api/rommClient';
import { useAuth } from '../../../auth/AuthContext';
import { createAuthValue } from '../../../testUtils/mockAuth';
import { createScreenProps } from '../../../testUtils/navigation';
import { GameStreamPlayerScreen } from '../GameStreamPlayerScreen';

jest.mock('../../../auth/AuthContext');
jest.mock('../../../api/rommClient');
jest.mock('../../../input/tvFocus');

const mockedUseAuth = jest.mocked(useAuth);
const mockedHeartbeat = jest.mocked(heartbeatStreamingSession);
const mockedRelease = jest.mocked(releaseStreamingSession);

const SERVER = 'https://romm.test';
const PLAY_URL = 'https://stream.test/room/abc';

function loginMessage(payload: unknown) {
  return { nativeEvent: { data: JSON.stringify(payload) } };
}

async function renderPlayer() {
  const screenProps = createScreenProps('GameStreamPlayer', {
    romId: 5,
    romName: 'Zelda',
    playUrl: PLAY_URL,
    platform: 'psx',
    container: 'romm-psx',
  });
  const rendered = await render(
    <GameStreamPlayerScreen {...screenProps.props} />,
  );
  const webview = await screen.findByTestId('player-webview');
  return { ...screenProps, rendered, webview };
}

beforeEach(() => {
  mockedUseAuth.mockReturnValue(
    createAuthValue({
      serverUrl: SERVER,
      username: 'player',
      password: 'p@ss',
    }),
  );
  mockedHeartbeat.mockResolvedValue({ status: 'active', platform: 'psx' });
  mockedRelease.mockResolvedValue(undefined);
});

describe('GameStreamPlayerScreen', () => {
  it("loads the session's room URL once signed in", async () => {
    const { webview } = await renderPlayer();

    await fireEvent(
      webview,
      'message',
      loginMessage({ type: 'login', ok: true, status: 200 }),
    );

    expect(screen.getByTestId('player-webview').props.source).toEqual({
      uri: PLAY_URL,
    });
  });

  it('focuses the stream core on the room page rather than driving a lobby', async () => {
    const { webview } = await renderPlayer();

    await fireEvent(
      webview,
      'message',
      loginMessage({ type: 'login', ok: true, status: 200 }),
    );

    const script =
      screen.getByTestId('player-webview').props.injectedJavaScript;
    expect(script).toContain("getElementById('session-frame')");
    expect(script).not.toContain('stream on');
  });

  describe('session lifetime', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('sends a heartbeat every 30 seconds', async () => {
      await renderPlayer();
      expect(mockedHeartbeat).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(30 * 1000);
      });

      expect(mockedHeartbeat).toHaveBeenCalledWith(
        SERVER,
        'access-token',
        'psx',
        'romm-psx',
      );
    });

    it('releases the session, saving, when the player closes', async () => {
      const { rendered } = await renderPlayer();

      await rendered.unmount();

      expect(mockedRelease).toHaveBeenCalledWith(
        SERVER,
        'access-token',
        'psx',
        { container: 'romm-psx' },
      );
    });

    it('leaves the player when the server reports the session ended', async () => {
      mockedHeartbeat.mockResolvedValue({ status: 'ended', platform: 'psx' });
      const { rendered, navigation } = await renderPlayer();

      await act(async () => {
        jest.advanceTimersByTime(30 * 1000);
      });
      expect(navigation.goBack).toHaveBeenCalled();

      // Nothing left to release.
      await rendered.unmount();
      expect(mockedRelease).not.toHaveBeenCalled();
    });
  });

  it("wires the pause menu's exit item to navigation.goBack", async () => {
    const { webview, navigation } = await renderPlayer();
    await fireEvent(
      webview,
      'message',
      loginMessage({ type: 'login', ok: true, status: 200 }),
    );

    await act(async () => {
      DeviceEventEmitter.emit('rommstream.hardwareKey', {
        key: 'back',
        keyCode: 4,
      });
    });
    await fireEvent.press(screen.getByTestId('player-menu-exit'));

    expect(navigation.goBack).toHaveBeenCalled();
  });

  async function openMenuAfterSignIn() {
    const { webview } = await renderPlayer();
    await fireEvent(
      webview,
      'message',
      loginMessage({ type: 'login', ok: true, status: 200 }),
    );
    const player = screen.getByTestId('player-webview');

    await act(async () => {
      DeviceEventEmitter.emit('rommstream.hardwareKey', {
        key: 'back',
        keyCode: 4,
      });
    });

    return player;
  }

  it('requests fullscreen via the selkies postMessage API', async () => {
    const player = await openMenuAfterSignIn();

    await fireEvent.press(
      screen.getByTestId('player-menu-action-selkies-fullscreen'),
    );

    const { injectJavaScript } = player.props.imperativeHandle;
    expect(injectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('postMessage'),
    );
    expect(injectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('"type":"requestFullscreen"'),
    );
  });

  it.each([
    ['selkies-aspect-widescreen', '"width":1920', '"height":1080'],
    ['selkies-aspect-standard', '"width":1440', '"height":1080'],
  ])(
    'sets the streamed resolution for %s',
    async (testId, ...expectedFields) => {
      const player = await openMenuAfterSignIn();

      await fireEvent.press(screen.getByTestId(`player-menu-action-${testId}`));

      const { injectJavaScript } = player.props.imperativeHandle;
      expect(injectJavaScript).toHaveBeenCalledWith(
        expect.stringContaining('"type":"setManualResolution"'),
      );
      expectedFields.forEach(field => {
        expect(injectJavaScript).toHaveBeenCalledWith(
          expect.stringContaining(field),
        );
      });
    },
  );

  it('resets the resolution to fit the window', async () => {
    const player = await openMenuAfterSignIn();

    await fireEvent.press(
      screen.getByTestId('player-menu-action-selkies-aspect-reset'),
    );

    const { injectJavaScript } = player.props.imperativeHandle;
    expect(injectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('"type":"resetResolutionToWindow"'),
    );
  });

  it('toggles gamepad capture and flips the menu label', async () => {
    const player = await openMenuAfterSignIn();

    expect(screen.getByText('Disable Gamepad Capture')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByTestId('player-menu-action-selkies-gamepad-capture'),
    );

    const { injectJavaScript } = player.props.imperativeHandle;
    expect(injectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('"type":"gamepadControl"'),
    );
    expect(injectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('"enabled":false'),
    );

    // Reopen the menu (the previous selection closed it) to see the flipped label.
    await act(async () => {
      DeviceEventEmitter.emit('rommstream.hardwareKey', {
        key: 'back',
        keyCode: 4,
      });
    });
    expect(screen.getByText('Enable Gamepad Capture')).toBeOnTheScreen();
  });
});
