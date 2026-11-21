import { fireEvent, screen, within } from 'expo-router/testing-library';

/** The controls above the shown Session exercise of the workout in progress. */
export function sessionHeader() {
  return within(screen.getByLabelText('Workout controls'));
}

/** Opens the header's ☰ menu and chooses Discard workout, which then asks to confirm. */
export async function chooseDiscardWorkout() {
  await fireEvent.press(sessionHeader().getByRole('button', { name: 'Workout menu' }));
  await fireEvent.press(
    within(await screen.findByLabelText('Workout menu sheet')).getByRole('button', { name: 'Discard workout' }),
  );
}

/** Opens the header's Rest timer and returns its sheet: the rests offered, or the countdown with +15s and Skip rest. */
export async function openRestTimer() {
  await fireEvent.press(sessionHeader().getByRole('button', { name: 'Rest timer' }));
  return within(await screen.findByLabelText('Rest timer sheet'));
}

/** Starts the rest labelled label, such as "Rest 1:30", from the header's Rest timer, which closes its sheet. */
export async function startRest(label: string) {
  await fireEvent.press((await openRestTimer()).getByRole('button', { name: label }));
}
