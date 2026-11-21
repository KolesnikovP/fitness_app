import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { formatElapsed } from '@/entities/workout';
import { RestTimer } from '@/features/rest-timer';
import { Button, makeStyles, Sheet, spacing } from '@/shared/ui';

type SessionHeaderProps = {
  /** When the Session started, as an ISO time. */
  startedAt: string;
  /** The rests the Routine planned, offered first by the Rest timer. */
  plannedRests: number[];
  /** Whether it can be finished: once a Set is logged. */
  canFinish: boolean;
  finishing: boolean;
  onFinish: () => void;
  /** Discards it, once the User has confirmed. */
  onDiscard: () => void;
};

/**
 * The workout in progress's controls, above whichever Session exercise is
 * shown: a ☰ menu holding Discard, the time since it started (ticking), the
 * Rest timer and Finish.
 */
export function SessionHeader({
  startedAt,
  plannedRests,
  canFinish,
  finishing,
  onFinish,
  onDiscard,
}: SessionHeaderProps) {
  const styles = useStyles();
  return (
    <View accessibilityLabel="Workout controls" style={styles.row}>
      <WorkoutMenu onDiscard={onDiscard} />
      <Elapsed startedAt={startedAt} />
      <View style={styles.spacer} />
      <RestTimer plannedSeconds={plannedRests} />
      <Button
        label="Finish"
        accessibilityLabel="Finish workout"
        size="small"
        onPress={onFinish}
        loading={finishing}
        disabled={!canFinish}
      />
    </View>
  );
}

/** A ☰ button opening a sheet with Discard workout, which asks first. */
function WorkoutMenu({ onDiscard }: { onDiscard: () => void }) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);

  // The sheet stays up under the question, since an alert can't open as a
  // sheet closes on iOS.
  async function discard() {
    const confirmed = await confirmDiscard();
    setOpen(false);
    if (confirmed) onDiscard();
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Workout menu"
        hitSlop={8}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
      >
        <Text style={styles.menuIcon}>☰</Text>
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} accessibilityLabel="Workout menu sheet" title="Workout">
        <Button label="Discard workout" variant="secondary" tone="danger" onPress={discard} />
        <Button label="Cancel" variant="link" onPress={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

/** Asks whether to discard the workout, and whether the User said yes. */
function confirmDiscard(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Discard workout?',
      'Everything logged in this workout will be deleted.',
      [
        { text: 'Keep logging', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Discard', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** The time since startedAt, "0:12:05", ticking each second. */
function Elapsed({ startedAt }: { startedAt: string }) {
  const styles = useStyles();
  const started = Date.parse(startedAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ELAPSED_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text accessibilityLabel="Time since the workout started" style={styles.elapsed}>
      {formatElapsed(Math.max(0, Math.floor((now - started) / 1000)))}
    </Text>
  );
}

const ELAPSED_TICK_MS = 1000;

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  spacer: { flex: 1 },
  menuButton: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: colors.card },
  menuIcon: { fontSize: 22, color: colors.text },
  elapsed: { fontSize: 17, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
}));
