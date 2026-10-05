// Basic end-to-end smoke test: the app boots to the sign-in screen and
// pairing reports a failure when the server can't be reached. Needs no RomM
// server: 10.0.2.2 is the emulator's host loopback and port 9 is closed.
describe('Login screen', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('shows the pairing form', async () => {
    await expect(element(by.text('RommStream'))).toBeVisible();
    await expect(element(by.id('login-server-url'))).toBeVisible();
    await expect(element(by.id('login-submit'))).toBeVisible();
  });

  it('reports a failure when the server cannot be reached', async () => {
    // The server field's IME action asks for a pairing code, the same
    // handler the button calls, and closes the TV's on-screen keyboard.
    await element(by.id('login-server-url')).typeText('http://10.0.2.2:9');
    await element(by.id('login-server-url')).tapReturnKey();

    await waitFor(element(by.id('login-error')))
      .toBeVisible()
      .withTimeout(30000);
  });
});
