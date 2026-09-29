import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from '../utils/logger';
import { RommPlatform } from './types';

const log = createLogger('platformsCache');

// Bump to discard persisted lists whose shape changed.
const STORAGE_PREFIX = 'rommstream.platforms.v1:';

// RomM's /api/platforms can take several seconds, so the last list is kept
// and shown immediately while a fresh one loads in the background.
export async function readCachedPlatforms(
  serverUrl: string,
): Promise<RommPlatform[] | null> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_PREFIX + serverUrl);
    return stored ? (JSON.parse(stored) as RommPlatform[]) : null;
  } catch (e) {
    log.warn('platform cache unreadable', e);
    return null;
  }
}

export function writeCachedPlatforms(
  serverUrl: string,
  platforms: RommPlatform[],
): void {
  AsyncStorage.setItem(
    STORAGE_PREFIX + serverUrl,
    JSON.stringify(platforms),
  ).catch(e => log.warn('could not cache platforms', e));
}
