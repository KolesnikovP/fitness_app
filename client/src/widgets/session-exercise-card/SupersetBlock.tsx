import { StyleSheet, Text, View } from 'react-native';

import { supersetProgress, type Session, type SessionExercise } from '@/entities/workout';
import { UngroupSupersetButton } from '@/features/superset';
import { colors, spacing } from '@/shared/ui';

import { SessionExerciseCard } from './SessionExerciseCard';

type SupersetBlockProps = {
  sessionId: string;
  supersetId: string;
  exercises: SessionExercise[];
  onChange: (session: Session) => void;
};

/** "A and B", "A, B and C" */
function listNames(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/**
 * A Superset in the workout in progress: its exercises back to back, and
 * what's next, with rest only once every exercise has had its Set.
 */
export function SupersetBlock({ sessionId, supersetId, exercises, onChange }: SupersetBlockProps) {
  const progress = supersetProgress(exercises);
  const started = exercises.some((e) => e.sets.length > 0);
  const hint =
    progress.kind === 'roundDone'
      ? `Round ${progress.round} done. Rest now.`
      : `Next: ${progress.exercise.name}${started ? ', no rest' : ''}`;

  return (
    <View accessibilityLabel={`Superset of ${listNames(exercises.map((e) => e.name))}`} style={styles.block}>
      <Text style={styles.label}>Superset</Text>
      <Text style={[styles.hint, progress.kind === 'roundDone' && styles.rest]}>{hint}</Text>
      {exercises.map((sessionExercise) => (
        <SessionExerciseCard
          key={sessionExercise.id}
          sessionId={sessionId}
          sessionExercise={sessionExercise}
          onChange={onChange}
        />
      ))}
      <UngroupSupersetButton sessionId={sessionId} supersetId={supersetId} onUngrouped={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
    paddingLeft: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  label: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.primary },
  hint: { fontSize: 15, color: colors.muted },
  rest: { color: colors.text, fontWeight: '600' },
});
