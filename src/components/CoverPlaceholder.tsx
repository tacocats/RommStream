import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { platformGradients } from '../theme/colors';

interface Props {
  /**
   * Cycles the gradient; pass a stable id so a given item keeps its color.
   * A string (e.g. a virtual collection's derived id) is hashed to a number.
   */
  seed: number | string;
  testID?: string;
}

/** Stable, non-cryptographic string hash for a gradient seed. */
function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) % 2147483647;
  }
  return hash;
}

/** Diagonal placeholder gradient for covers with no art, cycled by seed. */
export function CoverPlaceholder({ seed, testID }: Props) {
  const numericSeed = typeof seed === 'string' ? hashSeed(seed) : seed;
  const gradient = platformGradients[numericSeed % platformGradients.length];
  const gradientId = `cover-gradient-${numericSeed}`;

  return (
    <View style={StyleSheet.absoluteFill} testID={testID}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradient.from} />
            <Stop offset="1" stopColor={gradient.to} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}
