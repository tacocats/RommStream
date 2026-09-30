import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Backs the renderer's secureStore.web.ts: each value is encrypted with
 * Electron's safeStorage (Keychain on macOS, DPAPI on Windows, the Secret
 * Service / KWallet on Linux) and the ciphertext kept in userData.
 *
 * On a Linux desktop with no keyring running, safeStorage falls back to a
 * fixed key ("basic_text"), which is obfuscation rather than encryption; that
 * is logged, since the stored credentials include the RomM password.
 */

type Entries = Record<string, string>;

function file(): string {
  return path.join(app.getPath('userData'), 'secure-store.json');
}

function read(): Entries {
  try {
    const parsed = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function write(entries: Entries): void {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(entries), { mode: 0o600 });
}

let ready: Promise<void> | null = null;

/**
 * The async API waits for the keyring to answer; the sync one can run ahead
 * of it on Linux and encrypt with a key that won't be there next launch.
 *
 * With no keyring at all, Linux safeStorage refuses to encrypt unless told
 * plain-text mode is acceptable; the alternative would be not remembering
 * the sign-in.
 */
function ensureReady(): Promise<void> {
  ready ??= (async () => {
    const available = await safeStorage.isAsyncEncryptionAvailable();
    if (process.platform !== 'linux') {
      return;
    }
    if (!available) {
      safeStorage.setUsePlainTextEncryption(true);
    }
    const backend = safeStorage.getSelectedStorageBackend();
    if (!available || backend === 'basic_text') {
      console.warn(
        `[secureStore] no system keyring available (backend: ${backend}); ` +
          'credentials are stored with a fixed key',
      );
    }
  })();
  return ready;
}

async function encrypt(value: string): Promise<string> {
  return (await safeStorage.encryptStringAsync(value)).toString('base64');
}

export async function secureGet(key: string): Promise<string | null> {
  const encoded = read()[key];
  if (!encoded) {
    return null;
  }
  await ensureReady();
  try {
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(
      Buffer.from(encoded, 'base64'),
    );
    if (shouldReEncrypt) {
      const entries = read();
      entries[key] = await encrypt(result);
      write(entries);
    }
    return result;
  } catch (e) {
    console.warn(`[secureStore] could not decrypt ${key}, ignoring it`, e);
    return null;
  }
}

export async function secureSet(key: string, value: string): Promise<void> {
  await ensureReady();
  const encrypted = await encrypt(value);
  const entries = read();
  entries[key] = encrypted;
  write(entries);
}

export function secureDelete(key: string): void {
  const entries = read();
  if (key in entries) {
    delete entries[key];
    write(entries);
  }
}
