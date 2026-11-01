import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import type { Exercise } from '@/entities/exercise';
import { ExercisePicker } from '@/features/search-exercises';
import { Button, Screen } from '@/shared/ui';

/**
 * Picks one or more exercises from the library for a Routine being built,
 * then goes back to its editor (returnTo) with them, in the order picked.
 */
export function AddRoutineExercisesScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo: string }>();
  const [selected, setSelected] = useState<Exercise[]>([]);

  function toggle(exercise: Exercise) {
    setSelected((current) =>
      current.some((e) => e.id === exercise.id) ? current.filter((e) => e.id !== exercise.id) : [...current, exercise],
    );
  }

  function add() {
    const picked = JSON.stringify(selected.map(({ id, name }) => ({ id, name })));
    router.dismissTo(`${returnTo}?picked=${encodeURIComponent(picked)}`);
  }

  const count = selected.length;
  const label = count === 0 ? 'Add exercises' : `Add ${count} ${count === 1 ? 'exercise' : 'exercises'}`;

  return (
    <Screen title="Add exercises" footer={<Button label={label} onPress={add} disabled={count === 0} />}>
      <ExercisePicker onPick={toggle} selectedIds={selected.map((e) => e.id)} />
    </Screen>
  );
}
