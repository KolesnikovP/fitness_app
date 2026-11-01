import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  currentTarget,
  formatSet,
  formatTarget,
  type Session,
  type SessionExercise,
} from '@/entities/workout';
import { EditSetForm } from '@/features/edit-set';
import { ExerciseNoteField } from '@/features/exercise-note';
import { LogSetForm } from '@/features/log-set';
import { SwapVariant } from '@/features/swap-exercise';
import { colors, spacing } from '@/shared/ui';

type SessionExerciseCardProps = {
  sessionId: string;
  sessionExercise: SessionExercise;
  onChange: (session: Session) => void;
  onDeleteSet: (setId: string) => void;
};

/**
 * One exercise in the workout in progress: what its Routine planned, if
 * anything, and the Substitutes to swap it for; its logged Sets (tap one to
 * correct or delete it), a note, and the form for the next Set.
 */
export function SessionExerciseCard({ sessionId, sessionExercise, onChange, onDeleteSet }: SessionExerciseCardProps) {
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const target = currentTarget(sessionExercise);
  // PROTOTYPE: which swap UI variant to draw.
  const { variant = 'A' } = useLocalSearchParams<{ variant?: string }>();

  return (
    <View accessibilityLabel={`${sessionExercise.name} card`} style={styles.card}>
      <SwapVariant variant={variant} sessionId={sessionId} sessionExercise={sessionExercise} onSwapped={onChange} />
      {target ? (
        <View style={styles.target}>
          <Text style={styles.targetValue}>Target {formatTarget(target)}</Text>
          {target.note ? <Text style={styles.setNote}>{target.note}</Text> : null}
          {sessionExercise.sets.length > 0 ? (
            <Text style={styles.setNote}>
              {sessionExercise.sets.length} of {target.sets} sets
            </Text>
          ) : null}
        </View>
      ) : null}
      {sessionExercise.sets.map((set, i) =>
        set.id === editingSetId ? (
          <EditSetForm
            key={set.id}
            sessionId={sessionId}
            set={set}
            number={i + 1}
            onSaved={(session) => {
              setEditingSetId(null);
              onChange(session);
            }}
            onDelete={() => {
              setEditingSetId(null);
              onDeleteSet(set.id);
            }}
            onCancel={() => setEditingSetId(null)}
          />
        ) : (
          <Pressable
            key={set.id}
            accessibilityRole="button"
            accessibilityLabel={`Edit set ${i + 1}`}
            onPress={() => setEditingSetId(set.id)}
            style={({ pressed }) => [styles.set, pressed && styles.pressed]}
          >
            <Text style={styles.setNumber}>{i + 1}</Text>
            <View style={styles.setText}>
              <Text style={styles.setValue}>{formatSet(set)}</Text>
              {/* Done with another exercise, before a swap. */}
              {set.exerciseId !== sessionExercise.exerciseId ? <Text style={styles.setNote}>{set.name}</Text> : null}
              {set.note ? <Text style={styles.setNote}>{set.note}</Text> : null}
            </View>
          </Pressable>
        ),
      )}
      <LogSetForm
        // Starts over on a swap, from the Target for the Exercise swapped to.
        key={sessionExercise.exerciseId}
        sessionId={sessionId}
        sessionExerciseId={sessionExercise.id}
        target={target}
        onLogged={onChange}
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
  name: { fontSize: 20, fontWeight: '600', color: colors.text },
  target: { gap: 2 },
  targetValue: { fontSize: 15, fontWeight: '600', color: colors.primary },
  set: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', paddingVertical: 2 },
  pressed: { opacity: 0.5 },
  setNumber: { width: 20, fontSize: 17, color: colors.muted },
  setText: { flex: 1, gap: 2 },
  setValue: { fontSize: 17, color: colors.text },
  setNote: { fontSize: 15, color: colors.muted },
});
