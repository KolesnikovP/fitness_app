import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { useAuth } from '@/entities/auth';
import { getSession, PersonalRecordList, saveSessionAsRoutine, type PersonalRecord } from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { Button, makeStyles, Screen, TextField } from '@/shared/ui';

/**
 * Shown after finishing a Session: the Personal records it set, and for a
 * Freeform session an offer to save it as a Routine to repeat.
 */
export function FinishedSessionScreen() {
  const styles = useStyles();
  const { sessionId, freeform } = useLocalSearchParams<{ sessionId: string; freeform?: string }>();
  const { state } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const token = state.status === 'signedIn' ? state.token : null;

  useEffect(() => {
    if (!token) return;
    let current = true;
    // Records are a bonus here: without them the screen still works.
    getSession(token, sessionId)
      .then((session) => current && setRecords(session.personalRecords ?? []))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [token, sessionId]);

  if (!token) return null;
  const signedInToken = token;

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await saveSessionAsRoutine(signedInToken, sessionId, name);
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <Screen title="Workout finished">
      <PersonalRecordList records={records} />
      {freeform !== 'false' ? (
        <>
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
        </>
      ) : null}
      <Button label="Done" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  error: { color: colors.danger, fontSize: 15 },
  muted: { fontSize: 17, color: colors.muted },
}));
