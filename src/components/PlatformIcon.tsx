import React, { memo, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { colors } from '../theme/colors';
import { useMountTurn } from './mountQueue';
import { createLogger } from '../utils/logger';
import {
  invalidatePlatformIcon,
  peekPlatformIcon,
  ResolvedIcon,
  resolvePlatformIcon,
} from './platformIconCache';

const log = createLogger('platformIcon');

export { iconCandidates, inlineSvgClasses } from './platformIconCache';

interface Props {
  serverUrl: string;
  name: string;
  slug?: string;
  fsSlug?: string;
  size?: number;
}

// Renders whatever the cache resolves for the platform: an inlined SVG, an
// .ico via Image, or a letter badge when RomM has no icon for it.
export const PlatformIcon = memo(function PlatformIconView({
  serverUrl,
  name,
  slug,
  fsSlug,
  size = 56,
}: Props) {
  const [icon, setIcon] = useState<ResolvedIcon | null>(() =>
    peekPlatformIcon(serverUrl, [fsSlug, slug]),
  );

  useEffect(() => {
    let cancelled = false;
    setIcon(peekPlatformIcon(serverUrl, [fsSlug, slug]));
    const t0 = Date.now();
    resolvePlatformIcon(serverUrl, [fsSlug, slug]).then(resolved => {
      log.debug(`${slug} ready after ${Date.now() - t0}ms (${resolved.kind})`);
      if (!cancelled) {
        setIcon(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [serverUrl, fsSlug, slug]);

  // Held back until its turn so 30+ icons don't mount in a single render.
  const svgTurn = useMountTurn(icon?.kind === 'svg');

  if (!icon || (icon.kind === 'svg' && !svgTurn)) {
    return <View style={{ width: size, height: size }} />;
  }

  if (icon.kind === 'svg') {
    return <SvgXml xml={icon.xml} width={size} height={size} />;
  }

  if (icon.kind === 'ico') {
    return (
      <Image
        testID="platform-icon-image"
        source={{ uri: icon.url }}
        style={{ width: size, height: size }}
        resizeMode="contain"
        onError={() => {
          invalidatePlatformIcon(serverUrl, [fsSlug, slug]);
          setIcon({ kind: 'none' });
        }}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: size / 4 },
      ]}
    >
      <Text style={styles.fallbackText}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.avatarBg,
  },
  fallbackText: { color: colors.textPrimary, fontSize: 22, fontWeight: '700' },
});
