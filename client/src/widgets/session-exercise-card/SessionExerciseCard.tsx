import { StyleSheet, Text, View } from 'react-native';

import { formatSet, type Session, type SessionExercise } from '@/entities/workout';
import { ExerciseNoteField } from '@/features/exercise-note';
import { LogSetForm } from '@/features/log-set';
import { colors, spacing } from '@/shared/ui';

type SessionExerciseCardProps = {
  sessionId: string;
  sessionExercise: SessionExercise;
  onChange: (session: Session) => void;
};

/** One exercise in the workout in progress: its logged Sets, a note, and the form for the next Set. */
export function SessionExerciseCard({ sessionId, sessionExercise, onChange }: SessionExerciseCardProps) {
  return (
    <View accessibilityLabel={`${sessionExercise.name} card`} style={styles.card}>
      <Text style={styles.name}>{sessionExercise.name}</Text>
      {sessionExercise.sets.map((set, i) => (
        <View key={set.id} style={styles.set}>
          <Text style={styles.setNumber}>{i + 1}</Text>
          <View style={styles.setText}>
            <Text style={styles.setValue}>{formatSet(set)}</Text>
            {set.note ? <Text style={styles.setNote}>{set.note}</Text> : null}
          </View>
        </View>
      ))}
      <LogSetForm sessionId={sessionId} sessionExerciseId={sessionExercise.id} onLogged={onChange} />
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
  name: { fontSize: 20, fontWeight: '600', color: colors.text },
  set: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  setNumber: { width: 20, fontSize: 17, color: colors.muted },
  setText: { flex: 1, gap: 2 },
  setValue: { fontSize: 17, color: colors.text },
  setNote: { fontSize: 15, color: colors.muted },
});
