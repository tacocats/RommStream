import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getPlatforms } from '../api/rommClient';
import {
  readCachedPlatforms,
  writeCachedPlatforms,
} from '../api/platformsCache';
import { RommPlatform } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { FocusablePressable } from '../components/FocusablePressable';
import { PlatformIcon } from '../components/PlatformIcon';
import { prefetchPlatformIcons } from '../components/platformIconCache';
import { ContentNavigation } from '../navigation/types';
import { colors, focusRing } from '../theme/colors';
import { createLogger } from '../utils/logger';

const log = createLogger('platforms');

interface Props {
  navigation: ContentNavigation;
}

/** "Platforms" tab of the main screen: the library grouped by platform. */
export function PlatformsTab({ navigation }: Props) {
  const { withAuth, serverUrl } = useAuth();
  const [platforms, setPlatforms] = useState<RommPlatform[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const t0 = Date.now();

    const cached = await readCachedPlatforms(serverUrl);
    if (cached) {
      log.debug(`showing ${cached.length} cached platforms`);
      show(cached);
      setLoading(false);
    }

    try {
      const result = await withAuth((url, token) => getPlatforms(url, token));
      log.debug(
        `getPlatforms ${Date.now() - t0}ms, ${result.length} platforms`,
      );
      result.sort((a, b) => a.name.localeCompare(b.name));
      writeCachedPlatforms(serverUrl, result);
      // Keep the mounted grid (and its focus) if nothing changed.
      if (!cached || JSON.stringify(cached) !== JSON.stringify(result)) {
        show(result);
      }
    } catch (e) {
      // A stale list on screen beats an error for a failed refresh.
      if (!cached) {
        setError(e instanceof Error ? e.message : 'Failed to load platforms');
      }
    } finally {
      setLoading(false);
    }

    function show(list: RommPlatform[]) {
      log.debug(`show(${list.length}) called`);
      // Start icon resolution before the grid mounts so tiles find them ready.
      prefetchPlatformIcons(
        serverUrl,
        list.map(p => [p.fs_slug, p.slug]),
      );
      setPlatforms(list);
    }
  }, [withAuth, serverUrl]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    log.debug(`grid committed with ${platforms.length} platforms`);
  }, [platforms]);

  // Temporary diagnostics: report when the JS thread is blocked.
  useEffect(() => {
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      if (now - last > 400) {
        log.debug(`JS thread stalled ~${now - last - 100}ms`);
      }
      last = now;
    }, 100);
    return () => clearInterval(id);
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: RommPlatform; index: number }) => (
      <PlatformTile
        platform={item}
        serverUrl={serverUrl}
        preferFocus={index === 0}
        onOpen={navigation.navigate}
      />
    ),
    [serverUrl, navigation.navigate],
  );

  return (
    <View style={styles.container} testID="platforms-tab">
      <Text style={styles.title}>Platforms</Text>

      {loading && (
        <ActivityIndicator
          style={styles.centerFill}
          color={colors.accent}
          size="large"
          testID="platforms-loading"
        />
      )}

      {!loading && error && (
        <View style={styles.centerFill}>
          <Text style={styles.error}>{error}</Text>
          <FocusablePressable
            style={styles.retryButton}
            onPress={load}
            testID="retry-button"
          >
            <Text style={styles.buttonText}>Retry</Text>
          </FocusablePressable>
        </View>
      )}

      {!loading && !error && (
        <FlatList
          data={platforms}
          keyExtractor={item => String(item.id)}
          numColumns={5}
          contentContainerStyle={styles.grid}
          renderItem={renderItem}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      )}
    </View>
  );
}

interface TileProps {
  platform: RommPlatform;
  serverUrl: string;
  preferFocus: boolean;
  onOpen: ContentNavigation['navigate'];
}

// Memoized so a focus move or list update only touches the tiles involved.
const PlatformTile = memo(function PlatformTileView({
  platform,
  serverUrl,
  preferFocus,
  onOpen,
}: TileProps) {
  return (
    <FocusablePressable
      style={styles.tile}
      focusedStyle={styles.tileFocused}
      hasTVPreferredFocus={preferFocus}
      testID={`platform-tile-${platform.id}`}
      onPress={() =>
        onOpen('Roms', {
          platformId: platform.id,
          platformName: platform.name,
        })
      }
    >
      <View style={styles.iconWrap}>
        <PlatformIcon
          serverUrl={serverUrl}
          name={platform.name}
          slug={platform.slug}
          fsSlug={platform.fs_slug}
          size={48}
        />
      </View>
      <Text style={styles.tileName} numberOfLines={2}>
        {platform.name}
      </Text>
      {typeof platform.rom_count === 'number' && (
        <Text style={styles.tileCount}>
          {platform.rom_count} {platform.rom_count === 1 ? 'game' : 'games'}
        </Text>
      )}
    </FocusablePressable>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 32, paddingBottom: 32 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 24,
  },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger, fontSize: 16, marginBottom: 16 },
  retryButton: { paddingHorizontal: 20, paddingVertical: 12 },
  buttonText: { color: colors.textPrimary, fontWeight: '600' },
  grid: { paddingBottom: 32 },
  tile: {
    flex: 1,
    margin: 8,
    minHeight: 150,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileFocused: {
    borderColor: focusRing.borderColor,
    borderWidth: 2,
    backgroundColor: colors.accentSoft,
    transform: [{ scale: 1.05 }],
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    marginBottom: 12,
  },
  tileName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  tileCount: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
});
