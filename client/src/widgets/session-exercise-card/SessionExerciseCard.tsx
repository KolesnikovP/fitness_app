import { StyleSheet, Text, View } from 'react-native';

import { currentTarget, formatTarget, type Session, type SessionExercise } from '@/entities/workout';
import { ExerciseNoteField } from '@/features/exercise-note';
import { SwapSheet } from '@/features/swap-exercise';
import { colors, spacing } from '@/shared/ui';

import { SetTable } from './SetTable';

type SessionExerciseCardProps = {
  sessionId: string;
  sessionExercise: SessionExercise;
  onChange: (session: Session) => void;
  onDeleteSet: (setId: string) => void;
};

/**
 * One exercise in the workout in progress: what its Routine planned, if
 * anything, and swapping it for a Substitute; its Sets as a table, logged and
 * still to do; and a note.
 */
export function SessionExerciseCard({ sessionId, sessionExercise, onChange, onDeleteSet }: SessionExerciseCardProps) {
  const target = currentTarget(sessionExercise);

  return (
    <View accessibilityLabel={`${sessionExercise.name} card`} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.name}>{sessionExercise.name}</Text>
          <SwapSheet sessionId={sessionId} sessionExercise={sessionExercise} onSwapped={onChange} />
        </View>
        {/* Where the exercise's picture will go. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.picture} />
      </View>
      {target ? (
        <View style={styles.target}>
          <Text style={styles.targetValue}>Target {formatTarget(target)}</Text>
          {target.note ? <Text style={styles.setNote}>{target.note}</Text> : null}
        </View>
      ) : null}
      <SetTable
        // Starts over on a swap, from the Target for the Exercise swapped to.
        key={sessionExercise.exerciseId}
        sessionId={sessionId}
        sessionExercise={sessionExercise}
        onChange={onChange}
        onDeleteSet={onDeleteSet}
      />
      <ExerciseNoteField sessionId={sessionId} sessionExercise={sessionExercise} onSaved={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  heading: { flex: 1, gap: spacing.xs },
  name: { fontSize: 20, fontWeight: '600', color: colors.text },
  picture: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#DCE9FA' },
  target: { gap: 2 },
  targetValue: { fontSize: 15, fontWeight: '600', color: colors.primary },
  setNote: { fontSize: 15, color: colors.muted },
});
