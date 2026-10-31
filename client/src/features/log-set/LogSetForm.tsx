import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { emptySetDraft, logSet, parseSetDraft, SetFields, type Session } from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { Button, colors, spacing } from '@/shared/ui';

type LogSetFormProps = {
  sessionId: string;
  sessionExerciseId: string;
  onLogged: (session: Session) => void;
};

/** Logs one Set (weight × reps, optional RPE and note) in the user's unit preference. */
export function LogSetForm({ sessionId, sessionExerciseId, onLogged }: LogSetFormProps) {
  const { state } = useAuth();
  const [draft, setDraft] = useState(emptySetDraft);
  // Bumped after each Set, so the fields start over (with the note closed).
  const [logged, setLogged] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (state.status !== 'signedIn') return null;
  const { token } = state;
  const unit = state.me.unitPreference ?? 'kg';
  const set = parseSetDraft(draft, unit);

  async function save() {
    if (!set) return;
    setError(null);
    setSaving(true);
    try {
      const session = await logSet(token, sessionId, sessionExerciseId, set);
      // Keep the weight: the next set is usually at the same weight.
      setDraft({ ...emptySetDraft, weight: draft.weight });
      setLogged((n) => n + 1);
      onLogged(session);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <SetFields key={logged} value={draft} onChange={setDraft} weightUnit={unit} />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Log set" onPress={save} loading={saving} disabled={!set} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  error: { color: colors.danger, fontSize: 15 },
});
