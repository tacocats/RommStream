import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { searchRoms } from '../api/rommClient';
import { RommRom } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { FocusablePressable } from '../components/FocusablePressable';
import { CloseIcon, SearchIcon } from '../components/icons';
import { gameDetailsParamsFor, RomGrid } from '../components/RomGrid';
import { platformLabelFor } from '../components/RomTile';
import { ContentNavigation } from '../navigation/types';
import { colors } from '../theme/colors';

/** Platform chip meaning "don't filter by platform". */
const ALL_PLATFORMS = null;

export const MIN_QUERY_LENGTH = 2;
export const SEARCH_DEBOUNCE_MS = 400;

interface Props {
  navigation: ContentNavigation;
}

/** "Search" tab of the main screen: free-text search across the library. */
export function SearchTab({ navigation }: Props) {
  const { withAuth, serverUrl } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RommRom[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<string | null>(
    ALL_PLATFORMS,
  );
  // Only the most recent request may touch the state: a slow response to an
  // earlier query must not overwrite the results of a later one.
  const requestId = useRef(0);

  const term = query.trim();
  const tooShort = term.length < MIN_QUERY_LENGTH;

  const search = useCallback(
    async (searchTerm: string) => {
      const id = ++requestId.current;
      if (searchTerm.length < MIN_QUERY_LENGTH) {
        setResults(null);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const found = await withAuth((url, token) =>
          searchRoms(url, token, searchTerm),
        );
        if (id !== requestId.current) {
          return;
        }
        found.sort((a, b) => a.name.localeCompare(b.name));
        setResults(found);
        setPlatformFilter(ALL_PLATFORMS);
      } catch (e) {
        if (id !== requestId.current) {
          return;
        }
        setError(e instanceof Error ? e.message : 'Search failed');
      } finally {
        if (id === requestId.current) {
          setLoading(false);
        }
      }
    },
    [withAuth],
  );

  // Search as the user types, once they pause for a moment. An explicit
  // submit or retry cancels the pending timer so the same query isn't sent
  // twice.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPending = useCallback(() => {
    if (pending.current !== null) {
      clearTimeout(pending.current);
      pending.current = null;
    }
  }, []);

  useEffect(() => {
    pending.current = setTimeout(() => {
      pending.current = null;
      void search(term);
    }, SEARCH_DEBOUNCE_MS);
    return cancelPending;
  }, [term, search, cancelPending]);

  const submit = () => {
    cancelPending();
    void search(term);
  };

  const clear = () => {
    cancelPending();
    setQuery('');
  };

  // Chip options are the platforms actually present in this result set, in
  // the order they first appear — not the full library's platform list.
  const platforms = useMemo(() => {
    const seen = new Set<string>();
    for (const rom of results ?? []) {
      const label = platformLabelFor(rom);
      if (label) {
        seen.add(label);
      }
    }
    return Array.from(seen);
  }, [results]);

  const filteredResults = useMemo(() => {
    if (platformFilter === ALL_PLATFORMS || !results) {
      return results;
    }
    return results.filter(rom => platformLabelFor(rom) === platformFilter);
  }, [results, platformFilter]);

  return (
    <View style={styles.container} testID="search-tab">
      <Text style={styles.title}>Search</Text>
      <View style={styles.inputWrap}>
        <SearchIcon color={colors.textMuted} size={18} />
        <TextInput
          style={styles.input}
          placeholder="Game title"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={submit}
          hasTVPreferredFocus
          testID="search-input"
        />
        {query.length > 0 && (
          <FocusablePressable
            style={styles.clearButton}
            onPress={clear}
            testID="clear-search-button"
          >
            <CloseIcon color={colors.textMuted} size={14} />
          </FocusablePressable>
        )}
      </View>

      {!loading && !error && !tooShort && results && results.length > 0 && (
        <View style={styles.chipRow}>
          <FocusablePressable
            style={[
              styles.chip,
              platformFilter === ALL_PLATFORMS && styles.chipActive,
            ]}
            onPress={() => setPlatformFilter(ALL_PLATFORMS)}
            testID="platform-chip-all"
          >
            <Text
              style={[
                styles.chipText,
                platformFilter === ALL_PLATFORMS && styles.chipTextActive,
              ]}
            >
              All
            </Text>
          </FocusablePressable>
          {platforms.map(platform => (
            <FocusablePressable
              key={platform}
              style={[
                styles.chip,
                platformFilter === platform && styles.chipActive,
              ]}
              onPress={() => setPlatformFilter(platform)}
              testID={`platform-chip-${platform}`}
            >
              <Text
                style={[
                  styles.chipText,
                  platformFilter === platform && styles.chipTextActive,
                ]}
              >
                {platform}
              </Text>
            </FocusablePressable>
          ))}
        </View>
      )}

      {loading && (
        <ActivityIndicator
          style={styles.centerFill}
          color={colors.accent}
          size="large"
          testID="search-loading"
        />
      )}

      {!loading && error && (
        <View style={styles.centerFill}>
          <Text style={styles.error}>{error}</Text>
          <FocusablePressable
            style={styles.retryButton}
            onPress={submit}
            testID="retry-button"
          >
            <Text style={styles.buttonText}>Retry</Text>
          </FocusablePressable>
        </View>
      )}

      {!loading && !error && tooShort && (
        <View style={styles.centerFill}>
          <Text style={styles.hint}>
            {`Type at least ${MIN_QUERY_LENGTH} characters to search your library.`}
          </Text>
        </View>
      )}

      {!loading && !error && !tooShort && results?.length === 0 && (
        <View style={styles.centerFill}>
          <Text style={styles.hint}>{`No games match “${term}”.`}</Text>
        </View>
      )}

      {!loading && !error && !tooShort && results && results.length > 0 && (
        <>
          <Text style={styles.count}>
            {`Results for “${term}” · ${filteredResults?.length ?? 0} ${
              filteredResults?.length === 1 ? 'game' : 'games'
            }`}
          </Text>
          {filteredResults && filteredResults.length > 0 ? (
            <RomGrid
              roms={filteredResults}
              serverUrl={serverUrl}
              autoFocus={false}
              onSelect={rom =>
                navigation.navigate('GameDetails', gameDetailsParamsFor(rom))
              }
            />
          ) : (
            <View style={styles.centerFill}>
              <Text style={styles.hint}>
                {`No ${platformFilter} games match “${term}”.`}
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 32, paddingBottom: 32 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    maxWidth: 560,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 16,
  },
  clearButton: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surfaceSolid,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.textPrimary,
  },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 16, color: colors.textMuted, textAlign: 'center' },
  count: { fontSize: 14, color: colors.textMuted, marginBottom: 8 },
  error: { color: colors.danger, fontSize: 16, marginBottom: 16 },
  retryButton: { paddingHorizontal: 20, paddingVertical: 12 },
  buttonText: { color: colors.textPrimary, fontWeight: '600' },
});
