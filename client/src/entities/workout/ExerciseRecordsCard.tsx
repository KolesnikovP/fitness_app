import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { errorMessage } from '@/shared/api';
import { makeStyles, spacing, Spinner } from '@/shared/ui';

import { getExerciseRecords } from './api';
import { countOf, type ExerciseRecords } from './model';

/**
 * The User's current records for an Exercise: its best Estimated 1RM, and the
 * heaviest Set at each rep count.
 */
export function ExerciseRecordsCard({ token, exerciseId }: { token: string; exerciseId: string }) {
  const styles = useStyles();
  const [records, setRecords] = useState<ExerciseRecords | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    getExerciseRecords(token, exerciseId)
      .then((found) => current && setRecords(found))
      .catch((e) => current && setError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [token, exerciseId]);

  const top = records?.bests.estimated1RM;
  let body;
  if (error) {
    body = (
      <Text accessibilityRole="alert" style={styles.error}>
        {error}
      </Text>
    );
  } else if (!records) {
    body = <Spinner />;
  } else if (!top?.set) {
    body = <Text style={styles.muted}>No records yet.</Text>;
  } else {
    const { value, unit, set } = top;
    body = (
      <>
        <Text style={styles.record}>
          Estimated 1RM: {value} {unit}, from {set.weight} {set.weightUnit} × {set.reps}
        </Text>
        {records.repRecords.map((r) => (
          <Text key={r.reps} style={styles.record}>
            {countOf(r.reps, 'rep')}: {r.weight} {r.weightUnit}
          </Text>
        ))}
      </>
    );
  }
  return (
    <View accessibilityLabel="Records" style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        Records
      </Text>
      {body}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.md, gap: spacing.xs },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  record: { fontSize: 15, color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
  error: { color: colors.danger, fontSize: 15 },
}));
