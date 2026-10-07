import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  getCollections,
  getRecentlyAddedRoms,
  getRecommendations,
  getStats,
  getVirtualCollections,
} from '../api/rommClient';
import {
  RommCollection,
  RommRecommendation,
  RommRom,
  RommStats,
  RommVirtualCollection,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CollectionShelf } from '../components/CollectionShelf';
import { FocusablePressable } from '../components/FocusablePressable';
import { gameDetailsParamsFor } from '../components/RomGrid';
import { RomShelf } from '../components/RomShelf';
import { VirtualCollectionShelf } from '../components/VirtualCollectionShelf';
import { ContentNavigation } from '../navigation/types';
import { colors } from '../theme/colors';
import { formatBytes } from '../utils/formatBytes';

interface Props {
  navigation: ContentNavigation;
}

interface Stat {
  label: string;
  value: string;
}

function statsToList(stats: RommStats): Stat[] {
  return [
    { label: 'Games', value: stats.ROMS.toLocaleString() },
    { label: 'Platforms', value: stats.PLATFORMS.toLocaleString() },
    { label: 'Saves', value: stats.SAVES.toLocaleString() },
    { label: 'States', value: stats.STATES.toLocaleString() },
    { label: 'Screenshots', value: stats.SCREENSHOTS.toLocaleString() },
    { label: 'Size on disk', value: formatBytes(stats.TOTAL_FILESIZE_BYTES) },
  ];
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Failed to load';
}

/**
 * "Home" tab of the main screen: a Netflix-style dashboard of library stats
 * plus horizontal shelves (recently added, recommended, collections).
 *
 * Each shelf is fetched and rendered independently, so one endpoint being
 * unavailable (an older server, a cold-start user with no recommendations
 * yet) just hides that section instead of failing the whole page. Only a
 * screen where every section failed shows the retry state.
 */
export function HomeTab({ navigation }: Props) {
  const { withAuth, serverUrl } = useAuth();
  const [stats, setStats] = useState<RommStats | null>(null);
  const [recentlyAdded, setRecentlyAdded] = useState<RommRom[]>([]);
  const [recommendations, setRecommendations] = useState<RommRecommendation[]>(
    [],
  );
  const [collections, setCollections] = useState<RommCollection[]>([]);
  const [virtualCollections, setVirtualCollections] = useState<
    RommVirtualCollection[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    let succeeded = false;
    let firstError: string | null = null;
    const fail = (e: unknown) => {
      firstError = firstError ?? errorMessage(e);
    };

    try {
      const result = await withAuth((url, token) => getStats(url, token));
      setStats(result ?? null);
      succeeded = true;
    } catch (e) {
      setStats(null);
      fail(e);
    }

    try {
      const result = await withAuth((url, token) =>
        getRecentlyAddedRoms(url, token),
      );
      setRecentlyAdded(Array.isArray(result) ? result : []);
      succeeded = true;
    } catch (e) {
      setRecentlyAdded([]);
      fail(e);
    }

    try {
      const result = await withAuth((url, token) =>
        getRecommendations(url, token),
      );
      setRecommendations(Array.isArray(result) ? result : []);
      succeeded = true;
    } catch (e) {
      setRecommendations([]);
      fail(e);
    }

    try {
      const result = await withAuth((url, token) => getCollections(url, token));
      setCollections(Array.isArray(result) ? result : []);
      succeeded = true;
    } catch (e) {
      setCollections([]);
      fail(e);
    }

    try {
      const result = await withAuth((url, token) =>
        getVirtualCollections(url, token),
      );
      setVirtualCollections(Array.isArray(result) ? result : []);
      succeeded = true;
    } catch (e) {
      setVirtualCollections([]);
      fail(e);
    }

    setError(succeeded ? null : firstError);
    setLoading(false);
  }, [withAuth]);

  useEffect(() => {
    void load();
  }, [load]);

  const recommendedRoms = useMemo(
    () => recommendations.map(r => r.rom),
    [recommendations],
  );
  const reasonByRomId = useMemo(() => {
    const map = new Map<number, string>();
    for (const rec of recommendations) {
      if (rec.seed_rom_name) {
        map.set(rec.rom.id, `Because you played ${rec.seed_rom_name}`);
      }
    }
    return map;
  }, [recommendations]);

  return (
    <View style={styles.container} testID="home-tab">
      {loading && (
        <ActivityIndicator
          style={styles.centerFill}
          color={colors.accent}
          size="large"
          testID="home-loading"
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
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {stats && (
            <View style={styles.statsRow} testID="home-stats">
              {statsToList(stats).map(stat => (
                <View key={stat.label} style={styles.statCard}>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          )}

          <RomShelf
            title="Recently added"
            roms={recentlyAdded}
            serverUrl={serverUrl}
            autoFocus
            onSelect={rom =>
              navigation.navigate('GameDetails', gameDetailsParamsFor(rom))
            }
            testID="home-recent"
          />

          <RomShelf
            title="Recommended for you"
            roms={recommendedRoms}
            serverUrl={serverUrl}
            onSelect={rom =>
              navigation.navigate('GameDetails', gameDetailsParamsFor(rom))
            }
            subtitleFor={rom => reasonByRomId.get(rom.id)}
            testID="home-recommended"
          />

          <CollectionShelf
            title="Collections"
            collections={collections}
            serverUrl={serverUrl}
            onSelect={collection =>
              navigation.navigate('Roms', {
                collectionId: collection.id,
                collectionName: collection.name,
              })
            }
            testID="home-collections"
          />

          <VirtualCollectionShelf
            title="Autogenerated collections"
            collections={virtualCollections}
            serverUrl={serverUrl}
            onSelect={collection =>
              navigation.navigate('Roms', {
                virtualCollectionId: collection.id,
                virtualCollectionName: collection.name,
              })
            }
            testID="home-virtual-collections"
          />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 32, paddingTop: 24 },
  content: { paddingBottom: 32 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger, fontSize: 16, marginBottom: 16 },
  retryButton: { paddingHorizontal: 20, paddingVertical: 12 },
  buttonText: { color: colors.textPrimary, fontWeight: '600' },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 28,
  },
  statCard: {
    minWidth: 120,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.surfaceSolid,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});
