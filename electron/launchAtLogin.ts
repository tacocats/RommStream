import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Start RommStream when the user logs in. macOS and Windows have an API for
 * it; on Linux it's an XDG autostart entry.
 */

function linuxAutostartFile(): string {
  const configHome =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, 'autostart', 'rommstream.desktop');
}

function linuxExecutable(): string {
  // An AppImage runs from a temporary mount; APPIMAGE is the file itself.
  return process.env.APPIMAGE || process.execPath;
}

export function setLaunchAtLogin(enabled: boolean): void {
  if (process.platform !== 'linux') {
    app.setLoginItemSettings({ openAtLogin: enabled });
    return;
  }
  const file = linuxAutostartFile();
  if (!enabled) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    [
      '[Desktop Entry]',
      'Type=Application',
      'Name=RommStream',
      `Exec="${linuxExecutable()}"`,
      'X-GNOME-Autostart-enabled=true',
      '',
    ].join('\n'),
  );
}
