import { router } from 'expo-router';

import { useAuth } from '@/entities/auth';
import { createRoutine, emptyRoutineDraft } from '@/entities/routine';
import { Screen } from '@/shared/ui';
import { RoutineEditor } from '@/widgets/routine-editor';

import { useAddedExercises } from './useAddedExercises';

/** Builds a new Routine. */
export function NewRoutineScreen() {
  const { state } = useAuth();
  const picker = useAddedExercises('/workout/routines/new');
  if (state.status !== 'signedIn') return null;
  const { token } = state;

  return (
    <Screen title="New routine">
      <RoutineEditor
        initial={emptyRoutineDraft}
        onAddExercises={picker.open}
        added={picker.added}
        onAdded={picker.consumed}
        onSave={async (routine) => {
          await createRoutine(token, routine);
          router.back();
        }}
      />
    </Screen>
  );
}
