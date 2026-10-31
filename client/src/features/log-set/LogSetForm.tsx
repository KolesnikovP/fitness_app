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
  const [showNote, setShowNote] = useState(false);
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
      setShowNote(false);
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
        <View style={styles.weight}>
          <TextField
            label={`Weight (${unit})`}
            value={weight}
            onChangeText={(text) => setWeight(weightInput(text))}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.reps}>
          <TextField
            label="Reps"
            value={reps}
            onChangeText={(text) => setReps(repsInput(text))}
            keyboardType="number-pad"
            textAlign="center"
          />
        </View>
        <View style={styles.rpe}>
          <Select
            label="RPE"
            placeholder="–"
            options={RPE_OPTIONS}
            value={rpe}
            onChange={setRpe}
            clearLabel="No RPE"
          />
        </View>
      </View>
      {showNote ? (
        <TextField label="Set note" placeholder="Optional" value={note} onChangeText={setNote} maxLength={500} />
      ) : (
        <Button label="Add set note" variant="link" onPress={() => setShowNote(true)} />
      )}
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
  // Each number field is sized for the digits it holds (weight up to 9999.99).
  weight: { width: 120 },
  reps: { width: 76 },
  rpe: { width: 64 },
  error: { color: colors.danger, fontSize: 15 },
});
