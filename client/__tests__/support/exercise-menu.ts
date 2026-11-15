import { fireEvent, screen, within } from 'expo-router/testing-library';

import { showExercise } from './session-exercises';

/** Opens the Swap sheet for a Session exercise: shows it, then its card's ⋯ menu, then Replace exercise. */
export async function openSwapSheet(name: string) {
  await showExercise(name);
  await fireEvent.press(screen.getByRole('button', { name: `${name} options` }));
  await fireEvent.press(
    within(await screen.findByLabelText(`${name} options sheet`)).getByRole('button', { name: 'Replace exercise' }),
  );
}

/** Shows a Session exercise and chooses Remove exercise in its card's ⋯ menu. */
export async function removeExercise(name: string) {
  await showExercise(name);
  await fireEvent.press(screen.getByRole('button', { name: `${name} options` }));
  await fireEvent.press(
    within(await screen.findByLabelText(`${name} options sheet`)).getByRole('button', { name: 'Remove exercise' }),
  );
}
