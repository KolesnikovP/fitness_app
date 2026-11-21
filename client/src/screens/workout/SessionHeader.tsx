import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { formatElapsed } from '@/entities/workout';
import { askHowToEnd } from '@/features/end-workout';
import { RestTimer } from '@/features/rest-timer';
import { Button, makeStyles, spacing } from '@/shared/ui';

type SessionHeaderProps = {
  /** When the Session started, as an ISO time. */
  startedAt: string;
  /** The rests the Routine planned, offered first by the Rest timer. */
  plannedRests: number[];
  /** Whether it can be finished, once a Set is logged; until then Finish can only discard it. */
  canFinish: boolean;
  finishing: boolean;
  onFinish: () => void;
  /** Discards it, once the User has confirmed. */
  onDiscard: () => void;
};

/**
 * The workout in progress's controls, above whichever Session exercise is
 * shown: the time since it started (ticking), the Rest timer, and Finish,
 * which asks how to end it (see askHowToEnd): finish it once a Set is
 * logged, or discard it.
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
      <Elapsed startedAt={startedAt} />
      <View style={styles.spacer} />
      <RestTimer plannedSeconds={plannedRests} />
      <Button
        label="Finish"
        accessibilityLabel="Finish workout"
        size="small"
        onPress={() => askHowToEnd({ onFinish: canFinish ? onFinish : undefined, onDiscard })}
        loading={finishing}
      />
    </View>
  );
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
  elapsed: { fontSize: 17, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
}));
