import { useEffect, useState } from 'react';
import { Pressable, Text, Vibration, View } from 'react-native';

import { formatRest } from '@/entities/workout';
import { Button, makeStyles, Sheet, spacing } from '@/shared/ui';

const DURATIONS_S = [60, 90, 120, 180];
const COUNTDOWN_TICK_MS = 250;

/**
 * An optional countdown between Sets, started by the User: a compact button
 * showing the time left, or that the rest is over, which opens a sheet
 * offering the rests the Routine planned (plannedSeconds) as well as the
 * usual ones, or, while counting down, more time or skipping it. It lives on
 * the device only, and keeps time from its end time, so it stays right while
 * the app is in the background.
 */
export function RestTimer({ plannedSeconds = [] }: { plannedSeconds?: number[] }) {
  const styles = useStyles();
  // The planned rests come first, then the usual ones not already planned.
  const durations = [...new Set([...plannedSeconds, ...DURATIONS_S])];
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState(false);

  const remaining = endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));

  useEffect(() => {
    if (endsAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(timer);
  }, [endsAt]);

  useEffect(() => {
    if (endsAt !== null && remaining === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- predates the linter; refactor when next touched.
      setEndsAt(null);
      setOver(true);
      Vibration.vibrate();
    }
  }, [endsAt, remaining]);

  function start(seconds: number) {
    // eslint-disable-next-line react-hooks/purity -- start runs on a press, not during render.
    const startedAt = Date.now();
    setNow(startedAt);
    setEndsAt(startedAt + seconds * 1000);
    setOver(false);
    setOpen(false);
  }

  function skip() {
    setEndsAt(null);
    setOpen(false);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Rest timer"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.icon}>⏱</Text>
        <Text style={[styles.buttonText, over && endsAt === null && styles.over]}>
          {endsAt !== null ? formatRest(remaining) : over ? 'Rest over.' : 'Rest'}
        </Text>
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} accessibilityLabel="Rest timer sheet" title="Rest timer">
        {endsAt !== null ? (
          <>
            <Text accessibilityLabel="Rest time left" style={styles.countdown}>
              {formatRest(remaining)}
            </Text>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button label="+15s" variant="secondary" onPress={() => setEndsAt(endsAt + 15_000)} />
              </View>
              <View style={styles.flex}>
                <Button label="Skip rest" variant="secondary" onPress={skip} />
              </View>
            </View>
          </>
        ) : (
          <View style={styles.row}>
            {durations.map((seconds) => (
              <View key={seconds} style={styles.preset}>
                <Button label={`Rest ${formatRest(seconds)}`} variant="secondary" onPress={() => start(seconds)} />
              </View>
            ))}
          </View>
        )}
      </Sheet>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
  },
  pressed: { backgroundColor: colors.card },
  icon: { fontSize: 17 },
  buttonText: { fontSize: 17, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  over: { color: colors.primary },
  countdown: { fontSize: 40, fontWeight: '700', color: colors.text, textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  preset: { flexGrow: 1, flexBasis: '45%' },
  flex: { flex: 1 },
}));
