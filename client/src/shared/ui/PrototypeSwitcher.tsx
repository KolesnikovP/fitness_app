// PROTOTYPE: throwaway. Lives on prototype/* branches only, never on main.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

type Variant = { key: string; name: string };

/** The current `?variant=` of the route, or the first variant's key. */
export function usePrototypeVariant(variants: readonly Variant[]) {
  const { variant } = useLocalSearchParams<{ variant?: string }>();
  return variants.some((v) => v.key === variant) ? variant! : variants[0].key;
}

/**
 * A pill pinned to the bottom of the screen that cycles `?variant=` through the variants,
 * also on ← and → on web. Hidden outside development.
 */
export function PrototypeSwitcher({ variants }: { variants: readonly Variant[] }) {
  const current = usePrototypeVariant(variants);
  const index = variants.findIndex((v) => v.key === current);
  const go = (step: number) =>
    router.setParams({ variant: variants[(index + step + variants.length) % variants.length].key });

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!__DEV__) return null;
  const shown = variants[index];
  return (
    <View style={{ alignItems: 'center', paddingVertical: 6 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#E0187B',
          borderRadius: 999,
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
        <Pressable accessibilityLabel="Previous variant" onPress={() => go(-1)} style={{ padding: 12 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>‹</Text>
        </Pressable>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', minWidth: 170, textAlign: 'center' }}>
          {shown.key} ({shown.name})
        </Text>
        <Pressable accessibilityLabel="Next variant" onPress={() => go(1)} style={{ padding: 12 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}
