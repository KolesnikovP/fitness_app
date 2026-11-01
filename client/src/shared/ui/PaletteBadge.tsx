// PROTOTYPE (branch prototype/palette): switches between the palettes in theme.ts. Dev builds only.
// Every StyleSheet reads the colours once, at load, so a switch saves the choice and reloads the app.
import { reloadAppAsync } from 'expo';
import * as SecureStore from 'expo-secure-store';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, PALETTE, PALETTE_KEYS, PALETTE_STORAGE_KEY } from './theme';

function switchBy(step: number) {
  const i = PALETTE_KEYS.indexOf(PALETTE);
  const next = PALETTE_KEYS[(i + step + PALETTE_KEYS.length) % PALETTE_KEYS.length];
  SecureStore.setItem(PALETTE_STORAGE_KEY, next);
  void reloadAppAsync('prototype palette switch');
}

export function PaletteBadge() {
  const insets = useSafeAreaInsets();
  if (!__DEV__) return null;
  return (
    <View style={[styles.wrap, { top: insets.top + 4 }]}>
      <Pressable accessibilityLabel="Previous palette" hitSlop={10} onPress={() => switchBy(-1)}>
        <Text style={styles.arrow}>‹</Text>
      </Pressable>
      <Text style={styles.text}>
        {PALETTE} · {colors.name}
      </Text>
      <Pressable accessibilityLabel="Next palette" hitSlop={10} onPress={() => switchBy(1)}>
        <Text style={styles.arrow}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
