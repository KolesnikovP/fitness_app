import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { createSuperset, type Session, type SessionExercise } from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { Button, colors, spacing } from '@/shared/ui';

type CreateSupersetFormProps = {
  sessionId: string;
  /** The exercises not yet in a Superset. */
  exercises: SessionExercise[];
  onCreated: (session: Session) => void;
  onCancel: () => void;
};

/** Picks two or more exercises of the workout in progress and groups them into a Superset. */
export function CreateSupersetForm({ sessionId, exercises, onCreated, onCancel }: CreateSupersetFormProps) {
  const { state } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (state.status !== 'signedIn') return null;
  const { token } = state;

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((s) => s !== id) : [...current, id]));
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      // In workout order, whatever order they were picked in.
      const ids = exercises.map((e) => e.id).filter((id) => selected.includes(id));
      onCreated(await createSuperset(token, sessionId, ids));
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <View accessibilityLabel="New superset" style={styles.container}>
      <Text style={styles.title}>New superset</Text>
      <Text style={styles.muted}>Pick two or more exercises to do back to back, resting after the last.</Text>
      {exercises.map((exercise) => {
        const checked = selected.includes(exercise.id);
        return (
          <Pressable
            key={exercise.id}
            accessibilityRole="checkbox"
            accessibilityLabel={exercise.name}
            accessibilityState={{ checked }}
            onPress={() => toggle(exercise.id)}
            style={styles.option}
          >
            <View style={[styles.box, checked && styles.boxChecked]}>
              {checked ? <Text style={styles.check}>✓</Text> : null}
            </View>
            <Text style={styles.optionText}>{exercise.name}</Text>
          </Pressable>
        );
      })}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Group as superset" onPress={save} loading={saving} disabled={selected.length < 2} />
      <Button label="Cancel" variant="secondary" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  title: { fontSize: 20, fontWeight: '600', color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  check: { color: colors.primaryText, fontWeight: '700' },
  optionText: { fontSize: 17, color: colors.text },
  error: { color: colors.danger, fontSize: 15 },
});
