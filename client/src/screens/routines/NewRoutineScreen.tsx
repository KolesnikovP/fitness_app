import { router } from 'expo-router';

import { useAuth } from '@/entities/auth';
import { createRoutine, emptyRoutineDraft } from '@/entities/routine';
import { Screen } from '@/shared/ui';
import { RoutineEditor } from '@/widgets/routine-editor';

/** Builds a new Routine. */
export function NewRoutineScreen() {
  const { state } = useAuth();
  if (state.status !== 'signedIn') return null;
  const { token } = state;

  return (
    <Screen title="New routine">
      <RoutineEditor
        initial={emptyRoutineDraft}
        onSave={async (routine) => {
          await createRoutine(token, routine);
          router.back();
        }}
      />
    </Screen>
  );
}
