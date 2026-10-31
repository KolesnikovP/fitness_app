import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { setExerciseNote, type Session, type SessionExercise } from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { Button, colors, spacing, TextField } from '@/shared/ui';

type ExerciseNoteFieldProps = {
  sessionId: string;
  sessionExercise: SessionExercise;
  onSaved: (session: Session) => void;
};

/** The optional note on a Session exercise, saved on request. */
export function ExerciseNoteField({ sessionId, sessionExercise, onSaved }: ExerciseNoteFieldProps) {
  const { state } = useAuth();
  const [note, setNote] = useState(sessionExercise.note);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (state.status !== 'signedIn') return null;
  const { token } = state;
  const changed = note.trim() !== sessionExercise.note;

  async function save() {
    setError(null);
    setStatus('saving');
    try {
      onSaved(await setExerciseNote(token, sessionId, sessionExercise.id, note.trim()));
      setStatus('saved');
    } catch (e) {
      setError(errorMessage(e));
      setStatus('idle');
    }
  }

  return (
    <View style={styles.container}>
      <TextField
        label="Exercise note"
        placeholder="Optional"
        value={note}
        onChangeText={(text) => {
          setNote(text);
          setStatus('idle');
        }}
        maxLength={500}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {changed ? (
        <Button label="Save note" variant="secondary" onPress={save} loading={status === 'saving'} />
      ) : status === 'saved' ? (
        <Text style={styles.saved}>Note saved.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  error: { color: colors.danger, fontSize: 15 },
  saved: { fontSize: 15, color: colors.muted },
});
