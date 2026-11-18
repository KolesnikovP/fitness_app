import { fireEvent, screen, within } from 'expo-router/testing-library';

import { showExercise } from './session-exercises';

/** Shows a Session exercise and chooses item in its card's ⋯ menu. */
export async function openExerciseMenuItem(name: string, item: 'Replace exercise' | 'Remove exercise') {
  await showExercise(name);
  await fireEvent.press(screen.getByRole('button', { name: `${name} options` }));
  await fireEvent.press(
    within(await screen.findByLabelText(`${name} options sheet`)).getByRole('button', { name: item }),
  );
}

/** Opens the Swap sheet for a Session exercise with Substitutes: Replace exercise in its card's ⋯ menu. */
export async function openSwapSheet(name: string) {
  await openExerciseMenuItem(name, 'Replace exercise');
}

/** Shows a Session exercise and chooses Remove exercise in its card's ⋯ menu. */
export async function removeExercise(name: string) {
  await openExerciseMenuItem(name, 'Remove exercise');
}
