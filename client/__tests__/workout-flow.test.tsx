import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
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

/** Launches the app signed in as accountId and opens their workout in progress. */
async function resumeWorkout(accountId: string) {
  secureStore.set('auth-token', fakeApi.issueToken(accountId));
  await renderRouter('./src/app', { initialUrl: '/' });
  await screen.findByRole('header', { name: 'Feed' });
  await act(async () => router.navigate('/workout'));
  await fireEvent.press(await screen.findByRole('button', { name: 'Resume workout' }));
  await screen.findByRole('header', { name: 'Current workout' });
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
    // Notes stay out of the way until asked for.
    expect(card.queryByLabelText('Set note')).toBeNull();
    expect(card.queryByLabelText('Exercise note')).toBeNull();
    await fireEvent.press(card.getByRole('button', { name: 'Add set note' }));
    await fireEvent.changeText(card.getByLabelText('Set note'), 'Slow negatives');
    await fireEvent.press(card.getByRole('button', { name: 'Log set' }));

    expect(await card.findByText('32.5 kg × 10')).toBeVisible();
    expect(card.getByText('Slow negatives')).toBeVisible();
    // The form clears for the next set.
    expect(card.getByLabelText('Reps')).toHaveDisplayValue('');
    expect(card.queryByLabelText('Set note')).toBeNull();

    await fireEvent.press(card.getByRole('button', { name: 'Add exercise note' }));
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
    const deadlift = fakeApi.addSessionExercise(session, 'Deadlift');
    deadlift.note = 'Mixed grip';
    fakeApi.addSet(deadlift, 140, 'kg', 3);
    secureStore.set('auth-token', fakeApi.issueToken(account.id));
    await renderRouter('./src/app', { initialUrl: '/' });
    await screen.findByRole('header', { name: 'Feed' });
    await act(async () => router.navigate('/workout'));

    await fireEvent.press(await screen.findByRole('button', { name: 'Resume workout' }));

    await screen.findByRole('header', { name: 'Current workout' });
    expect(exerciseCard('Deadlift').getByText('140 kg × 3')).toBeVisible();
    // A note already written is shown open.
    expect(exerciseCard('Deadlift').getByLabelText('Exercise note')).toHaveDisplayValue('Mixed grip');
    expect(screen.getByRole('button', { name: 'Finish workout' })).toBeEnabled();
  });

  it('accepts only numbers for weight and reps', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    await resumeWorkout(account.id);
    const card = exerciseCard('Back Squat');

    await fireEvent.changeText(card.getByLabelText('Weight (kg)'), '1a4o0,5.2kg');
    await fireEvent.changeText(card.getByLabelText('Reps'), '1x0.5');

    // Letters are dropped, and so are a second decimal point and a third decimal.
    expect(card.getByLabelText('Weight (kg)')).toHaveDisplayValue('140,52');
    expect(card.getByLabelText('Reps')).toHaveDisplayValue('105');
    await fireEvent.changeText(card.getByLabelText('Weight (kg)'), '12345');
    expect(card.getByLabelText('Weight (kg)')).toHaveDisplayValue('1234');
  });

  it('logs a set with an optional RPE, picked from a scale that says what each value means', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    await resumeWorkout(account.id);
    const card = exerciseCard('Back Squat');

    await fireEvent.changeText(card.getByLabelText('Weight (kg)'), '140');
    await fireEvent.changeText(card.getByLabelText('Reps'), '5');
    await fireEvent.press(card.getByRole('button', { name: 'RPE' }));

    const scale = within(screen.getByLabelText('RPE options'));
    expect(scale.getAllByRole('radio').map((option) => option.props.accessibilityLabel)).toEqual([
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
    ]);
    expect(scale.getByText('Could do 4 more reps')).toBeVisible();
    expect(scale.getByText('Max effort, no reps left')).toBeVisible();
    await fireEvent.press(scale.getByRole('radio', { name: '6' }));

    // The meanings help pick a value; once picked, only the value is shown.
    expect(screen.queryByLabelText('RPE options')).toBeNull();
    expect(within(card.getByRole('button', { name: 'RPE' })).getByText('6')).toBeVisible();
    expect(card.queryByText(/more reps/)).toBeNull();
    await fireEvent.press(card.getByRole('button', { name: 'Log set' }));

    expect(await card.findByText('140 kg × 5 @ RPE 6')).toBeVisible();
    // RPE resets for the next set; left unset, the set has none.
    expect(within(card.getByRole('button', { name: 'RPE' })).getByText('–')).toBeVisible();
    await fireEvent.changeText(card.getByLabelText('Reps'), '4');
    await fireEvent.press(card.getByRole('button', { name: 'Log set' }));
    expect(await card.findByText('140 kg × 4')).toBeVisible();

    const [saved] = fakeApi.sessions(account.id);
    expect(saved.exercises[0].sets).toMatchObject([
      { weight: 140, reps: 5, rpe: 6 },
      { weight: 140, reps: 4, rpe: null },
    ]);
  });

  it('clears an RPE picked by mistake', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    await resumeWorkout(account.id);
    const card = exerciseCard('Back Squat');

    await fireEvent.press(card.getByRole('button', { name: 'RPE' }));
    await fireEvent.press(within(screen.getByLabelText('RPE options')).getByRole('radio', { name: '9' }));
    expect(within(card.getByRole('button', { name: 'RPE' })).getByText('9')).toBeVisible();

    await fireEvent.press(card.getByRole('button', { name: 'RPE' }));
    await fireEvent.press(within(screen.getByLabelText('RPE options')).getByRole('button', { name: 'No RPE' }));

    expect(within(card.getByRole('button', { name: 'RPE' })).getByText('–')).toBeVisible();
  });

  it('groups exercises into a superset, logged back to back with rest after the round', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    fakeApi.addSessionExercise(session, 'Bench Press');
    fakeApi.addSessionExercise(session, 'Plank');
    fakeApi.addSessionExercise(session, 'Lat Pulldown');
    await resumeWorkout(account.id);

    await fireEvent.press(screen.getByRole('button', { name: 'Create superset' }));
    const form = within(screen.getByLabelText('New superset'));
    await fireEvent.press(form.getByRole('checkbox', { name: 'Bench Press' }));
    // One exercise isn't a superset.
    expect(form.getByRole('button', { name: 'Group as superset' })).toBeDisabled();
    await fireEvent.press(form.getByRole('checkbox', { name: 'Lat Pulldown' }));
    await fireEvent.press(form.getByRole('button', { name: 'Group as superset' }));

    const superset = within(await screen.findByLabelText('Superset of Bench Press and Lat Pulldown'));
    // Its exercises are shown back to back, ahead of the one added between them.
    expect(screen.getAllByLabelText(/ card$/).map((card) => card.props.accessibilityLabel)).toEqual([
      'Bench Press card',
      'Lat Pulldown card',
      'Plank card',
    ]);
    expect(superset.getByText('Next: Bench Press')).toBeVisible();

    const bench = within(superset.getByLabelText('Bench Press card'));
    await fireEvent.changeText(bench.getByLabelText('Weight (kg)'), '80');
    await fireEvent.changeText(bench.getByLabelText('Reps'), '8');
    await fireEvent.press(bench.getByRole('button', { name: 'Log set' }));
    // No rest between the exercises of a superset...
    expect(await superset.findByText('Next: Lat Pulldown, no rest')).toBeVisible();

    const pulldown = within(superset.getByLabelText('Lat Pulldown card'));
    await fireEvent.changeText(pulldown.getByLabelText('Weight (kg)'), '60');
    await fireEvent.changeText(pulldown.getByLabelText('Reps'), '10');
    await fireEvent.press(pulldown.getByRole('button', { name: 'Log set' }));
    // ...only after the whole round.
    expect(await superset.findByText('Round 1 done. Rest now.')).toBeVisible();

    const [saved] = fakeApi.sessions(account.id);
    const [benchPress, plank, latPulldown] = saved.exercises;
    expect(benchPress.supersetId).not.toBeNull();
    expect(latPulldown.supersetId).toBe(benchPress.supersetId);
    expect(plank.supersetId).toBeNull();
    expect(benchPress.sets).toMatchObject([{ weight: 80, reps: 8, supersetId: benchPress.supersetId }]);
    expect(latPulldown.sets).toMatchObject([{ weight: 60, reps: 10, supersetId: benchPress.supersetId }]);

    await fireEvent.press(superset.getByRole('button', { name: 'Ungroup' }));
    await waitFor(() => expect(screen.queryByLabelText(/^Superset of/)).toBeNull());
    expect(fakeApi.sessions(account.id)[0].exercises.every((e) => e.supersetId === null)).toBe(true);
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
