import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../theme/colors';
import { CoverPlaceholder } from './CoverPlaceholder';

const TILE_WIDTH = 150;
const TILE_HEIGHT = 190;
const GAP = 22;

// Each column's tiles, and how far it's nudged down, for a staggered wall.
const COLUMNS = [
  { offset: -40, labels: ['', 'GBA', 'N64'] },
  { offset: -150, labels: ['', 'PS2', 'WII', 'GBA'] },
  { offset: -90, labels: ['', 'N64', 'GCN', 'SNES'] },
  { offset: -200, labels: ['', 'PSX', 'GB', 'NDS'] },
];

/**
 * Decorative wall of tilted placeholder covers behind the sign-in screens,
 * fading into the background on its left so the form stays readable.
 */
export function LoginCoverWall() {
  return (
    <View style={styles.wall} pointerEvents="none">
      <View style={styles.grid}>
        {COLUMNS.map((column, c) => (
          <View key={c} style={[styles.column, { marginTop: column.offset }]}>
            {column.labels.map((label, t) => (
              <View key={t} style={styles.tile}>
                <CoverPlaceholder seed={c * 5 + t * 2 + 1} />
                <View style={styles.circle} />
                <View style={styles.square} />
                {label ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{label}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ))}
      </View>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="cover-wall-fade" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.background} stopOpacity={1} />
            <Stop offset="0.45" stopColor={colors.background} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#cover-wall-fade)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wall: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: '55%',
    overflow: 'hidden',
  },
  grid: {
    position: 'absolute',
    top: -40,
    left: 40,
    flexDirection: 'row',
    gap: GAP,
    transform: [{ rotate: '-12deg' }],
  },
  column: { gap: GAP },
  tile: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    opacity: 0.7,
  },
  circle: {
    position: 'absolute',
    right: -30,
    bottom: -20,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  square: {
    position: 'absolute',
    left: 40,
    top: 80,
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    transform: [{ rotate: '8deg' }],
  },
  badge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.badgeBg,
  },
  badgeText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});
