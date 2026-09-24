import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { DeviceEventEmitter } from 'react-native';
import { useAuth } from '../../../auth/AuthContext';
import { createAuthValue } from '../../../testUtils/mockAuth';
import { createScreenProps } from '../../../testUtils/navigation';
import { EmulatorPlayerScreen } from '../EmulatorPlayerScreen';

jest.mock('../../../auth/AuthContext');
jest.mock('../../../input/tvFocus');

const mockedUseAuth = jest.mocked(useAuth);

const SERVER = 'https://romm.test';
const PLAY_URL = `${SERVER}/rom/5/ejs`;

function loginMessage(payload: unknown) {
  return { nativeEvent: { data: JSON.stringify(payload) } };
}

async function renderPlayer() {
  const screenProps = createScreenProps('EmulatorPlayer', {
    romId: 5,
    romName: 'Zelda',
    playUrl: PLAY_URL,
  });
  await render(<EmulatorPlayerScreen {...screenProps.props} />);
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

describe('EmulatorPlayerScreen', () => {
  it('loads the resolved play URL once signed in', async () => {
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

  it('runs the emulator launch script, which presses Play and focuses the game surface', async () => {
    const { webview } = await renderPlayer();

    await fireEvent(
      webview,
      'message',
      loginMessage({ type: 'login', ok: true, status: 200 }),
    );

    const script =
      screen.getByTestId('player-webview').props.injectedJavaScript;
    expect(script).toContain('play-button');
    expect(script).toContain('focusGameSurface');
    expect(script).toContain('disableTouchGamepad');
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
