import { Pressable, StyleSheet, Text } from 'react-native';

import { makeStyles, spacing } from '@/shared/ui';

import { formatSessionDate, type SessionSummary } from './model';
import { SessionStatsLine } from './SessionStatsLine';

/** One finished Session in the History: its date, Exercises and stats. */
export function SessionSummaryItem({ session, onPress }: { session: SessionSummary; onPress: () => void }) {
  const styles = useStyles();
  const date = formatSessionDate(session.finishedAt);
  const names = session.exerciseNames.join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${date}: ${names}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={styles.date}>{date}</Text>
      <Text style={styles.exercises}>{names}</Text>
      <SessionStatsLine stats={session.stats} />
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  row: {
    gap: 2,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.6 },
  date: { fontSize: 15, color: colors.muted },
  exercises: { fontSize: 17, color: colors.text },
}));
