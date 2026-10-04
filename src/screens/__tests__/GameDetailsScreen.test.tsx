import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import {
  getConfig,
  getHeartbeat,
  getRom,
  getStreamingConfig,
} from '../../api/rommClient';
import { startStreamingSession } from '../../api/streamingSession';
import {
  MemoryCardImportRequiredError,
  RommApiError,
  RommRomDetail,
} from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { setInBrowserPlayEnabled } from '../../settings/settingsStore';
import { createAuthValue } from '../../testUtils/mockAuth';
import { createScreenProps } from '../../testUtils/navigation';
import { GameDetailsScreen } from '../GameDetailsScreen';

jest.mock('../../auth/AuthContext');
jest.mock('../../api/rommClient');
jest.mock('../../api/streamingSession');

const mockedUseAuth = jest.mocked(useAuth);
const mockedGetRom = jest.mocked(getRom);
const mockedGetHeartbeat = jest.mocked(getHeartbeat);
const mockedGetConfig = jest.mocked(getConfig);
const mockedGetStreamingConfig = jest.mocked(getStreamingConfig);
const mockedStartStreamingSession = jest.mocked(startStreamingSession);

const SESSION = {
  url: 'https://stream.test/room/abc',
  platform: 'psx',
  container: 'romm-psx',
  label: 'DuckStation',
  romName: "Tony Hawk's Pro Skater 2",
  resumed: true,
};

const ROM: RommRomDetail = {
  id: 5,
  name: "Tony Hawk's Pro Skater 2",
  platform_id: 3,
  platform_slug: 'psx',
  platform_display_name: 'PlayStation',
  url_cover: '/assets/romm/resources/5/cover.png',
  summary: 'A skateboarding sports game played from a third-person view.',
  regions: ['USA'],
  is_identified: true,
  metadatum: {
    genres: ['Sport'],
    franchises: ["Tony Hawk's"],
    collections: ["Tony Hawk's"],
    companies: ['Activision', 'Neversoft Entertainment'],
    publishers: ['Activision'],
    developers: ['Neversoft Entertainment'],
    game_modes: ['Single player'],
    age_ratings: ['ESRB T'],
    player_count: '1',
    first_release_date: 969321600,
    average_rating: 9.1,
  },
};

function renderScreen() {
  const screenProps = createScreenProps('GameDetails', {
    romId: 5,
    romName: "Tony Hawk's Pro Skater 2",
    platformSlug: 'psx',
  });
  return {
    ...screenProps,
    rendered: render(<GameDetailsScreen {...screenProps.props} />),
  };
}

beforeEach(() => {
  mockedUseAuth.mockReturnValue(createAuthValue());
  mockedGetHeartbeat.mockResolvedValue({ EMULATION: {} });
  mockedGetConfig.mockResolvedValue({});
  mockedGetStreamingConfig.mockResolvedValue({
    enabled: false,
    containers: [],
  });
});

