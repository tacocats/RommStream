import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import {
  getConfig,
  getHeartbeat,
  getRom,
  getStreamingConfig,
} from '../../api/rommClient';
import { RommRomDetail } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { setInBrowserPlayEnabled } from '../../settings/settingsStore';
import { createAuthValue } from '../../testUtils/mockAuth';
import { createScreenProps } from '../../testUtils/navigation';
import { GameDetailsScreen } from '../GameDetailsScreen';

jest.mock('../../auth/AuthContext');
jest.mock('../../api/rommClient');

const mockedUseAuth = jest.mocked(useAuth);
const mockedGetRom = jest.mocked(getRom);
const mockedGetHeartbeat = jest.mocked(getHeartbeat);
const mockedGetConfig = jest.mocked(getConfig);
const mockedGetStreamingConfig = jest.mocked(getStreamingConfig);

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

  it('launches the emulator player with the Play button', async () => {
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

  it('launches the stream player when that is what resolved', async () => {
    mockedGetStreamingConfig.mockResolvedValue({
      enabled: true,
      containers: [{ platform: 'psx', container: 'romm-psx' }],
    });
    mockedGetRom.mockResolvedValueOnce(ROM);
    const { navigation, rendered } = renderScreen();
    await rendered;

    await fireEvent.press(await screen.findByTestId('play-button'));

    expect(navigation.navigate).toHaveBeenCalledWith('GameStreamPlayer', {
      romId: 5,
      romName: "Tony Hawk's Pro Skater 2",
      playUrl: 'https://romm.test/rom/5/stream',
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
    mockedGetRom.mockResolvedValueOnce({ ...ROM, platform_slug: 'switch' });
    await renderScreen().rendered;

    expect(await screen.findByTestId('no-player-notice')).toBeOnTheScreen();
    expect(screen.queryByTestId('play-button')).toBeNull();
    expect(
      screen.getByText(/no in-browser player for PlayStation/),
    ).toBeOnTheScreen();
  });

  it('points at the setting when in-browser play is what is missing', async () => {
    await setInBrowserPlayEnabled(false);
    mockedGetRom.mockResolvedValueOnce(ROM);
    await renderScreen().rendered;

    expect(await screen.findByTestId('no-player-notice')).toBeOnTheScreen();
    expect(
      screen.getByText(/In-Browser Play is turned off in Settings/),
    ).toBeOnTheScreen();
  });

  it('keeps Play when the platform has a streaming container', async () => {
    await setInBrowserPlayEnabled(false);
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
