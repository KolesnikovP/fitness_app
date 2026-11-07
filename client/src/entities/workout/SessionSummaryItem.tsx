import { Pressable, StyleSheet, Text } from 'react-native';

import { makeStyles, spacing } from '@/shared/ui';

import { countOf, formatSessionDate, type SessionSummary } from './model';
import { SessionStatsLine } from './SessionStatsLine';

/** One finished Session in the History: its name, date, Exercises, stats and how many Personal records it set. */
export function SessionSummaryItem({ session, onPress }: { session: SessionSummary; onPress: () => void }) {
  const styles = useStyles();
  const date = formatSessionDate(session.finishedAt);
  const name = session.name;
  const names = session.exerciseNames.join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${date}: ${names}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.date}>{date}</Text>
      <Text style={styles.exercises}>{names}</Text>
      <SessionStatsLine stats={session.stats} />
      {session.personalRecords.length > 0 ? (
        <Text style={styles.records}>{countOf(session.personalRecords.length, 'personal record')}</Text>
      ) : null}
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
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  date: { fontSize: 15, color: colors.muted },
  exercises: { fontSize: 15, color: colors.text },
  records: { fontSize: 15, fontWeight: '600', color: colors.primary },
}));
