import { fireEvent, screen, within } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { answerAlertWith } from './alert';

/** The controls above the shown Session exercise of the workout in progress. */
export function sessionHeader() {
  return within(screen.getByLabelText('Workout controls'));
}

/**
 * Presses the header's Finish and returns the choices "End workout?" offers,
 * answering none of them, so the workout carries on.
 */
export async function endWorkoutChoices(): Promise<string[]> {
  const alert = jest.spyOn(Alert, 'alert').mockImplementationOnce(() => undefined);
  await fireEvent.press(sessionHeader().getByRole('button', { name: 'Finish workout' }));
  const [title, , buttons] = alert.mock.calls.at(-1) ?? [];
  expect(title).toBe('End workout?');
  return (buttons ?? []).map((b) => b.text ?? '');
}

/**
 * Presses the header's Finish and answers "End workout?" with Finish workout.
 * Waits for nothing: the caller waits for the screen finishing leads to.
 */
export async function finishWorkout() {
  answerAlertWith('Finish workout');
  await screen.findByLabelText('Workout controls');
  await fireEvent.press(sessionHeader().getByRole('button', { name: 'Finish workout' }));
}

/**
 * Presses the header's Finish, answers "End workout?" with Discard workout,
 * then answers "Discard workout?" with confirm: Discard, or Keep logging.
 */
export async function chooseDiscardWorkout(confirm: 'Discard' | 'Keep logging') {
  answerAlertWith('Discard workout');
  answerAlertWith(confirm);
  await fireEvent.press(sessionHeader().getByRole('button', { name: 'Finish workout' }));
}

/** Opens the header's Rest timer and returns its sheet: the wheels and Start, or the countdown with +15s and Skip rest. */
export async function openRestTimer() {
  await fireEvent.press(sessionHeader().getByRole('button', { name: 'Rest timer' }));
  return within(await screen.findByLabelText('Rest timer sheet'));
}

/**
 * Starts a rest of minutes and seconds (0, 15, 30 or 45) from the header's
 * Rest timer: picks each on its wheel and presses Start rest, which closes the sheet.
 */
export async function startRest(minutes: number, seconds: number) {
  const sheet = await openRestTimer();
  await fireEvent.press(sheet.getByRole('button', { name: `${minutes} minutes` }));
  await fireEvent.press(sheet.getByRole('button', { name: `${seconds} seconds` }));
  await fireEvent.press(sheet.getByRole('button', { name: 'Start rest' }));
}
