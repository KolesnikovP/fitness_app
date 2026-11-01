import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { useAuth } from '@/entities/auth';
import { getRoutine, routineDraftOf, updateRoutine, type RoutineDraft } from '@/entities/routine';
import { errorMessage } from '@/shared/api';
import { colors, Screen } from '@/shared/ui';
import { RoutineEditor } from '@/widgets/routine-editor';

import { useAddedExercises } from './useAddedExercises';

/** Edits a saved Routine: its name and slots. */
export function EditRoutineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [draft, setDraft] = useState<RoutineDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const picker = useAddedExercises(`/workout/routines/${id}/edit`);

  useEffect(() => {
    if (!token) return;
    let current = true;
    getRoutine(token, id)
      .then((routine) => current && setDraft(routineDraftOf(routine)))
      .catch((e) => current && setError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [token, id]);

  if (!token) return null;

  return (
    <Screen title="Edit routine">
      {draft ? (
        <RoutineEditor
          initial={draft}
          onAddExercises={picker.open}
          added={picker.added}
          onAdded={picker.consumed}
          onAddSubstitutes={picker.openSubstitutes}
          addedSubstitutes={picker.addedSubstitutes}
          onSubstitutesAdded={picker.substitutesConsumed}
          onSave={async (routine) => {
            await updateRoutine(token, id, routine);
            router.back();
          }}
        />
      ) : error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : (
        <ActivityIndicator />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 15 },
});
