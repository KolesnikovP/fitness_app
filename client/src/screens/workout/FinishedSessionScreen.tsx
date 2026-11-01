import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useAuth } from '@/entities/auth';
import { saveSessionAsRoutine } from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { Button, colors, Screen, TextField } from '@/shared/ui';

/** Shown after finishing a Freeform session: offers to save it as a Routine to repeat. */
export function FinishedSessionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { state } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (state.status !== 'signedIn') return null;
  const { token } = state;

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await saveSessionAsRoutine(token, sessionId, name);
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <Screen title="Workout finished">
      <Text style={styles.muted}>
        Save it as a routine to do it again, with the sets, reps and weights you just logged as targets.
      </Text>
      <TextField label="Routine name" placeholder="Push day" value={name} onChangeText={setName} maxLength={100} />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Save as routine" onPress={save} loading={saving} disabled={name.trim() === ''} />
      <Button label="Done" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 15 },
  muted: { fontSize: 17, color: colors.muted },
});
