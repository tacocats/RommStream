import * as Keychain from 'react-native-keychain';
import {
  clearAll,
  loadCredentials,
  loadTokens,
  saveCredentials,
  saveTokens,
} from '../secureStore';

const CREDENTIALS_SERVICE = 'com.rommstream.credentials';
const TOKENS_SERVICE = 'com.rommstream.tokens';

const creds = {
  serverUrl: 'https://romm.test',
  username: 'player',
  authMethod: 'pairing' as const,
};
const tokens = { accessToken: 'rmm_access' };

describe('secureStore', () => {
  it('returns null when nothing has been saved', async () => {
    await expect(loadCredentials()).resolves.toBeNull();
    await expect(loadTokens()).resolves.toBeNull();
  });

  it('round-trips credentials under their own keychain service', async () => {
    await saveCredentials(creds);

    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'player',
      JSON.stringify(creds),
      {
        service: CREDENTIALS_SERVICE,
      },
    );
    await expect(loadCredentials()).resolves.toEqual(creds);
    expect(Keychain.getGenericPassword).toHaveBeenCalledWith({
      service: CREDENTIALS_SERVICE,
    });
  });

  it('round-trips tokens under their own keychain service', async () => {
    await saveTokens(tokens);

    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'tokens',
      JSON.stringify(tokens),
      {
        service: TOKENS_SERVICE,
      },
    );
    await expect(loadTokens()).resolves.toEqual(tokens);
  });

  it('keeps credentials and tokens separate', async () => {
    await saveCredentials(creds);

    await expect(loadTokens()).resolves.toBeNull();
  });

  it('returns null when a stored entry is not valid JSON', async () => {
    await Keychain.setGenericPassword('x', 'not json', {
      service: CREDENTIALS_SERVICE,
    });
    await Keychain.setGenericPassword('x', '{oops', {
      service: TOKENS_SERVICE,
    });

    await expect(loadCredentials()).resolves.toBeNull();
    await expect(loadTokens()).resolves.toBeNull();
  });

  it('clearAll removes both entries', async () => {
    await saveCredentials(creds);
    await saveTokens(tokens);

    await clearAll();

    expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({
      service: CREDENTIALS_SERVICE,
    });
    expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({
      service: TOKENS_SERVICE,
    });
    await expect(loadCredentials()).resolves.toBeNull();
    await expect(loadTokens()).resolves.toBeNull();
  });
});
