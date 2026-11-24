import { useState } from 'react';
import { Text } from 'react-native';

import { useAuth } from '@/entities/auth';
import { MAX_EXERCISE_NOTE_CHARS, setExerciseNote, type Session, type SessionExercise } from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { Button, makeStyles, Sheet, TextField } from '@/shared/ui';

type ExerciseNoteSheetProps = {
  sessionId: string;
  sessionExercise: SessionExercise;
  onSaved: (session: Session) => void;
  open: boolean;
  onClose: () => void;
};

/**
 * A sheet for the optional note on a Session exercise: one field with its
 * character count, and Save, which stores it and closes the sheet. Closing
 * it any other way drops what was typed.
 */
export function ExerciseNoteSheet({ sessionId, sessionExercise, onSaved, open, onClose }: ExerciseNoteSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} accessibilityLabel={`${sessionExercise.name} note`} title="Note" closeButton>
      {/* Mounted only while open, so it starts from the note saved each time. */}
      {open ? (
        <NoteForm sessionId={sessionId} sessionExercise={sessionExercise} onSaved={onSaved} onClose={onClose} />
      ) : null}
    </Sheet>
  );
}

function NoteForm({ sessionId, sessionExercise, onSaved, onClose }: Omit<ExerciseNoteSheetProps, 'open'>) {
  const styles = useStyles();
  const { state } = useAuth();
  const [note, setNote] = useState(sessionExercise.note);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status !== 'signedIn') return null;
  const { token } = state;

  async function save() {
    setError(null);
    setSaving(true);
    try {
      onSaved(await setExerciseNote(token, sessionId, sessionExercise.id, note.trim()));
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <>
      <TextField
        label="Exercise note"
        placeholder="Optional"
        value={note}
        // Kept to the limit in characters, as the API counts, so an emoji is
        // one; maxLength would count UTF-16 units and allow half as many.
        onChangeText={(text) => setNote([...text].slice(0, MAX_EXERCISE_NOTE_CHARS).join(''))}
        multiline
        autoFocus
      />
      <Text style={styles.count}>{`${[...note].length} / ${MAX_EXERCISE_NOTE_CHARS}`}</Text>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Save" onPress={save} loading={saving} />
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  count: { alignSelf: 'flex-end', fontSize: 13, color: colors.muted },
  error: { color: colors.danger, fontSize: 15 },
}));
