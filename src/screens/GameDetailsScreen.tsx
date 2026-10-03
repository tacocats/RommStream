import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getRom } from '../api/rommClient';
import { startStreamingSession } from '../api/streamingSession';
import {
  MemoryCardImportRequiredError,
  RommApiError,
  RommMemoryCardImportRequired,
  RommRomDetail,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CoverPlaceholder } from '../components/CoverPlaceholder';
import { FocusablePressable } from '../components/FocusablePressable';
import { PlayIcon, VerifiedIcon } from '../components/icons';
import { platformLabelFor, resolveCoverUrl } from '../components/RomTile';
import { ContentNavigation, RootStackParamList } from '../navigation/types';
import {
  getInBrowserPlayEnabled,
  getLoginPath,
} from '../settings/settingsStore';
import { colors } from '../theme/colors';
import { formatReleaseDate } from '../utils/formatDate';
import { resolvePlayPath } from '../utils/resolvePlayPath';

interface Props {
  route: { params: RootStackParamList['GameDetails'] };
  navigation: ContentNavigation;
}

interface ChipRowProps {
  label: string;
  items: string[];
}

function ChipRow({ label, items }: ChipRowProps) {
  const uniqueItems = Array.from(new Set(items));
  if (uniqueItems.length === 0) {
    return null;
  }
  return (
    <View style={styles.chipSection}>
      <Text style={styles.chipLabel}>{label.toUpperCase()}</Text>
      <View style={styles.chipRow}>
        {uniqueItems.map(item => (
          <View key={item} style={styles.chip}>
            <Text style={styles.chipText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function describeStreamError(e: unknown): string {
  if (e instanceof RommApiError) {
    // RomM's scope guard answers "Forbidden"; other 403s (e.g. a CSRF
    // rejection) say what went wrong themselves.
    if (e.status === 403 && e.message === 'Forbidden') {
      return 'RomM did not give this app permission to start streams. Sign out and sign in again.';
    }
    if (e.status === 409) {
      return 'Every streaming container for this platform is busy. Try again shortly.';
    }
  }
  return e instanceof Error ? e.message : 'Could not start the stream';
}

/**
 * Details screen for a single rom: title, cover, metadata and a Play button
 * that hands off to the web player. A streamed rom has its container claimed
 * here first, so the player opens straight onto the stream's room URL.
 *
 * Play stays on screen until the app knows the game *can't* be launched, so
 * a slow load never costs the user the button their remote is focused on.
 */
export function GameDetailsScreen({ route, navigation }: Props) {
  const { romId, romName, platformSlug } = route.params;
  const { withAuth, serverUrl, username, password } = useAuth();
  const [rom, setRom] = useState<RommRomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // undefined: not resolved yet (Play still shows, per the comment below).
  // null: resolved, and nothing can launch this rom.
  // string: the resolved play route, e.g. "/rom/5/ejs" or "/rom/5/stream".
  const [playPath, setPlayPath] = useState<string | null | undefined>(
    undefined,
  );
  const [inBrowserPlayEnabled, setInBrowserPlayEnabled] = useState(true);
  // Non-null while a stream is being claimed and booted; `phase` is the
  // server's progress while it unpacks a large title.
  const [launching, setLaunching] = useState<{ phase: string | null } | null>(
    null,
  );
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [cardPrompt, setCardPrompt] =
    useState<RommMemoryCardImportRequired | null>(null);
  const launchAbort = useRef<AbortController | null>(null);

  // Leaving mid-launch cancels it, which releases the container again.
  useEffect(() => () => launchAbort.current?.abort(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await withAuth((url, token) => getRom(url, token, romId));
      setRom(result);

      const enabled = await getInBrowserPlayEnabled();
      const path = await resolvePlayPath(
        withAuth,
        result,
        platformSlug,
        enabled,
      );
      setInBrowserPlayEnabled(enabled);
      setPlayPath(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load game');
    } finally {
      setLoading(false);
    }
  }, [withAuth, romId, platformSlug]);

  useEffect(() => {
    navigation.setOptions({ title: romName });
    load();
  }, [load, navigation, romName]);

  const startStream = async (cardImport?: 'adopt' | 'discard') => {
    setLaunchError(null);
    setCardPrompt(null);
    setLaunching({ phase: null });
    const controller = new AbortController();
    launchAbort.current = controller;
    try {
      const loginPath = await getLoginPath();
      const session = await withAuth((url, token) =>
        startStreamingSession(url, token, romId, {
          login: { username, password, loginPath },
          cardImport,
          signal: controller.signal,
          onPhase: phase => setLaunching({ phase }),
        }),
      );
      navigation.navigate('GameStreamPlayer', {
        romId,
        romName,
        playUrl: session.url,
        platform: session.platform,
        container: session.container,
      });
    } catch (e) {
      if (controller.signal.aborted) {
        return;
      }
      if (e instanceof MemoryCardImportRequiredError) {
        setCardPrompt(e.details);
      } else {
        setLaunchError(describeStreamError(e));
      }
    } finally {
      if (!controller.signal.aborted) {
        setLaunching(null);
      }
    }
  };

  // RomM's own rom page is the floor when nothing has resolved yet (e.g. the
  // rom detail fetch is still in flight): it can't play the game itself, but
  // its own UI is there to try.
  const play = () => {
    if (launching) {
      return;
    }
    const path = playPath ?? `/rom/${romId}`;
    if (path.endsWith('/stream')) {
      startStream();
    } else {
      navigation.navigate('EmulatorPlayer', {
        romId,
        romName,
        playUrl: `${serverUrl}${path}`,
      });
    }
  };

  const metadatum = rom?.metadatum;
  const platformLabel = rom ? platformLabelFor(rom) : '';

  return (
    <View style={styles.container} testID="game-details-screen">
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.cover}>
            {rom?.url_cover ? (
              <Image
                source={{ uri: resolveCoverUrl(serverUrl, rom.url_cover) }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                testID="game-details-cover"
              />
            ) : (
              <CoverPlaceholder
                seed={rom?.id ?? romId}
                testID="game-details-cover-placeholder"
              />
            )}
          </View>

          <View style={styles.info}>
            <Text style={styles.name}>{rom?.name ?? romName}</Text>

            {rom && (
              <View style={styles.metaRow}>
                {platformLabel !== '' && (
                  <Text style={styles.metaText}>{platformLabel}</Text>
                )}
                {metadatum?.first_release_date != null && (
                  <Text style={styles.metaText}>
                    {`· ${formatReleaseDate(metadatum.first_release_date)}`}
                  </Text>
                )}
                {rom.is_identified && (
                  <VerifiedIcon color={colors.accent} size={16} />
                )}
                {Array.from(new Set(rom.regions ?? [])).map(region => (
                  <View key={region} style={styles.regionBadge}>
                    <Text style={styles.regionText}>{region}</Text>
                  </View>
                ))}
              </View>
            )}

            {playPath === null ? (
              <View style={styles.noPlayer} testID="no-player-notice">
                <Text style={styles.noPlayerTitle}>No player available</Text>
                <Text style={styles.noPlayerText}>
                  {inBrowserPlayEnabled
                    ? `RomM has no in-browser player for ${
                        platformLabel || 'this platform'
                      }, and your server has no streaming container for it.`
                    : 'In-Browser Play is turned off in Settings, and your server has no streaming container for this platform.'}
                </Text>
              </View>
            ) : (
              <FocusablePressable
                style={styles.playButton}
                onPress={play}
                hasTVPreferredFocus
                testID="play-button"
              >
                {launching ? (
                  <ActivityIndicator
                    color={colors.background}
                    size="small"
                    testID="stream-launching"
                  />
                ) : (
                  <PlayIcon color={colors.background} size={16} />
                )}
                <Text style={styles.playButtonText}>
                  {launching
                    ? launching.phase
                      ? `Starting stream (${launching.phase})…`
                      : 'Starting stream…'
                    : 'Play'}
                </Text>
              </FocusablePressable>
            )}

            {launchError && (
              <Text style={styles.error} testID="stream-error">
                {launchError}
              </Text>
            )}

            {cardPrompt && (
              <View style={styles.noPlayer} testID="memory-card-prompt">
                <Text style={styles.noPlayerTitle}>
                  The streaming container has a memory card in it
                </Text>
                <Text style={styles.noPlayerText}>
                  {cardPrompt.outcome === 'unreadable'
                    ? 'It could not be read. Keep it in the container, or discard it and start fresh?'
                    : `It holds ${
                        cardPrompt.summary?.file_count ?? 'some'
                      } file(s)${
                        cardPrompt.summary?.game_codes.length
                          ? ` (${cardPrompt.summary.game_codes.join(', ')})`
                          : ''
                      }. Keep it, or discard it and start fresh?`}
                </Text>
                <View style={styles.cardActions}>
                  <FocusablePressable
                    style={styles.retryButton}
                    onPress={() => startStream('adopt')}
                    hasTVPreferredFocus
                    testID="memory-card-adopt"
                  >
                    <Text style={styles.retryButtonText}>Keep card</Text>
                  </FocusablePressable>
                  <FocusablePressable
                    style={styles.retryButton}
                    onPress={() => startStream('discard')}
                    testID="memory-card-discard"
                  >
                    <Text style={styles.retryButtonText}>Discard card</Text>
                  </FocusablePressable>
                </View>
              </View>
            )}

            {loading && (
              <ActivityIndicator
                style={styles.metadataLoading}
                color={colors.accent}
                testID="game-details-loading"
              />
            )}

            {!loading && error && (
              <View style={styles.metadataError}>
                <Text style={styles.error}>{error}</Text>
                <FocusablePressable
                  style={styles.retryButton}
                  onPress={load}
                  testID="retry-button"
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </FocusablePressable>
              </View>
            )}

            {!loading && !error && rom && (
              <>
                {rom.summary && (
                  <Text style={styles.summary}>{rom.summary}</Text>
                )}

                {metadatum?.player_count && (
                  <View style={styles.chipSection}>
                    <Text style={styles.chipLabel}>PLAYERS</Text>
                    <Text style={styles.plainValue}>
                      {metadatum.player_count}
                    </Text>
                  </View>
                )}

                <ChipRow
                  label="Age rating"
                  items={metadatum?.age_ratings ?? []}
                />
                <ChipRow label="Genres" items={metadatum?.genres ?? []} />
                <ChipRow label="Companies" items={metadatum?.companies ?? []} />
                <ChipRow
                  label="Franchises"
                  items={metadatum?.franchises ?? []}
                />
                <ChipRow
                  label="Collections"
                  items={metadatum?.collections ?? []}
                />
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const COVER_WIDTH = 260;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 32, paddingBottom: 48 },
  hero: { flexDirection: 'row', gap: 28 },
  cover: {
    width: COVER_WIDTH,
    aspectRatio: 3 / 4,
    borderRadius: 12,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  info: { flex: 1, minWidth: 0 },
  name: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  metaText: { color: colors.textMuted, fontSize: 15 },
  regionBadge: {
    backgroundColor: colors.surfaceSolid,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  regionText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: colors.accent,
    marginTop: 4,
    marginBottom: 24,
  },
  playButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  noPlayer: {
    alignSelf: 'flex-start',
    maxWidth: 620,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSolid,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginTop: 4,
    marginBottom: 24,
  },
  noPlayerTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  noPlayerText: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  cardActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  metadataLoading: { alignItems: 'flex-start', marginTop: 8 },
  metadataError: { marginTop: 8 },
  error: { color: colors.danger, fontSize: 15, marginBottom: 12 },
  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryButtonText: { color: colors.textPrimary, fontWeight: '600' },
  summary: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
    maxWidth: 900,
  },
  chipSection: { marginBottom: 18 },
  chipLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  plainValue: { color: colors.textPrimary, fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: colors.surfaceSolid,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
});