describe('GameDetailsScreen', () => {
  it('sets the header title and shows the title, cover placeholder and Play button immediately', async () => {
    mockedGetRom.mockReturnValueOnce(new Promise(() => {}));
    const { navigation, rendered } = renderScreen();
    await rendered;

    expect(navigation.setOptions).toHaveBeenCalledWith({
      title: "Tony Hawk's Pro Skater 2",
    });
    expect(screen.getByText("Tony Hawk's Pro Skater 2")).toBeOnTheScreen();
    expect(
      screen.getByTestId('game-details-cover-placeholder'),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('play-button')).toBeOnTheScreen();
    expect(screen.getByTestId('game-details-loading')).toBeOnTheScreen();
  });

  it('shows the game title, cover and metadata once loaded', async () => {
    mockedGetRom.mockResolvedValueOnce(ROM);
    await renderScreen().rendered;

    expect(
      await screen.findByText("Tony Hawk's Pro Skater 2"),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('game-details-cover').props.source).toEqual({
      uri: 'https://romm.test/assets/romm/resources/5/cover.png',
    });
    expect(screen.getByText('PlayStation')).toBeOnTheScreen();
    expect(screen.getByText('· Sep 19, 2000')).toBeOnTheScreen();
    expect(screen.getByText('USA')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'A skateboarding sports game played from a third-person view.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('1')).toBeOnTheScreen();
    expect(screen.getByText('ESRB T')).toBeOnTheScreen();
    expect(screen.getByText('Sport')).toBeOnTheScreen();
    expect(screen.getByText('Activision')).toBeOnTheScreen();
    expect(screen.getAllByText("Tony Hawk's").length).toBeGreaterThan(0);

    expect(mockedGetRom).toHaveBeenCalledWith(
      'https://romm.test',
      'access-token',
      5,
    );
  });

  it('falls back to a gradient placeholder when there is no cover', async () => {
    mockedGetRom.mockResolvedValueOnce({ ...ROM, url_cover: undefined });
    await renderScreen().rendered;

    expect(
      await screen.findByTestId('game-details-cover-placeholder'),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('game-details-cover')).toBeNull();
  });

  it('launches the in-browser player with the Play button when it is enabled', async () => {
    await setInBrowserPlayEnabled(true);
    mockedGetRom.mockResolvedValueOnce(ROM);
    const { navigation, rendered } = renderScreen();
    await rendered;

    await fireEvent.press(await screen.findByTestId('play-button'));

    expect(navigation.navigate).toHaveBeenCalledWith('EmulatorPlayer', {
      romId: 5,
      romName: "Tony Hawk's Pro Skater 2",
      playUrl: 'https://romm.test/rom/5/ejs',
    });
  });

  describe('streaming', () => {
    beforeEach(() => {
      mockedGetStreamingConfig.mockResolvedValue({
        enabled: true,
        containers: [{ platform: 'psx', container: 'romm-psx' }],
      });
      mockedGetRom.mockResolvedValueOnce(ROM);
    });

    async function pressPlay() {
      const screenProps = renderScreen();
      await screenProps.rendered;
      // Let the play path resolve to the stream before pressing.
      await screen.findByText(ROM.summary as string);
      await fireEvent.press(screen.getByTestId('play-button'));
      return screenProps;
    }

    it('claims a session and opens the player on its room URL', async () => {
      mockedStartStreamingSession.mockResolvedValueOnce(SESSION);
      const { navigation } = await pressPlay();

      expect(mockedStartStreamingSession).toHaveBeenCalledWith(
        'https://romm.test',
        'access-token',
        5,
        expect.objectContaining({ cardImport: undefined }),
      );
      expect(navigation.navigate).toHaveBeenCalledWith('GameStreamPlayer', {
        romId: 5,
        romName: "Tony Hawk's Pro Skater 2",
        playUrl: 'https://stream.test/room/abc',
        platform: 'psx',
        container: 'romm-psx',
      });
    });

    it('shows progress while the container starts, ignoring repeat presses', async () => {
      let reportPhase: (phase: string) => void = () => {};
      mockedStartStreamingSession.mockImplementationOnce(
        (_url, _token, _romId, options) => {
          reportPhase = phase => options?.onPhase?.(phase);
          return new Promise(() => {});
        },
      );
      await pressPlay();

      expect(screen.getByTestId('stream-launching')).toBeOnTheScreen();
      expect(screen.getByText('Starting stream…')).toBeOnTheScreen();

      await act(async () => reportPhase('extracting'));
      expect(
        screen.getByText('Starting stream (extracting)…'),
      ).toBeOnTheScreen();

      await fireEvent.press(screen.getByTestId('play-button'));
      expect(mockedStartStreamingSession).toHaveBeenCalledTimes(1);
    });

    it('cancels the launch when the screen goes away', async () => {
      let signal: AbortSignal | undefined;
      mockedStartStreamingSession.mockImplementationOnce(
        (_url, _token, _romId, options) => {
          signal = options?.signal;
          return new Promise(() => {});
        },
      );
      const { rendered } = await pressPlay();

      await (await rendered).unmount();

      expect(signal?.aborted).toBe(true);
    });

    it('explains a busy server and lets Play try again', async () => {
      mockedStartStreamingSession.mockRejectedValueOnce(
        new RommApiError('All containers busy', 409),
      );
      await pressPlay();

      expect(await screen.findByTestId('stream-error')).toHaveTextContent(
        'Every streaming container for this platform is busy. Try again shortly.',
      );
      expect(screen.getByText('Play')).toBeOnTheScreen();
    });

    it("passes other 403s through in the server's own words", async () => {
      mockedStartStreamingSession.mockRejectedValueOnce(
        new RommApiError('CSRF token verification failed', 403),
      );
      await pressPlay();

      expect(await screen.findByTestId('stream-error')).toHaveTextContent(
        'CSRF token verification failed',
      );
    });

    it('asks for a fresh sign-in when the token cannot start streams', async () => {
      mockedStartStreamingSession.mockRejectedValueOnce(
        new RommApiError('Forbidden', 403),
      );
      await pressPlay();

      expect(await screen.findByTestId('stream-error')).toHaveTextContent(
        /Sign out and sign in again/,
      );
    });

    it('asks what to do with a leftover memory card, then claims again with the answer', async () => {
      mockedStartStreamingSession
        .mockRejectedValueOnce(
          new MemoryCardImportRequiredError({
            code: 'memory_card_import_required',
            outcome: 'found',
            summary: { file_count: 2, total_bytes: 1024, game_codes: ['SLUS'] },
          }),
        )
        .mockResolvedValueOnce(SESSION);
      const { navigation } = await pressPlay();

      expect(await screen.findByTestId('memory-card-prompt')).toHaveTextContent(
        /2 file\(s\) \(SLUS\)/,
      );

      await fireEvent.press(screen.getByTestId('memory-card-discard'));

      expect(mockedStartStreamingSession).toHaveBeenLastCalledWith(
        'https://romm.test',
        'access-token',
        5,
        expect.objectContaining({ cardImport: 'discard' }),
      );
      expect(navigation.navigate).toHaveBeenCalledWith(
        'GameStreamPlayer',
        expect.objectContaining({ playUrl: SESSION.url }),
      );
      expect(screen.queryByTestId('memory-card-prompt')).toBeNull();
    });
  });

  it('falls back to the plain rom page while the detail fetch is still pending', async () => {
    mockedGetRom.mockReturnValueOnce(new Promise(() => {}));
    const { navigation, rendered } = renderScreen();
    await rendered;

    await fireEvent.press(screen.getByTestId('play-button'));

    expect(navigation.navigate).toHaveBeenCalledWith('EmulatorPlayer', {
      romId: 5,
      romName: "Tony Hawk's Pro Skater 2",
      playUrl: 'https://romm.test/rom/5',
    });
  });

  it('hides Play and explains why when nothing can launch the rom', async () => {
    await setInBrowserPlayEnabled(true);
    mockedGetRom.mockResolvedValueOnce({ ...ROM, platform_slug: 'switch' });
    await renderScreen().rendered;

    expect(await screen.findByTestId('no-player-notice')).toBeOnTheScreen();
    expect(screen.queryByTestId('play-button')).toBeNull();
    expect(
      screen.getByText(/no in-browser player for PlayStation/),
    ).toBeOnTheScreen();
  });

  it('needs a streaming container by default, with in-browser play off', async () => {
    mockedGetRom.mockResolvedValueOnce(ROM);
    await renderScreen().rendered;

    expect(await screen.findByTestId('no-player-notice')).toBeOnTheScreen();
    expect(screen.queryByTestId('play-button')).toBeNull();
    expect(
      screen.getByText(
        'Your server has no streaming container for this platform.',
      ),
    ).toBeOnTheScreen();
  });

  it('keeps Play when the platform has a streaming container', async () => {
    mockedGetStreamingConfig.mockResolvedValue({
      enabled: true,
      containers: [{ platform: 'psx', container: 'romm-psx' }],
    });
    mockedGetRom.mockResolvedValueOnce(ROM);
    await renderScreen().rendered;

    expect(await screen.findByText('Sport')).toBeOnTheScreen();
    expect(screen.getByTestId('play-button')).toBeOnTheScreen();
    expect(screen.queryByTestId('no-player-notice')).toBeNull();
  });

  it('shows the error and retries', async () => {
    mockedGetRom
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce(ROM);
    await renderScreen().rendered;

    expect(await screen.findByText('Failed to fetch')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('retry-button'));

    expect(
      await screen.findByText("Tony Hawk's Pro Skater 2"),
    ).toBeOnTheScreen();
    expect(mockedGetRom).toHaveBeenCalledTimes(2);
  });
});
