import { contextBridge, ipcRenderer } from 'electron';
import {
  DesktopPreferences,
  IPC,
  InterceptedKey,
  RommStreamDesktopApi,
} from './api';

/**
 * Exposes `window.rommstream` to the app (see src/desktop/bridge.ts). The
 * renderer is sandboxed with context isolation, so this is its only way to
 * the main process.
 */
const api: RommStreamDesktopApi = {
  platform: process.platform,
  fetch: request => ipcRenderer.invoke(IPC.fetch, request),
  secureStore: {
    get: key => ipcRenderer.invoke(IPC.secureGet, key),
    set: (key, value) => ipcRenderer.invoke(IPC.secureSet, key, value),
    delete: key => ipcRenderer.invoke(IPC.secureDelete, key),
  },
  setInterceptedKeys: keys => ipcRenderer.send(IPC.setInterceptedKeys, keys),
  onInterceptedKey: listener => {
    const handler = (_event: unknown, key: InterceptedKey) => listener(key);
    ipcRenderer.on(IPC.interceptedKey, handler);
    return () => {
      ipcRenderer.removeListener(IPC.interceptedKey, handler);
    };
  },
  getPreferences: () => ipcRenderer.invoke(IPC.getPreferences),
  setPreferences: (changes: Partial<DesktopPreferences>) =>
    ipcRenderer.invoke(IPC.setPreferences, changes),
  toggleFullscreen: () => ipcRenderer.send(IPC.toggleFullscreen),
  setPlaying: playing => ipcRenderer.send(IPC.setPlaying, playing),
  quit: () => ipcRenderer.send(IPC.quit),
};

contextBridge.exposeInMainWorld('rommstream', api);
