import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { DesktopPreferences } from './api';

/**
 * Desktop settings, in a small JSON file under userData. They live here
 * rather than in the app's AsyncStorage because some (fullscreen, trusted
 * hosts) are needed before the renderer has loaded.
 */

const DEFAULTS: DesktopPreferences = {
  fullscreen: true,
  launchAtLogin: false,
  trustedCertificateHosts: [],
};

function file(): string {
  return path.join(app.getPath('userData'), 'preferences.json');
}

let cached: DesktopPreferences | null = null;

function sanitize(raw: unknown): DesktopPreferences {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    fullscreen:
      typeof value.fullscreen === 'boolean'
        ? value.fullscreen
        : DEFAULTS.fullscreen,
    launchAtLogin:
      typeof value.launchAtLogin === 'boolean'
        ? value.launchAtLogin
        : DEFAULTS.launchAtLogin,
    trustedCertificateHosts: Array.isArray(value.trustedCertificateHosts)
      ? value.trustedCertificateHosts.filter(
          (host): host is string => typeof host === 'string',
        )
      : DEFAULTS.trustedCertificateHosts,
  };
}

export function getPreferences(): DesktopPreferences {
  if (!cached) {
    try {
      cached = sanitize(JSON.parse(fs.readFileSync(file(), 'utf8')));
    } catch {
      cached = { ...DEFAULTS };
    }
  }
  return cached;
}

export function updatePreferences(changes: unknown): DesktopPreferences {
  cached = sanitize({
    ...getPreferences(),
    ...(changes && typeof changes === 'object' ? changes : {}),
  });
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(cached, null, 2));
  return cached;
}
