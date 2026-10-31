import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { logSet, parseOptionalRpe, parseReps, parseWeight, type Session } from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { Button, colors, spacing, TextField } from '@/shared/ui';

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
  const [rpe, setRpe] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (state.status !== 'signedIn') return null;
  const { token } = state;
  const unit = state.me.unitPreference ?? 'kg';
  const parsedWeight = parseWeight(weight);
  const parsedReps = parseReps(reps);
  const parsedRpe = parseOptionalRpe(rpe);
  const complete = parsedWeight !== null && parsedReps !== null && parsedRpe.valid;

  async function save() {
    if (parsedWeight === null || parsedReps === null || !parsedRpe.valid) return;
    setError(null);
    setSaving(true);
    try {
      const session = await logSet(token, sessionId, sessionExerciseId, {
        weight: parsedWeight,
        weightUnit: unit,
        reps: parsedReps,
        rpe: parsedRpe.rpe,
        note: note.trim(),
      });
      // Keep the weight: the next set is usually at the same weight.
      setReps('');
      setRpe('');
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
          <TextField label={`Weight (${unit})`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
        </View>
        <View style={styles.field}>
          <TextField label="Reps" value={reps} onChangeText={setReps} keyboardType="number-pad" />
        </View>
        <View style={styles.field}>
          <TextField label="RPE" placeholder="1–10" value={rpe} onChangeText={setRpe} keyboardType="decimal-pad" />
        </View>
      </View>
      {parsedRpe.valid ? null : <Text style={styles.error}>RPE is from 1 to 10, in half steps.</Text>}
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
