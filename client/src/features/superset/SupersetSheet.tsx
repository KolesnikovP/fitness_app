import { useState } from 'react';
import { Text } from 'react-native';

import { useAuth } from '@/entities/auth';
import { createSuperset, type Session, type SessionExercise } from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { Button, makeStyles, Sheet } from '@/shared/ui';

import { ExerciseCheckList, toggled } from './ExerciseCheckList';

type SupersetSheetProps = {
  sessionId: string;
  /** The exercise to group. */
  sessionExercise: SessionExercise;
  /** The Session's other exercises not in a Superset, in order. */
  others: SessionExercise[];
  onGrouped: (session: Session) => void;
  open: boolean;
  onClose: () => void;
};

/** A sheet that groups a Session exercise into a Superset with one or more of the others picked. */
export function SupersetSheet({ sessionId, sessionExercise, others, onGrouped, open, onClose }: SupersetSheetProps) {
  const name = sessionExercise.name;
  return (
    <Sheet open={open} onClose={onClose} accessibilityLabel={`Superset with ${name}`} title="Superset" closeButton>
      {/* Mounted only while open, so nothing is picked each time it opens. */}
      {open ? (
        <OthersPicker
          sessionId={sessionId}
          sessionExercise={sessionExercise}
          others={others}
          onGrouped={(session) => {
            onGrouped(session);
            onClose();
          }}
        />
      ) : null}
    </Sheet>
  );
}

/** Picks the others to group with, and groups them. */
function OthersPicker({ sessionId, sessionExercise, others, onGrouped }: Omit<SupersetSheetProps, 'open' | 'onClose'>) {
  const styles = useStyles();
  const { state } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status !== 'signedIn') return null;
  const { token } = state;

  async function group() {
    setError(null);
    setSaving(true);
    try {
      // The others in list order, whatever order they were picked in.
      const picked = others.map((e) => e.id).filter((id) => selected.includes(id));
      onGrouped(await createSuperset(token, sessionId, [sessionExercise.id, ...picked]));
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <>
      <Text style={styles.muted}>
        Pick exercises to do back to back with {sessionExercise.name}, resting after the last.
      </Text>
      <ExerciseCheckList
        exercises={others}
        selected={selected}
        onToggle={(id) => setSelected((current) => toggled(current, id))}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Group as superset" onPress={group} loading={saving} disabled={selected.length === 0} />
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  muted: { fontSize: 15, color: colors.muted },
  error: { color: colors.danger, fontSize: 15 },
}));
