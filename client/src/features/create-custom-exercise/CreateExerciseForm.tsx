import { useState } from 'react';
import { Text } from 'react-native';

import { useAuth } from '@/entities/auth';
import {
  createExercise,
  EQUIPMENT_TYPES,
  MUSCLE_GROUPS,
  type EquipmentType,
  type Exercise,
  type MuscleGroup,
} from '@/entities/exercise';
import { errorMessage } from '@/shared/api';
import { Button, ChipGroup, makeStyles, MultiChipGroup, TextField } from '@/shared/ui';

/** The steps typed one per line, trimmed, leaving out blank lines. */
function stepsFrom(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/**
 * Creates a custom exercise. Name, muscle group and equipment type are
 * required; Secondary muscles and Instructions (one step per line) are not.
 */
export function CreateExerciseForm({ onCreated }: { onCreated: (exercise: Exercise) => void }) {
  const styles = useStyles();
  const { state } = useAuth();
  const [name, setName] = useState('');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup | null>(null);
  const [secondaryMuscles, setSecondaryMuscles] = useState<MuscleGroup[]>([]);
  const [equipmentType, setEquipment] = useState<EquipmentType | null>(null);
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const complete = name.trim() !== '' && muscleGroup !== null && equipmentType !== null;

  async function save() {
    if (state.status !== 'signedIn' || !complete) return;
    setError(null);
    setSaving(true);
    try {
      onCreated(
        await createExercise(state.token, {
          name: name.trim(),
          muscleGroup,
          // A muscle chosen as secondary and then as primary is only primary.
          secondaryMuscles: secondaryMuscles.filter((m) => m !== muscleGroup),
          equipmentType,
          instructions: stepsFrom(instructions),
        }),
      );
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <>
      <TextField label="Name" value={name} onChangeText={setName} maxLength={100} returnKeyType="done" />
      <ChipGroup label="Muscle group" options={MUSCLE_GROUPS} value={muscleGroup} onChange={setMuscleGroup} />
      <MultiChipGroup
        label="Secondary muscles (optional)"
        options={MUSCLE_GROUPS.filter((g) => g.value !== muscleGroup)}
        value={secondaryMuscles}
        onChange={setSecondaryMuscles}
      />
      <ChipGroup label="Equipment" options={EQUIPMENT_TYPES} value={equipmentType} onChange={setEquipment} />
      <TextField
        label="Instructions (optional)"
        placeholder="One step per line"
        value={instructions}
        onChangeText={setInstructions}
        multiline
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Save exercise" onPress={save} loading={saving} disabled={!complete} />
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  error: { color: colors.danger, fontSize: 15 },
}));
