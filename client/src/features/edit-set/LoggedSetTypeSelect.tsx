import { useState } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '@/entities/auth';
import { editSet, SetTypeSelect, type Session, type SessionSet } from '@/entities/workout';
import { errorMessage } from '@/shared/api';

type LoggedSetTypeSelectProps = {
  sessionId: string;
  set: SessionSet;
  /** The Set's place in its exercise, from 1. */
  number: number;
  /** What marks it in the number column (see setMarks). */
  mark: string;
  onSaved: (session: Session) => void;
};

/** A logged Set's mark, tapped to change its Set type, keeping its values. */
export function LoggedSetTypeSelect({ sessionId, set, number, mark, onSaved }: LoggedSetTypeSelectProps) {
  const { state } = useAuth();
  const [saving, setSaving] = useState(false);
  if (state.status !== 'signedIn') return null;
  const { token } = state;

  async function change(type: SessionSet['type']) {
    setSaving(true);
    try {
      const { weight, weightUnit, reps, rpe, note } = set;
      onSaved(await editSet(token, sessionId, set.id, { weight, weightUnit, reps, rpe, note, type }));
    } catch (e) {
      Alert.alert("Couldn't change the set type", errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SetTypeSelect label={`Set ${number} type`} mark={mark} value={set.type} onChange={change} disabled={saving} />
  );
}
