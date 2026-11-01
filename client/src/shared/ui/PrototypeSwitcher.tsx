// PROTOTYPE: throwaway. Dev-only floating bar to flip between UI variants.
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type PrototypeSwitcherProps = {
  variants: readonly { key: string; name: string }[];
  current: string;
  onChange: (key: string) => void;
};

/** Floating ‹ label › pill at the bottom centre; ← / → also cycle on web. Hidden outside dev builds. */
export function PrototypeSwitcher({ variants, current, onChange }: PrototypeSwitcherProps) {
  const index = Math.max(0, variants.findIndex((v) => v.key === current));
  const step = (by: number) => onChange(variants[(index + by + variants.length) % variants.length].key);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!__DEV__) return null;
  const variant = variants[index];
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={styles.pill}>
        <Pressable accessibilityLabel="Previous variant" onPress={() => step(-1)} hitSlop={12}>
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Text style={styles.label}>
          {variant.key} ({variant.name})
        </Text>
        <Pressable accessibilityLabel="Next variant" onPress={() => step(1)} hitSlop={12}>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 40, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#1C1C1E',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  arrow: { color: '#FFD60A', fontSize: 26, fontWeight: '700', lineHeight: 28 },
  label: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
