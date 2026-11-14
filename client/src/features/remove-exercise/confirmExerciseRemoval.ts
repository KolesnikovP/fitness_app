import { Alert } from 'react-native';

import type { SessionExercise } from '@/entities/workout';

/**
 * Whether to go ahead with removing sessionExercise: at once with nothing
 * logged, else once the User confirms its logged Sets go too.
 */
export function confirmExerciseRemoval(sessionExercise: SessionExercise): Promise<boolean> {
  const logged = sessionExercise.sets.length;
  if (logged === 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    Alert.alert(
      `Remove ${sessionExercise.name}?`,
      `Its ${logged} logged ${logged === 1 ? 'set' : 'sets'} will be deleted too.`,
      [
        { text: 'Keep it', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
      ],
    );
  });
}
