import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { fakeApi } from './support/fake-api';
import { secureStore } from './support/secure-store';

/** Launches the app signed in as an onboarded kg user, on the Workout tab. */
async function openWorkoutTab() {
  const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
  secureStore.set('auth-token', fakeApi.issueToken(account.id));
  await renderRouter('./src/app', { initialUrl: '/' });
  await screen.findByRole('header', { name: 'Feed' });
  // The native tab bar isn't rendered in Jest; switch tabs by navigating.
  await act(async () => router.navigate('/workout'));
  await screen.findByRole('header', { name: 'Workout' });
  return account;
}

/** The card for one exercise in the workout in progress. */
function exerciseCard(name: string) {
  return within(screen.getByLabelText(`${name} card`));
}

describe('freeform workout', () => {
  it('starts an empty workout, logs a set and shows it in the history once finished', async () => {
    const account = await openWorkoutTab();
    expect(await screen.findByText('No finished workouts yet.')).toBeVisible();

    await fireEvent.press(screen.getByRole('button', { name: 'Start Workout' }));
    expect(await screen.findByRole('header', { name: 'Current workout' })).toBeVisible();
    // An empty workout can't be saved yet.
    expect(screen.getByRole('button', { name: 'Finish workout' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('button', { name: 'Add exercise' }));
    await screen.findByRole('header', { name: 'Add exercise' });
    // Jest mounts every tab, so the Exercises tab's search is also on screen.
    const picker = within(screen.getByLabelText('Exercise picker'));
    await fireEvent.changeText(picker.getByLabelText('Search exercises'), 'bench');
    await fireEvent.press(await picker.findByRole('button', { name: 'Dumbbell Bench Press' }));

    await screen.findByRole('header', { name: 'Current workout' });
    const card = exerciseCard('Dumbbell Bench Press');
    await fireEvent.changeText(card.getByLabelText('Weight (kg)'), '32,5');
    await fireEvent.changeText(card.getByLabelText('Reps'), '10');
    await fireEvent.changeText(card.getByLabelText('Set note'), 'Slow negatives');
    await fireEvent.press(card.getByRole('button', { name: 'Log set' }));

    expect(await card.findByText('32.5 kg × 10')).toBeVisible();
    expect(card.getByText('Slow negatives')).toBeVisible();
    // The form clears for the next set.
    expect(card.getByLabelText('Reps')).toHaveDisplayValue('');

    await fireEvent.changeText(card.getByLabelText('Exercise note'), 'Bench 3 was free');
    await fireEvent.press(card.getByRole('button', { name: 'Save note' }));
    expect(await card.findByText('Note saved.')).toBeVisible();

    await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));

    await screen.findByRole('header', { name: 'Workout' });
    const history = within(await screen.findByLabelText('Past workouts'));
    expect(await history.findByText('Dumbbell Bench Press')).toBeVisible();
    expect(history.getByText(/< 1 min/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start Workout' })).toBeVisible();

    const [saved] = fakeApi.sessions(account.id);
    expect(saved.finishedAt).not.toBeNull();
    expect(saved.exercises[0]).toMatchObject({
      note: 'Bench 3 was free',
      sets: [{ weight: 32.5, weightUnit: 'kg', reps: 10, note: 'Slow negatives' }],
    });
  });

  it('resumes the workout in progress after the app restarts', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id, new Date(Date.now() - 20 * 60_000));
    fakeApi.addSet(fakeApi.addSessionExercise(session, 'Deadlift'), 140, 'kg', 3);
    secureStore.set('auth-token', fakeApi.issueToken(account.id));
    await renderRouter('./src/app', { initialUrl: '/' });
    await screen.findByRole('header', { name: 'Feed' });
    await act(async () => router.navigate('/workout'));

    await fireEvent.press(await screen.findByRole('button', { name: 'Resume workout' }));

    await screen.findByRole('header', { name: 'Current workout' });
    expect(exerciseCard('Deadlift').getByText('140 kg × 3')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Finish workout' })).toBeEnabled();
  });

  it('counts down a rest timer between sets', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      await openWorkoutTab();
      await fireEvent.press(screen.getByRole('button', { name: 'Start Workout' }));
      await screen.findByRole('header', { name: 'Current workout' });

      await fireEvent.press(screen.getByRole('button', { name: 'Rest 1:30' }));
      expect(screen.getByLabelText('Rest time left')).toHaveTextContent('1:30');

      await act(async () => jest.advanceTimersByTime(30_000));
      expect(screen.getByLabelText('Rest time left')).toHaveTextContent('1:00');

      await act(async () => jest.advanceTimersByTime(60_000));
      expect(screen.getByText('Rest over.')).toBeVisible();

      await fireEvent.press(screen.getByRole('button', { name: 'Rest 2:00' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Skip rest' }));
      expect(screen.queryByLabelText('Rest time left')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('discards a workout after confirming', async () => {
    const account = await openWorkoutTab();
    await fireEvent.press(screen.getByRole('button', { name: 'Start Workout' }));
    await screen.findByRole('header', { name: 'Current workout' });
    // Confirm the dialog by choosing its destructive button.
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Discard workout' }));

    await screen.findByRole('header', { name: 'Workout' });
    expect(await screen.findByRole('button', { name: 'Start Workout' })).toBeVisible();
    expect(fakeApi.sessions(account.id)).toEqual([]);
  });
});
