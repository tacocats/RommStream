import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  getRoms,
  getRomsByCollection,
  getRomsByVirtualCollection,
} from '../api/rommClient';
import { RommRom } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { FocusablePressable } from '../components/FocusablePressable';
import { gameDetailsParamsFor, RomGrid } from '../components/RomGrid';
import { ContentNavigation, RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

interface Props {
  route: { params: RootStackParamList['Roms'] };
  navigation: ContentNavigation;
}

/** What kind of games list this screen shows, and its empty-state copy. */
function describe(params: RootStackParamList['Roms']) {
  if ('collectionId' in params) {
    return {
      title: params.collectionName,
      emptyMessage: 'No games found in this collection.',
      load: (url: string, token: string) =>
        getRomsByCollection(url, token, params.collectionId),
    };
  }
  if ('virtualCollectionId' in params) {
    return {
      title: params.virtualCollectionName,
      emptyMessage: 'No games found in this collection.',
      load: (url: string, token: string) =>
        getRomsByVirtualCollection(url, token, params.virtualCollectionId),
    };
  }
  return {
    title: params.platformName,
    emptyMessage: 'No games found for this platform.',
    load: (url: string, token: string) =>
      getRoms(url, token, params.platformId),
  };
}

export function RomListScreen({ route, navigation }: Props) {
  const {
    title,
    emptyMessage,
    load: loadRoms,
  } = useMemo(() => describe(route.params), [route.params]);
  const { withAuth, serverUrl } = useAuth();
  const [roms, setRoms] = useState<RommRom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await withAuth(loadRoms);
      result.sort((a, b) => a.name.localeCompare(b.name));
      setRoms(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load games');
    } finally {
      setLoading(false);
    }
  }, [withAuth, loadRoms]);

  useEffect(() => {
    navigation.setOptions({ title });
    void load();
  }, [load, navigation, title]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      {loading && (
        <ActivityIndicator
          style={styles.centerFill}
          color={colors.accent}
          size="large"
          testID="roms-loading"
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

      {!loading && !error && roms.length === 0 && (
        <View style={styles.centerFill}>
          <Text style={styles.subtitle}>{emptyMessage}</Text>
        </View>
      )}

      {!loading && !error && roms.length > 0 && (
        <RomGrid
          roms={roms}
          serverUrl={serverUrl}
          onSelect={rom =>
            navigation.navigate('GameDetails', gameDetailsParamsFor(rom))
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 32 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  subtitle: { fontSize: 16, color: colors.textMuted },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger, fontSize: 16, marginBottom: 16 },
  retryButton: { paddingHorizontal: 20, paddingVertical: 12 },
  buttonText: { color: colors.textPrimary, fontWeight: '600' },
});
