import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { supersetProgress, type Session, type SessionExercise } from '@/entities/workout';
import { UngroupSupersetButton } from '@/features/superset';
import { makeStyles, spacing } from '@/shared/ui';
import { listNames } from '@/shared/utils';

type SupersetBlockProps = {
  sessionId: string;
  supersetId: string;
  exercises: SessionExercise[];
  onChange: (session: Session) => void;
  /** The card of the member shown. */
  children: ReactNode;
};

/**
 * A Superset in the workout in progress, around the card of the member
 * shown: what's next, with rest only once every exercise has had its Set,
 * and ungrouping it.
 */
export function SupersetBlock({ sessionId, supersetId, exercises, onChange, children }: SupersetBlockProps) {
  const styles = useStyles();
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
      {children}
      <UngroupSupersetButton sessionId={sessionId} supersetId={supersetId} onUngrouped={onChange} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  block: {
    gap: spacing.sm,
    paddingLeft: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  label: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.primary },
  hint: { fontSize: 15, color: colors.muted },
  rest: { color: colors.text, fontWeight: '600' },
}));
