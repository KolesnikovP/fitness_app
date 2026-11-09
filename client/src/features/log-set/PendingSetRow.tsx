import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import {
  logSet,
  parseSetDraft,
  repsInput,
  RPE_SCALE,
  setColumns,
  SetTypeSelect,
  weightInput,
  type Session,
  type SetDraft,
} from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import type { UnitPreference } from '@/shared/model';
import { makeStyles, Select, spacing, TextField } from '@/shared/ui';

const RPE_OPTIONS = RPE_SCALE.map(({ rpe, meaning }) => ({ value: rpe, label: String(rpe), description: meaning }));

type PendingSetRowProps = {
  sessionId: string;
  sessionExerciseId: string;
  /** The Set's place in its exercise, from 1. */
  number: number;
  /** What marks it in the number column (see setMarks). */
  mark: string;
  draft: SetDraft;
  onChange: (draft: SetDraft) => void;
  weightUnit: UnitPreference;
  onLogged: (session: Session) => void;
};

/**
 * A row of the set table for a Set still to do: its mark, tapped to pick its
 * Set type, then weight, reps and RPE in their columns, and an unchecked box
 * that logs it when ticked.
 */
export function PendingSetRow({
  sessionId,
  sessionExerciseId,
  number,
  mark,
  draft,
  onChange,
  weightUnit,
  onLogged,
}: PendingSetRowProps) {
  const styles = useStyles();
  const { state } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (state.status !== 'signedIn') return null;
  const { token } = state;
  const set = parseSetDraft(draft, weightUnit);
  const change = (patch: Partial<SetDraft>) => onChange({ ...draft, ...patch });

  async function save() {
    if (!set) return;
    setError(null);
    setSaving(true);
    try {
      onLogged(await logSet(token, sessionId, sessionExerciseId, set));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View>
      <View style={setColumns.row}>
        <View style={setColumns.number}>
          <SetTypeSelect
            label={`Set ${number} type`}
            mark={mark}
            value={draft.type}
            onChange={(type) => change({ type })}
          />
        </View>
        <View style={setColumns.weight}>
          <TextField
            dense
            label={`Set ${number} weight (${weightUnit})`}
            value={draft.weight}
            onChangeText={(text) => change({ weight: weightInput(text) })}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={setColumns.reps}>
          <TextField
            dense
            label={`Set ${number} reps`}
            value={draft.reps}
            onChangeText={(text) => change({ reps: repsInput(text) })}
            keyboardType="number-pad"
          />
        </View>
        <View style={setColumns.rpe}>
          <Select
            dense
            label={`Set ${number} RPE`}
            placeholder="–"
            options={RPE_OPTIONS}
            value={draft.rpe}
            onChange={(rpe) => change({ rpe })}
            clearLabel="No RPE"
          />
        </View>
        <View style={setColumns.done}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Log set ${number}`}
            accessibilityState={{ disabled: !set || saving, busy: saving }}
            disabled={!set || saving}
            onPress={save}
            style={({ pressed }) => [styles.box, (!set || saving) && styles.dimmed, pressed && styles.pressed]}
          />
        </View>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  // An unchecked box; a logged Set's row shows it ticked.
  box: { width: 30, height: 30, borderRadius: 8, borderWidth: 2, borderColor: colors.primary },
  dimmed: { borderColor: colors.border },
  pressed: { backgroundColor: colors.primarySubtle },
  error: { color: colors.danger, fontSize: 15, marginTop: spacing.xs },
}));
