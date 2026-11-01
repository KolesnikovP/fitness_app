import { StyleSheet, Text, View } from 'react-native';

import { makeStyles, spacing } from '@/shared/ui';

import { formatDuration, formatSessionDate, type SessionSummary } from './model';

/** One finished Session in the history list: date, duration and exercises. */
export function SessionSummaryItem({ session }: { session: SessionSummary }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Text style={styles.date}>
        {formatSessionDate(session.startedAt)} · {formatDuration(session.startedAt, session.finishedAt)}
      </Text>
      <Text style={styles.exercises}>{session.exerciseNames.join(', ')}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: {
    gap: 2,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  date: { fontSize: 15, color: colors.muted },
  exercises: { fontSize: 17, color: colors.text },
}));
