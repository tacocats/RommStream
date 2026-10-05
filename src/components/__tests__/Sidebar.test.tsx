import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { MainTab, Sidebar } from '../Sidebar';

jest.mock('../popupAnchor', () => ({
  anchorBeside: async () => ({ left: 0, bottom: 0 }),
}));

async function renderSidebar(active: MainTab = 'Home') {
  const onSelect = jest.fn();
  const onSettings = jest.fn();
  const onSignOut = jest.fn();
  await render(
    <Sidebar
      active={active}
      username="jack"
      onSelect={onSelect}
      onSettings={onSettings}
      onSignOut={onSignOut}
    />,
  );
  return { onSelect, onSettings, onSignOut };
}

describe('Sidebar', () => {
  it('shows the nav items with the active one selected', async () => {
    await renderSidebar('Platforms');

    expect(screen.getByTestId('tab-home')).not.toBeSelected();
    expect(screen.getByTestId('tab-platforms')).toBeSelected();
  });

  it('reports the tab that was pressed', async () => {
    const { onSelect } = await renderSidebar('Home');

    await fireEvent.press(screen.getByTestId('tab-platforms'));
    expect(onSelect).toHaveBeenCalledWith('Platforms');
  });

  it('exposes the Settings action', async () => {
    const { onSettings } = await renderSidebar();

    await fireEvent.press(screen.getByTestId('settings-button'));
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it('opens the account menu from the avatar and signs out from it', async () => {
    const { onSignOut } = await renderSidebar();

    expect(screen.queryByTestId('account-menu')).toBeNull();

    await fireEvent.press(screen.getByTestId('account-button'));
    expect(onSignOut).not.toHaveBeenCalled();
    expect(await screen.findByTestId('account-menu')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('account-menu-sign-out'));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('account-menu')).toBeNull();
  });

  it('closes the account menu when pressing outside it', async () => {
    const { onSignOut } = await renderSidebar();

    await fireEvent.press(screen.getByTestId('account-button'));
    await fireEvent.press(await screen.findByTestId('account-menu-backdrop'));

    expect(screen.queryByTestId('account-menu')).toBeNull();
    expect(onSignOut).not.toHaveBeenCalled();
  });
});
