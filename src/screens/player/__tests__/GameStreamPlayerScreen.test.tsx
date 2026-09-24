import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { DeviceEventEmitter } from 'react-native';
import { useAuth } from '../../../auth/AuthContext';
import { createAuthValue } from '../../../testUtils/mockAuth';
import { createScreenProps } from '../../../testUtils/navigation';
import { GameStreamPlayerScreen } from '../GameStreamPlayerScreen';

jest.mock('../../../auth/AuthContext');
jest.mock('../../../input/tvFocus');

const mockedUseAuth = jest.mocked(useAuth);

const SERVER = 'https://romm.test';
const PLAY_URL = `${SERVER}/rom/5/stream`;

function loginMessage(payload: unknown) {
  return { nativeEvent: { data: JSON.stringify(payload) } };
}

async function renderPlayer() {
  const screenProps = createScreenProps('GameStreamPlayer', {
    romId: 5,
    romName: 'Zelda',
    playUrl: PLAY_URL,
  });
  await render(<GameStreamPlayerScreen {...screenProps.props} />);
  const webview = await screen.findByTestId('player-webview');
  return { ...screenProps, webview };
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

describe('GameStreamPlayerScreen', () => {
  it('loads the resolved stream URL once signed in', async () => {
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

  it('runs the stream launch script, which presses "Stream on" and focuses the video', async () => {
    const { webview } = await renderPlayer();

    await fireEvent(
      webview,
      'message',
      loginMessage({ type: 'login', ok: true, status: 200 }),
    );

    const script =
      screen.getByTestId('player-webview').props.injectedJavaScript;
    expect(script).toContain('stream on');
    expect(script).toContain("querySelector('video')");
    expect(script).toContain('focusGameSurface');
    expect(script).toContain('dismissNewVersionToast');
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
});
