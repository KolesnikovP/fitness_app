import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { UnitPreference } from '@/shared/model';
import { Button, Select, spacing, TextField } from '@/shared/ui';

import { repsInput, RPE_SCALE, weightInput, type SetDraft } from './model';

const RPE_OPTIONS = RPE_SCALE.map(({ rpe, meaning }) => ({ value: rpe, label: String(rpe), description: meaning }));

type SetFieldsProps = {
  value: SetDraft;
  onChange: (draft: SetDraft) => void;
  weightUnit: UnitPreference;
};

/**
 * The fields of a Set: weight, reps and RPE on one row, and a note behind a
 * link unless there's one already. Weight and reps take numbers only.
 */
export function SetFields({ value, onChange, weightUnit }: SetFieldsProps) {
  const [noteOpen, setNoteOpen] = useState(value.note !== '');
  const change = (patch: Partial<SetDraft>) => onChange({ ...value, ...patch });

  return (
    <>
      <View style={styles.row}>
        <View style={styles.weight}>
          <TextField
            label={`Weight (${weightUnit})`}
            value={value.weight}
            onChangeText={(text) => change({ weight: weightInput(text) })}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.reps}>
          <TextField
            label="Reps"
            value={value.reps}
            onChangeText={(text) => change({ reps: repsInput(text) })}
            keyboardType="number-pad"
            textAlign="center"
          />
        </View>
        <View style={styles.rpe}>
          <Select
            label="RPE"
            placeholder="–"
            options={RPE_OPTIONS}
            value={value.rpe}
            onChange={(rpe) => change({ rpe })}
            clearLabel="No RPE"
          />
        </View>
      </View>
      {noteOpen ? (
        <TextField
          label="Set note"
          placeholder="Optional"
          value={value.note}
          onChangeText={(note) => change({ note })}
          maxLength={500}
        />
      ) : (
        <Button label="Add set note" variant="link" onPress={() => setNoteOpen(true)} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  // Each number field is sized for the digits it holds (weight up to 9999.99).
  weight: { width: 120 },
  reps: { width: 76 },
  rpe: { width: 64 },
});
