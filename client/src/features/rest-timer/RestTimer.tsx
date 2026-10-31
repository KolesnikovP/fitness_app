import { useEffect, useState } from 'react';
import { StyleSheet, Text, Vibration, View } from 'react-native';

import { Button, colors, spacing } from '@/shared/ui';

const DURATIONS_S = [60, 90, 120, 180];
const TICK_MS = 250;

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * An optional countdown between Sets. It lives on the device only, and keeps
 * time from its end time, so it stays right while the app is in the background.
 */
export function RestTimer() {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [over, setOver] = useState(false);

  const remaining = endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));

  useEffect(() => {
    if (endsAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [endsAt]);

  useEffect(() => {
    if (endsAt !== null && remaining === 0) {
      setEndsAt(null);
      setOver(true);
      Vibration.vibrate();
    }
  }, [endsAt, remaining]);

  function start(seconds: number) {
    const startedAt = Date.now();
    setNow(startedAt);
    setEndsAt(startedAt + seconds * 1000);
    setOver(false);
  }

  if (endsAt !== null) {
    return (
      <View style={styles.container}>
        <Text accessibilityLabel="Rest time left" style={styles.countdown}>
          {formatSeconds(remaining)}
        </Text>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button label="+15s" variant="secondary" onPress={() => setEndsAt(endsAt + 15_000)} />
          </View>
          <View style={styles.flex}>
            <Button label="Skip rest" variant="secondary" onPress={() => setEndsAt(null)} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{over ? 'Rest over.' : 'Rest timer'}</Text>
      <View style={styles.row}>
        {DURATIONS_S.map((seconds) => (
          <View key={seconds} style={styles.preset}>
            <Button label={`Rest ${formatSeconds(seconds)}`} variant="secondary" onPress={() => start(seconds)} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { fontSize: 15, fontWeight: '500', color: colors.text },
  countdown: { fontSize: 40, fontWeight: '700', color: colors.text, textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  preset: { flexGrow: 1, flexBasis: '45%' },
  flex: { flex: 1 },
});
