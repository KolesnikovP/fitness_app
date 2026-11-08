import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '@/shared/api';
import { makeStyles, spacing, Spinner } from '@/shared/ui';

import { getExerciseRecords } from './api';
import { countOf, formatShortDate, formatVolume, type Best, type Bests, type ExerciseRecords } from './model';

/**
 * The rows of the Bests table, in order. On screen the Estimated 1RM is "Best
 * 1RM" and the Exercise volume "Session volume".
 */
const BEST_ROWS: readonly { key: keyof Bests; label: string; format: (best: Best) => string }[] = [
  { key: 'estimated1RM', label: 'Best 1RM', format: formatBestSet },
  { key: 'heaviestWeight', label: 'Heaviest weight', format: formatBestSet },
  { key: 'setVolume', label: 'Best set volume', format: formatBestSet },
  { key: 'exerciseVolume', label: 'Session volume', format: (b) => formatVolume(b.value, b.unit ?? 'kg') },
  { key: 'mostReps', label: 'Most reps', format: (b) => countOf(b.value, 'rep') },
];

/** "100 kg × 5": the Set behind a Best. */
function formatBestSet(best: Best) {
  return best.set ? `${best.set.weight} ${best.set.weightUnit} × ${best.set.reps}` : `${best.value} ${best.unit}`;
}

/**
 * The User's Bests for an Exercise, each with its date (a measure never
 * reached, such as one by weight for an Exercise logged without, is left
 * out), then its Rep records: the heaviest Set at each rep count.
 */
export function ExerciseBestsCard({ token, exerciseId }: { token: string; exerciseId: string }) {
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

  let body;
  if (error) {
    body = (
      <Text accessibilityRole="alert" style={styles.error}>
        {error}
      </Text>
    );
  } else if (!records) {
    body = <Spinner />;
  } else {
    const rows = BEST_ROWS.flatMap(({ key, label, format }) => {
      const best = records.bests[key];
      return best ? [{ key, label, text: `${format(best)} · ${formatShortDate(best.achievedAt)}` }] : [];
    });
    body =
      rows.length === 0 ? (
        <Text style={styles.muted}>No bests yet.</Text>
      ) : (
        rows.map((row) => (
          <View key={row.key} accessible accessibilityLabel={row.label} style={styles.row}>
            <Text style={styles.label}>{row.label}</Text>
            <Text style={styles.value}>{row.text}</Text>
          </View>
        ))
      );
  }
  return (
    <>
      <View accessibilityLabel="Bests" style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          Bests
        </Text>
        {body}
      </View>
      {records && records.repRecords.length > 0 ? (
        <View accessibilityLabel="Rep records" style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>
            Rep records
          </Text>
          {records.repRecords.map((r) => (
            <Text key={r.reps} style={styles.record}>
              {countOf(r.reps, 'rep')}: {r.weight} {r.weightUnit}
            </Text>
          ))}
        </View>
      ) : null}
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.md, gap: spacing.xs },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  label: { fontSize: 15, color: colors.muted },
  value: { fontSize: 15, color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  record: { fontSize: 15, color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
  error: { color: colors.danger, fontSize: 15 },
}));
