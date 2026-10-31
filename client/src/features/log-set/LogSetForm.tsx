import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import {
  logSet,
  parseReps,
  parseWeight,
  repsInput,
  RPE_SCALE,
  weightInput,
  type Session,
} from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { Button, colors, Select, spacing, TextField } from '@/shared/ui';

const RPE_OPTIONS = RPE_SCALE.map(({ rpe, meaning }) => ({ value: rpe, label: String(rpe), description: meaning }));

type LogSetFormProps = {
  sessionId: string;
  sessionExerciseId: string;
  onLogged: (session: Session) => void;
};

/** Logs one Set (weight × reps, optional RPE and note) in the user's unit preference. */
export function LogSetForm({ sessionId, sessionExerciseId, onLogged }: LogSetFormProps) {
  const { state } = useAuth();
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (state.status !== 'signedIn') return null;
  const { token } = state;
  const unit = state.me.unitPreference ?? 'kg';
  const parsedWeight = parseWeight(weight);
  const parsedReps = parseReps(reps);
  const complete = parsedWeight !== null && parsedReps !== null;

  async function save() {
    if (parsedWeight === null || parsedReps === null) return;
    setError(null);
    setSaving(true);
    try {
      const session = await logSet(token, sessionId, sessionExerciseId, {
        weight: parsedWeight,
        weightUnit: unit,
        reps: parsedReps,
        rpe,
        note: note.trim(),
      });
      // Keep the weight: the next set is usually at the same weight.
      setReps('');
      setRpe(null);
      setNote('');
      onLogged(session);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.field}>
          <TextField
            label={`Weight (${unit})`}
            value={weight}
            onChangeText={(text) => setWeight(weightInput(text))}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.field}>
          <TextField
            label="Reps"
            value={reps}
            onChangeText={(text) => setReps(repsInput(text))}
            keyboardType="number-pad"
          />
        </View>
      </View>
      <Select
        label="RPE"
        placeholder="Optional"
        options={RPE_OPTIONS}
        value={rpe}
        onChange={setRpe}
        clearLabel="No RPE"
      />
      <TextField label="Set note" placeholder="Optional" value={note} onChangeText={setNote} maxLength={500} />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Log set" onPress={save} loading={saving} disabled={!complete} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  field: { flex: 1 },
  error: { color: colors.danger, fontSize: 15 },
});
