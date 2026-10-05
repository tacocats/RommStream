import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { useAuth } from '../../auth/AuthContext';
import { AuthValue, createAuthValue } from '../../testUtils/mockAuth';
import { LoginScreen } from '../LoginScreen';

jest.mock('../../auth/AuthContext');

const mockedUseAuth = jest.mocked(useAuth);

const PROMPT = {
  userCode: 'ABCD2345',
  verificationUrl: 'https://romm.test/pair/device?user_code=ABCD2345',
  expiresInSeconds: 600,
};

let auth: AuthValue;

beforeEach(() => {
  auth = createAuthValue({
    status: 'signedOut',
    serverUrl: '',
    accessToken: '',
  });
  mockedUseAuth.mockReturnValue(auth);
});

async function renderWithServer() {
  await render(<LoginScreen />);
  await fireEvent.changeText(
    screen.getByTestId('login-server-url'),
    'romm.test',
  );
}

/**
 * Press "Get pairing code" and wait for the code to show. Not awaiting the
 * press itself: its handler only settles once pairing does.
 */
async function requestCode() {
  fireEvent.press(screen.getByTestId('login-submit'));
  await screen.findByTestId('pairing-prompt');
}

/** pairDevice that shows the code and then waits for approval. */
function pairingWaits() {
  let signal: AbortSignal | undefined;
  jest.mocked(auth.pairDevice).mockImplementationOnce(async (_url, options) => {
    signal = options.signal;
    options.onPrompt(PROMPT);
    await new Promise((_resolve, reject) =>
      options.signal?.addEventListener('abort', () =>
        reject(new Error('Pairing cancelled')),
      ),
    );
  });
  return () => signal;
}

describe('LoginScreen', () => {
  it('only asks for the server address', async () => {
    await render(<LoginScreen />);

    expect(screen.queryByTestId('login-username')).toBeNull();
    expect(screen.queryByTestId('login-password')).toBeNull();
    expect(screen.queryByTestId('login-mode-toggle')).toBeNull();
    expect(screen.getByTestId('login-submit')).toBeDisabled();

    await fireEvent.changeText(
      screen.getByTestId('login-server-url'),
      'romm.test',
    );
    expect(screen.getByTestId('login-submit')).toBeEnabled();
    expect(screen.getByText('Get pairing code')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByTestId('login-server-url'), '  ');
    expect(screen.getByTestId('login-submit')).toBeDisabled();
  });

  it('shows the code, link and QR code to approve', async () => {
    pairingWaits();
    await renderWithServer();

    await requestCode();

    expect(auth.pairDevice).toHaveBeenCalledWith(
      'romm.test',
      expect.objectContaining({ onPrompt: expect.any(Function) }),
    );
    expect(screen.getByTestId('pairing-user-code')).toHaveTextContent(
      'ABCD-2345',
    );
    expect(screen.getByTestId('pairing-url')).toHaveTextContent(
      PROMPT.verificationUrl,
    );
    expect(screen.getByTestId('pairing-qr')).toBeOnTheScreen();
    expect(screen.getByText('Waiting for approval…')).toBeOnTheScreen();
  });

  it('starts pairing from the server field', async () => {
    await renderWithServer();

    await fireEvent(screen.getByTestId('login-server-url'), 'submitEditing');

    expect(auth.pairDevice).toHaveBeenCalledTimes(1);
  });

  it('cancels back to the form, without an error', async () => {
    const signal = pairingWaits();
    await renderWithServer();
    await requestCode();

    await fireEvent.press(screen.getByTestId('pairing-cancel'));

    expect(signal()?.aborted).toBe(true);
    expect(screen.queryByTestId('pairing-prompt')).toBeNull();
    expect(screen.queryByTestId('login-error')).toBeNull();
    expect(screen.getByTestId('login-submit')).toBeEnabled();
  });

  it('stops waiting when the screen goes away', async () => {
    const signal = pairingWaits();
    await renderWithServer();
    await requestCode();

    await screen.unmount();

    expect(signal()?.aborted).toBe(true);
  });

  it('explains a failed pairing and offers a new code', async () => {
    jest
      .mocked(auth.pairDevice)
      .mockRejectedValueOnce(new Error('Pairing was denied in RomM.'));
    await renderWithServer();

    await fireEvent.press(screen.getByTestId('login-submit'));

    expect(screen.getByTestId('login-error')).toHaveTextContent(
      'Pairing was denied in RomM.',
    );
    expect(screen.queryByTestId('login-spinner')).toBeNull();
    expect(screen.getByTestId('login-submit')).toBeEnabled();
  });

  it('shows a generic message for non-Error rejections', async () => {
    jest.mocked(auth.pairDevice).mockRejectedValueOnce('nope');
    await renderWithServer();

    await fireEvent.press(screen.getByTestId('login-submit'));

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Unable to sign in',
    );
  });
});
