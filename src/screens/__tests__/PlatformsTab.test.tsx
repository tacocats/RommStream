import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { getPlatforms } from '../../api/rommClient';
import { useAuth } from '../../auth/AuthContext';
import { createAuthValue } from '../../testUtils/mockAuth';
import { createScreenProps } from '../../testUtils/navigation';
import { PlatformsTab } from '../PlatformsTab';

jest.mock('../../auth/AuthContext');
jest.mock('../../api/rommClient');
// PlatformIcon fetches SVGs; it has its own tests.
jest.mock('../../components/PlatformIcon', () => ({
  PlatformIcon: () => null,
}));

const mockedUseAuth = jest.mocked(useAuth);
const mockedGetPlatforms = jest.mocked(getPlatforms);

const PLATFORMS = [
  { id: 2, name: 'Super Nintendo', slug: 'snes', rom_count: 12 },
  { id: 1, name: 'Game Boy', slug: 'gb', rom_count: 1 },
  { id: 3, name: 'Arcade', fs_slug: 'arcade' },
];

function renderTab() {
  const { navigation, props } = createScreenProps('Main', undefined);
  return {
    navigation,
    rendered: render(<PlatformsTab navigation={props.navigation} />),
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockedUseAuth.mockReturnValue(createAuthValue());
});

describe('PlatformsTab', () => {
  it('loads platforms through withAuth and lists them sorted by name', async () => {
    mockedGetPlatforms.mockResolvedValueOnce([...PLATFORMS]);
    await renderTab().rendered;

    expect(await screen.findByText('Super Nintendo')).toBeOnTheScreen();
    expect(mockedGetPlatforms).toHaveBeenCalledWith(
      'https://romm.test',
      'access-token',
    );
    expect(screen.queryByTestId('platforms-loading')).toBeNull();

    const tiles = screen.getAllByTestId(/^platform-tile-/);
    expect(tiles.map(tile => tile.props.testID)).toEqual([
      'platform-tile-3',
      'platform-tile-1',
      'platform-tile-2',
    ]);
    expect(within(tiles[1]).getByText('1 game')).toBeOnTheScreen();
    expect(within(tiles[2]).getByText('12 games')).toBeOnTheScreen();
    expect(within(tiles[0]).queryByText(/game/)).toBeNull();
  });

  it('shows a spinner while loading', async () => {
    mockedGetPlatforms.mockReturnValueOnce(new Promise(() => {}));
    await renderTab().rendered;

    expect(screen.getByTestId('platforms-loading')).toBeOnTheScreen();
    expect(screen.queryAllByTestId(/^platform-tile-/)).toHaveLength(0);
  });

  it('opens the rom list for a platform', async () => {
    mockedGetPlatforms.mockResolvedValueOnce([...PLATFORMS]);
    const { navigation, rendered } = renderTab();
    await rendered;

    await fireEvent.press(await screen.findByTestId('platform-tile-2'));

    expect(navigation.navigate).toHaveBeenCalledWith('Roms', {
      platformId: 2,
      platformName: 'Super Nintendo',
    });
  });

  it('shows the error and reloads on Retry', async () => {
    mockedGetPlatforms
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce([...PLATFORMS]);
    await renderTab().rendered;

    expect(await screen.findByText('Failed to fetch')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('retry-button'));

    expect(await screen.findByText('Game Boy')).toBeOnTheScreen();
    expect(screen.queryByText('Failed to fetch')).toBeNull();
    expect(mockedGetPlatforms).toHaveBeenCalledTimes(2);
  });

  it('shows the cached list at once and keeps it if the refresh fails', async () => {
    mockedGetPlatforms.mockResolvedValueOnce([...PLATFORMS]);
    const first = renderTab();
    await first.rendered;
    await screen.findByText('Super Nintendo');
    await (await first.rendered).unmount();

    mockedGetPlatforms.mockReturnValueOnce(new Promise(() => {}));
    await renderTab().rendered;

    expect(await screen.findByText('Super Nintendo')).toBeOnTheScreen();
    expect(screen.queryByTestId('platforms-loading')).toBeNull();
  });

  it('shows the error when there is nothing cached and loading fails', async () => {
    mockedGetPlatforms.mockRejectedValueOnce(new Error('boom'));
    await renderTab().rendered;

    expect(await screen.findByText('boom')).toBeOnTheScreen();
  });
});
