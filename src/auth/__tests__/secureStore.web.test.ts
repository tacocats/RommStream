import {
  clearAll,
  loadCredentials,
  loadTokens,
  saveCredentials,
  saveTokens,
} from '../secureStore';

const CREDS = {
  serverUrl: 'https://romm.example',
  username: 'player',
  authMethod: 'pairing' as const,
};

afterEach(() => {
  delete (globalThis as { rommstream?: unknown }).rommstream;
  localStorage.clear();
});

describe('secureStore (web)', () => {
  it('keeps values in the Electron secure store when there is one', async () => {
    const entries = new Map<string, string>();
    (globalThis as { rommstream?: unknown }).rommstream = {
      secureStore: {
        get: async (key: string) => entries.get(key) ?? null,
        set: async (key: string, value: string) => {
          entries.set(key, value);
        },
        delete: async (key: string) => {
          entries.delete(key);
        },
      },
    };

    await saveCredentials(CREDS);
    await saveTokens({ accessToken: 'rmm_a' });

    expect(await loadCredentials()).toEqual(CREDS);
    expect(await loadTokens()).toEqual({ accessToken: 'rmm_a' });
    expect(localStorage.length).toBe(0);

    await clearAll();
    expect(entries.size).toBe(0);
  });

  it('falls back to localStorage in a plain browser', async () => {
    await saveCredentials(CREDS);
    expect(await loadCredentials()).toEqual(CREDS);

    await clearAll();
    expect(await loadCredentials()).toBeNull();
  });

  it('ignores a corrupt entry', async () => {
    localStorage.setItem('com.rommstream.tokens', '{nope');
    expect(await loadTokens()).toBeNull();
  });
});
