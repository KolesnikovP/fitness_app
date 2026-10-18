import { router } from 'expo-router';

import { CreateExerciseForm } from '@/features/create-custom-exercise';
import { Screen } from '@/shared/ui';

export function NewExerciseScreen() {
  return (
    <Screen title="New exercise">
      {/* Open the new exercise in place of the form, so back returns to the library. */}
      <CreateExerciseForm onCreated={(exercise) => router.replace(`/exercises/${exercise.id}`)} />
    </Screen>
  );
}
