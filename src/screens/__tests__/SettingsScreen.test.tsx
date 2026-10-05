import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { SettingsScreen } from '../SettingsScreen';

describe('SettingsScreen', () => {
  it('says there is nothing to configure on a TV', async () => {
    await render(<SettingsScreen />);

    expect(screen.getByText('Settings')).toBeOnTheScreen();
    expect(screen.getByTestId('settings-empty')).toHaveTextContent(
      'There is nothing to configure on this device.',
    );
  });

  it('no longer offers a login path', async () => {
    await render(<SettingsScreen />);

    expect(screen.queryByTestId('settings-login-path')).toBeNull();
    expect(screen.queryByTestId('settings-save')).toBeNull();
  });
});
