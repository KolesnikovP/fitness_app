import { useState } from 'react';

import { useAuth } from '@/entities/auth';
import { createSuperset, type Session, type SessionExercise } from '@/entities/workout';
import { errorMessage } from '@/shared/api';

import { SupersetPicker } from './SupersetPicker';

type CreateSupersetFormProps = {
  sessionId: string;
  /** The exercises not yet in a Superset. */
  exercises: SessionExercise[];
  onCreated: (session: Session) => void;
  onCancel: () => void;
};

/** Picks two or more exercises of the workout in progress and groups them into a Superset. */
export function CreateSupersetForm({ sessionId, exercises, onCreated, onCancel }: CreateSupersetFormProps) {
  const { state } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (state.status !== 'signedIn') return null;
  const { token } = state;

  async function save(ids: string[]) {
    setError(null);
    setSaving(true);
    try {
      onCreated(await createSuperset(token, sessionId, ids));
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return <SupersetPicker exercises={exercises} onGroup={save} onCancel={onCancel} saving={saving} error={error} />;
}
