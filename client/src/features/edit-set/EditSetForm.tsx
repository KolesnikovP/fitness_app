import { useState } from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { editSet, parseSetDraft, setDraftOf, SetFields, type Session, type SessionSet } from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { Button, makeStyles, spacing } from '@/shared/ui';

type EditSetFormProps = {
  sessionId: string;
  set: SessionSet;
  /** The Set's place in its exercise, from 1. */
  number: number;
  onSaved: (session: Session) => void;
  onDelete: () => void;
  onCancel: () => void;
};

/** Corrects a logged Set, in the unit it was logged in, or deletes it. */
export function EditSetForm({ sessionId, set, number, onSaved, onDelete, onCancel }: EditSetFormProps) {
  const styles = useStyles();
  const { state } = useAuth();
  const [draft, setDraft] = useState(() => setDraftOf(set));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (state.status !== 'signedIn') return null;
  const { token } = state;
  const corrected = parseSetDraft(draft, set.weightUnit);

  async function save() {
    if (!corrected) return;
    setError(null);
    setSaving(true);
    try {
      onSaved(await editSet(token, sessionId, set.id, corrected));
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <View accessibilityLabel={`Editing set ${number}`} style={styles.container}>
      <Text style={styles.title}>Set {number}</Text>
      <SetFields value={draft} onChange={setDraft} weightUnit={set.weightUnit} />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button label="Cancel" variant="secondary" onPress={onCancel} />
        </View>
        <View style={styles.flex}>
          <Button label="Save" onPress={save} loading={saving} disabled={!corrected} />
        </View>
      </View>
      <Button label="Delete set" variant="link" tone="danger" onPress={onDelete} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
  },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  error: { color: colors.danger, fontSize: 15 },
}));
