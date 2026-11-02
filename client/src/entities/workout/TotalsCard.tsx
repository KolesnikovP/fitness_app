import { Text, View } from 'react-native';

import { muscleGroupLabel } from '@/entities/exercise';
import { makeStyles, spacing } from '@/shared/ui';

import { countOf, formatVolume, type Totals } from './model';

/** Totals for a range of days, such as this week: workouts, Volume, and Sets per Muscle group. */
export function TotalsCard({ title, totals }: { title: string; totals: Totals }) {
  const styles = useStyles();
  return (
    <View accessibilityLabel={title} style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <View style={styles.figures}>
        <View style={styles.figure}>
          <Text style={styles.value}>{countOf(totals.sessionCount, 'workout')}</Text>
        </View>
        <View style={styles.figure}>
          <Text style={styles.value}>{formatVolume(totals.volume, totals.volumeUnit)}</Text>
          <Text style={styles.muted}>Volume</Text>
        </View>
      </View>
      {totals.setsPerMuscleGroup.map(({ muscleGroup, sets }) => {
        const label = muscleGroupLabel(muscleGroup);
        return (
          <View key={muscleGroup} accessibilityLabel={label} style={styles.groupRow}>
            <Text style={styles.group}>{label}</Text>
            <Text style={styles.muted}>{countOf(sets, 'set')}</Text>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.md, gap: spacing.sm },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  figures: { flexDirection: 'row', gap: spacing.lg },
  figure: { gap: 2 },
  value: { fontSize: 22, fontWeight: '700', color: colors.text },
  groupRow: { flexDirection: 'row', justifyContent: 'space-between' },
  group: { fontSize: 15, color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
}));
