import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import {
  getCollections,
  getPlatforms,
  getRecentlyAddedRoms,
  getRecommendations,
  getRom,
  getRoms,
  getStats,
  getVirtualCollections,
} from '../../api/rommClient';
import { useAuth } from '../../auth/AuthContext';
import { AuthValue, createAuthValue } from '../../testUtils/mockAuth';
import { createScreenProps } from '../../testUtils/navigation';
import { MainScreen } from '../MainScreen';

jest.mock('../../components/popupAnchor', () => ({
  anchorBeside: async () => ({ left: 0, bottom: 0 }),
}));

jest.mock('../../auth/AuthContext');
jest.mock('../../api/rommClient');
jest.mock('../../components/PlatformIcon', () => ({
  PlatformIcon: () => null,
}));

const mockedUseAuth = jest.mocked(useAuth);

let auth: AuthValue;

beforeEach(() => {
  auth = createAuthValue();
  mockedUseAuth.mockReturnValue(auth);
  jest.mocked(getPlatforms).mockResolvedValue([{ id: 1, name: 'Game Boy' }]);
  jest.mocked(getStats).mockResolvedValue({
    PLATFORMS: 1,
    ROMS: 1,
    SAVES: 0,
    STATES: 0,
    SCREENSHOTS: 0,
    TOTAL_FILESIZE_BYTES: 0,
  });
  jest.mocked(getRecentlyAddedRoms).mockResolvedValue([]);
  jest.mocked(getRecommendations).mockResolvedValue([]);
  jest.mocked(getCollections).mockResolvedValue([]);
  jest.mocked(getVirtualCollections).mockResolvedValue([]);
});

describe('MainScreen', () => {
  it('opens on the Home tab', async () => {
    const { props } = createScreenProps('Main', undefined);
    await render(<MainScreen {...props} />);

    expect(screen.getByTestId('tab-home')).toBeSelected();
    expect(await screen.findByTestId('home-stats')).toBeOnTheScreen();
    expect(screen.queryByTestId('platforms-tab')).toBeNull();
    expect(screen.queryByTestId('search-tab')).toBeNull();
  });

  it('switches between tabs from the top bar', async () => {
    const { props } = createScreenProps('Main', undefined);
    await render(<MainScreen {...props} />);

    await fireEvent.press(screen.getByTestId('tab-platforms'));
    expect(screen.getByTestId('tab-platforms')).toBeSelected();
    expect(screen.getByTestId('platforms-tab')).toBeOnTheScreen();
    expect(await screen.findByText('Game Boy')).toBeOnTheScreen();
    expect(screen.queryByTestId('home-tab')).toBeNull();

    await fireEvent.press(screen.getByTestId('tab-search'));
    expect(screen.getByTestId('tab-search')).toBeSelected();
    expect(screen.getByTestId('search-input')).toBeOnTheScreen();
    expect(screen.queryByTestId('platforms-tab')).toBeNull();

    await fireEvent.press(screen.getByTestId('tab-home'));
    expect(screen.getByTestId('home-tab')).toBeOnTheScreen();
  });

  it('routes Settings and Sign Out from the top bar', async () => {
    const { props, navigation } = createScreenProps('Main', undefined);
    await render(<MainScreen {...props} />);

    await fireEvent.press(screen.getByTestId('settings-button'));
    expect(navigation.navigate).toHaveBeenCalledWith('Settings');

    await fireEvent.press(screen.getByTestId('account-button'));
    await fireEvent.press(await screen.findByTestId('account-menu-sign-out'));
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('opens a platform inline, keeping the sidebar visible, and Back returns to Platforms', async () => {
    jest
      .mocked(getPlatforms)
      .mockResolvedValue([
        { id: 2, name: 'Super Nintendo', slug: 'snes', rom_count: 1 },
      ]);
    jest
      .mocked(getRoms)
      .mockResolvedValue([
        { id: 1, name: 'Super Metroid', platform_id: 2, platform_slug: 'snes' },
      ]);
    const { props } = createScreenProps('Main', undefined);
    await render(<MainScreen {...props} />);

    await fireEvent.press(screen.getByTestId('tab-platforms'));
    await fireEvent.press(await screen.findByTestId('platform-tile-2'));

    expect(await screen.findByText('Super Metroid')).toBeOnTheScreen();
    expect(screen.getByTestId('sidebar')).toBeOnTheScreen();
    expect(screen.getByTestId('tab-platforms')).toBeSelected();
    expect(screen.queryByTestId('platforms-tab')).toBeNull();

    await fireEvent.press(screen.getByTestId('content-back-button'));

    expect(await screen.findByTestId('platforms-tab')).toBeOnTheScreen();
    expect(screen.getByTestId('sidebar')).toBeOnTheScreen();
  });

  it('opens a game inline from a rom list, keeping the sidebar visible, and Back returns to the rom list', async () => {
    jest
      .mocked(getPlatforms)
      .mockResolvedValue([
        { id: 2, name: 'Super Nintendo', slug: 'snes', rom_count: 1 },
      ]);
    jest
      .mocked(getRoms)
      .mockResolvedValue([
        { id: 1, name: 'Super Metroid', platform_id: 2, platform_slug: 'snes' },
      ]);
    jest.mocked(getRom).mockReturnValue(new Promise(() => {}));
    const { props } = createScreenProps('Main', undefined);
    await render(<MainScreen {...props} />);

    await fireEvent.press(screen.getByTestId('tab-platforms'));
    await fireEvent.press(await screen.findByTestId('platform-tile-2'));
    await fireEvent.press(await screen.findByTestId('rom-tile-1'));

    expect(await screen.findByTestId('game-details-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('sidebar')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('content-back-button'));

    expect(await screen.findByText('Super Metroid')).toBeOnTheScreen();
    expect(screen.getByTestId('sidebar')).toBeOnTheScreen();
  });

  it('does not show a Back button at the root of a tab', async () => {
    const { props } = createScreenProps('Main', undefined);
    await render(<MainScreen {...props} />);

    expect(screen.queryByTestId('content-back-button')).toBeNull();
  });
});
