import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

/** An exercise picked on the Add exercises screen. */
type PickedExercise = { id: string; name: string };

/**
 * Links a routine editor screen, at returnTo, to the Add exercises screen:
 * open() shows the picker, which comes back here with what was picked as
 * added. Call consumed() once they're in the draft, so they aren't added again.
 */
export function useAddedExercises(returnTo: string) {
  const { picked } = useLocalSearchParams<{ picked?: string }>();
  const added = useMemo(() => (picked ? (JSON.parse(picked) as PickedExercise[]) : null), [picked]);
  return {
    added,
    consumed: () => router.setParams({ picked: '' }),
    open: () => router.push({ pathname: '/workout/routines/add-exercises', params: { returnTo } }),
  };
}
