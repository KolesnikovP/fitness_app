// PROTOTYPE (branch prototype/noise): a texture over the app's flat colours.
// Question: does texture suit the palette, and which one: even grain, or print-style specks like the
// user's reference (assets/noise/noise_samples.png)?
// Switch: the pink pill at the top. ‹ › change the texture; tapping the name flips light/dark (and
// saves that as the theme pick; set Profile > Theme > System to follow the phone again).
// The texture choice lives in memory only.
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from './ThemeProvider';

// Grain: even film grain. Specks 1-5: modelled on the five strips in assets/noise/noise_samples.png.
// Plain names here; a phone gets the @2x/@3x file (the plain ones exist so Jest can resolve them).
const LEVELS = [
  { name: 'Off', source: null, opacity: 0 },
  { name: 'Grain', source: require('../../../assets/noise/grain.png'), opacity: 0.08 },
  { name: '1 · sparse white', source: require('../../../assets/noise/speck-1.png'), opacity: 1 },
  { name: '2 · sparse black', source: require('../../../assets/noise/speck-2.png'), opacity: 1 },
  { name: '3 · white flecks', source: require('../../../assets/noise/speck-3.png'), opacity: 1 },
  { name: '4 · black dust', source: require('../../../assets/noise/speck-4.png'), opacity: 1 },
  { name: '5 · white scuffs', source: require('../../../assets/noise/speck-5.png'), opacity: 1 },
] as const;

const NoiseContext = createContext<{ level: number; setLevel: (level: number) => void }>({
  level: 1,
  setLevel: () => {},
});

export function NoiseProvider({ children }: { children: ReactNode }) {
  const [level, setLevel] = useState(2);
  return <NoiseContext.Provider value={{ level, setLevel }}>{children}</NoiseContext.Provider>;
}

/** The grain, filling its parent. Put it first among the parent's children so content sits on top. */
export function Noise() {
  const { level } = useContext(NoiseContext);
  const { source, opacity } = LEVELS[level];
  if (!source) return null;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { opacity }]}
    >
      <Image source={source} resizeMode="repeat" style={styles.fill} />
    </View>
  );
}

export function NoiseBadge() {
  const insets = useSafeAreaInsets();
  const { level, setLevel } = useContext(NoiseContext);
  const { scheme, setPreference } = useTheme();
  if (!__DEV__) return null;
  const step = (by: number) => setLevel((level + by + LEVELS.length) % LEVELS.length);
  const { name } = LEVELS[level];
  return (
    <View style={[styles.wrap, { top: insets.top + 4 }]}>
      <Pressable accessibilityLabel="Previous texture" hitSlop={10} onPress={() => step(-1)}>
        <Text style={styles.arrow}>‹</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Switch light and dark"
        hitSlop={6}
        onPress={() => setPreference(scheme === 'dark' ? 'light' : 'dark')}
      >
        <Text style={styles.text}>
          {name} · {scheme}
        </Text>
      </Pressable>
      <Pressable accessibilityLabel="Next texture" hitSlop={10} onPress={() => step(1)}>
        <Text style={styles.arrow}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#FF00AA', // deliberately off-palette: not part of the design
  },
  text: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  arrow: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', lineHeight: 24 },
});
