import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

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
import { Button, ChipGroup, colors, TextField } from '@/shared/ui';

/** Creates a custom exercise; name, muscle group and equipment type are required. */
export function CreateExerciseForm({ onCreated }: { onCreated: (exercise: Exercise) => void }) {
  const { state } = useAuth();
  const [name, setName] = useState('');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup | null>(null);
  const [equipmentType, setEquipment] = useState<EquipmentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const complete = name.trim() !== '' && muscleGroup !== null && equipmentType !== null;

  async function save() {
    if (state.status !== 'signedIn' || !complete) return;
    setError(null);
    setSaving(true);
    try {
      onCreated(await createExercise(state.token, { name: name.trim(), muscleGroup, equipmentType }));
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <>
      <TextField label="Name" value={name} onChangeText={setName} maxLength={100} returnKeyType="done" />
      <ChipGroup label="Muscle group" options={MUSCLE_GROUPS} value={muscleGroup} onChange={setMuscleGroup} />
      <ChipGroup label="Equipment" options={EQUIPMENT_TYPES} value={equipmentType} onChange={setEquipment} />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Save exercise" onPress={save} loading={saving} disabled={!complete} />
    </>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 15 },
});
