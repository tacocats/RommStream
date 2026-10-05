/**
 * @format
 */

import { render, screen } from '@testing-library/react-native';
import React from 'react';
import App from '../App';

test('boots to the login screen when no session is stored', async () => {
  await render(<App />);

  expect(await screen.findByText('Get pairing code')).toBeOnTheScreen();
  expect(screen.getByTestId('login-submit')).toBeOnTheScreen();
});
