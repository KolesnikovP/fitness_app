import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import type { SlotDraft } from '@/entities/routine';
import type { ExerciseRef } from '@/shared/model';

/** An exercise picked on the Add exercises screen. */
type PickedExercise = { id: string; name: string };

/** Substitutes picked on the Add substitutes screen, for the slot with slotKey. */
export type PickedSubstitutes = { slotKey: string; exercises: ExerciseRef[] };

/**
 * Links a routine editor screen, at returnTo, to the screens that pick from
 * the library: open() shows Add exercises, which comes back here with what
 * was picked as added; openSubstitutes(slot) shows Add substitutes, which
 * comes back with addedSubstitutes. Call consumed() or substitutesConsumed()
 * once they're in the draft, so they aren't added again.
 */
export function useAddedExercises(returnTo: string) {
  const { picked, substitutesFor, pickedSubstitutes } = useLocalSearchParams<{
    picked?: string;
    substitutesFor?: string;
    pickedSubstitutes?: string;
  }>();
  const added = useMemo(() => (picked ? (JSON.parse(picked) as PickedExercise[]) : null), [picked]);
  const addedSubstitutes = useMemo(
    (): PickedSubstitutes | null =>
      substitutesFor && pickedSubstitutes
        ? { slotKey: substitutesFor, exercises: JSON.parse(pickedSubstitutes) as ExerciseRef[] }
        : null,
    [substitutesFor, pickedSubstitutes],
  );
  return {
    added,
    consumed: () => router.setParams({ picked: '' }),
    open: () => router.push({ pathname: '/workout/routines/add-exercises', params: { returnTo } }),
    addedSubstitutes,
    substitutesConsumed: () => router.setParams({ substitutesFor: '', pickedSubstitutes: '' }),
    openSubstitutes: (slot: SlotDraft) =>
      router.push({
        pathname: '/workout/routines/add-substitutes',
        params: {
          returnTo,
          slotKey: slot.key,
          exerciseId: slot.exerciseId,
          taken: JSON.stringify(slot.substitutes.map((sub) => sub.exerciseId)),
        },
      }),
  };
}
