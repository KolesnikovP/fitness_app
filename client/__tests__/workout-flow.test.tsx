import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { fakeApi } from './support/fake-api';
import { findHeaderTitle } from './support/native-header';
import { secureStore } from './support/secure-store';
import { loggedSets } from './support/set-table';

/** Launches the app signed in as an onboarded kg user, on the Workout tab. */
async function openWorkoutTab() {
  const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
  secureStore.set('auth-token', fakeApi.issueToken(account.id));
  await renderRouter('./src/app', { initialUrl: '/' });
  await screen.findByRole('header', { name: 'Workout' });
  return account;
}

/** Launches the app signed in as accountId and opens their workout in progress. */
async function resumeWorkout(accountId: string) {
  secureStore.set('auth-token', fakeApi.issueToken(accountId));
  await renderRouter('./src/app', { initialUrl: '/' });
  await screen.findByRole('header', { name: 'Workout' });
  await fireEvent.press(await screen.findByRole('button', { name: 'Resume workout' }));
  await findHeaderTitle('Current workout');
}

/** The card for one exercise in the workout in progress. */
function exerciseCard(name: string) {
  return within(screen.getByLabelText(`${name} card`));
}

describe('freeform workout', () => {
  it('starts an empty workout, logs a set and shows it in the history once finished', async () => {
    const account = await openWorkoutTab();

    await fireEvent.press(screen.getByRole('button', { name: 'Start Workout' }));
    await findHeaderTitle('Current workout');
    // An empty workout can't be saved yet.
    expect(screen.getByRole('button', { name: 'Finish workout' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('button', { name: 'Add exercise' }));
    await findHeaderTitle('Add exercise');
    // Jest mounts every tab, so the Exercises tab's search is also on screen.
    const picker = within(screen.getByLabelText('Exercise picker'));
    await fireEvent.changeText(picker.getByLabelText('Search exercises'), 'bench');
    await fireEvent.press(await picker.findByRole('button', { name: 'Dumbbell Bench Press' }));

    await findHeaderTitle('Current workout');
    const card = exerciseCard('Dumbbell Bench Press');
    // A table of sets, a column each for weight, reps and RPE; with nothing
    // planned, one row is ready for the first set.
    expect(card.getByText('KG')).toBeVisible();
    expect(card.getByText('REPS')).toBeVisible();
    expect(card.getByText('RPE')).toBeVisible();
    expect(card.queryByLabelText('Set 2 reps')).toBeNull();
    await fireEvent.changeText(card.getByLabelText('Set 1 weight (kg)'), '32,5');
    await fireEvent.changeText(card.getByLabelText('Set 1 reps'), '10');
    // Notes stay out of the way until asked for.
    expect(card.queryByLabelText('Exercise note')).toBeNull();
    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));

    await waitFor(() => expect(loggedSets(card)).toEqual(['32.5 kg × 10']));
    // Done with one exercise, the sets need no label.
    expect(within(card.getByLabelText('Sets')).queryAllByRole('header')).toEqual([]);
    // A row is ready for the next set, at the same weight.
    expect(card.getByLabelText('Set 2 weight (kg)')).toHaveDisplayValue('32.5');
    expect(card.getByLabelText('Set 2 reps')).toHaveDisplayValue('');

    // A set's note is added by tapping it.
    await fireEvent.press(card.getByRole('button', { name: 'Edit set 1' }));
    const editing = within(card.getByLabelText('Editing set 1'));
    await fireEvent.press(editing.getByRole('button', { name: 'Add set note' }));
    await fireEvent.changeText(editing.getByLabelText('Set note'), 'Slow negatives');
    await fireEvent.press(editing.getByRole('button', { name: 'Save' }));
    expect(await card.findByText('Slow negatives')).toBeVisible();

    await fireEvent.press(card.getByRole('button', { name: 'Add exercise note' }));
    await fireEvent.changeText(card.getByLabelText('Exercise note'), 'Bench 3 was free');
    await fireEvent.press(card.getByRole('button', { name: 'Save note' }));
    expect(await card.findByText('Note saved.')).toBeVisible();

    await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));

    // A freeform workout can be saved as a routine; not this time.
    await findHeaderTitle('Workout finished');
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    await screen.findByRole('header', { name: 'Workout' });
    expect(screen.getByRole('button', { name: 'Start Workout' })).toBeVisible();
    await act(async () => router.navigate('/profile'));
    const history = within(await screen.findByLabelText('Workouts'));
    expect(await history.findByText('Dumbbell Bench Press')).toBeVisible();
    expect(history.getByText(/< 1 min/)).toBeVisible();

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
    await screen.findByRole('header', { name: 'Workout' });

    await fireEvent.press(await screen.findByRole('button', { name: 'Resume workout' }));

    await findHeaderTitle('Current workout');
    expect(loggedSets(exerciseCard('Deadlift'))).toEqual(['140 kg × 3']);
    // A note already written is shown open.
    expect(exerciseCard('Deadlift').getByLabelText('Exercise note')).toHaveDisplayValue('Mixed grip');
    expect(screen.getByRole('button', { name: 'Finish workout' })).toBeEnabled();
  });

  it('tells the user the moment a set beats their record, and marks it in the table', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const earlier = fakeApi.addSession(account.id, new Date(Date.now() - 86_400_000));
    fakeApi.addSet(fakeApi.addSessionExercise(earlier, 'Bench Press'), 100, 'kg', 5);
    fakeApi.finishSession(earlier, new Date(Date.now() - 86_400_000 + 3_600_000));
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    await resumeWorkout(account.id);
    const card = exerciseCard('Bench Press');

    // Short of the record: nothing to tell.
    await fireEvent.changeText(card.getByLabelText('Set 1 weight (kg)'), '95');
    await fireEvent.changeText(card.getByLabelText('Set 1 reps'), '5');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
    await waitFor(() => expect(loggedSets(card)).toEqual(['95 kg × 5, Bronze']));
    expect(screen.queryByLabelText('New personal record')).toBeNull();

    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    await fireEvent.changeText(card.getByLabelText('Set 2 weight (kg)'), '105');
    await fireEvent.changeText(card.getByLabelText('Set 2 reps'), '5');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 2' }));

    const banner = within(await screen.findByLabelText('New personal record'));
    expect(banner.getByText('Bench Press: Estimated 1RM 122.5 kg, from 105 kg × 5')).toBeVisible();
    expect(banner.getByText('Bench Press: 105 kg × 5, best at 5 reps')).toBeVisible();
    expect(loggedSets(card)).toEqual(['95 kg × 5, Bronze', '105 kg × 5, Personal record']);

    await fireEvent.press(banner.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByLabelText('New personal record')).toBeNull();
  });

  it('marks each logged set with how close it came to the best before this workout', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const earlier = fakeApi.addSession(account.id, new Date(Date.now() - 86_400_000));
    fakeApi.addSet(fakeApi.addSessionExercise(earlier, 'Bench Press'), 100, 'kg', 5);
    fakeApi.finishSession(earlier, new Date(Date.now() - 86_400_000 + 3_600_000));
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    await resumeWorkout(account.id);
    const card = exerciseCard('Bench Press');

    const sets: [string, string][] = [
      ['105', '5'],
      ['100', '5'],
      ['100', '4'],
      ['95', '5'],
      ['100', '3'],
    ];
    for (const [i, [weight, reps]] of sets.entries()) {
      const n = i + 1;
      if (i > 0) await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
      await fireEvent.changeText(card.getByLabelText(`Set ${n} weight (kg)`), weight);
      await fireEvent.changeText(card.getByLabelText(`Set ${n} reps`), reps);
      await fireEvent.press(card.getByRole('button', { name: `Log set ${n}` }));
      await waitFor(() => expect(loggedSets(card)).toHaveLength(n));
    }

    expect(loggedSets(card)).toEqual([
      '105 kg × 5, Personal record',
      '100 kg × 5, Silver', // A tie with the best.
      '100 kg × 4, Bronze',
      '95 kg × 5, Bronze',
      '100 kg × 3',
    ]);
    const row = (n: number) => within(card.getByRole('button', { name: `Edit set ${n}` }));
    expect(row(1).getByText('🏆')).toBeVisible();
    expect(row(2).getByText('🥈')).toBeVisible();
    expect(row(3).getByText('🥉')).toBeVisible();
    expect(row(5).queryByText(/🏆|🥈|🥉/)).toBeNull();
  });

  it('accepts only numbers for weight and reps', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    await resumeWorkout(account.id);
    const card = exerciseCard('Back Squat');

    await fireEvent.changeText(card.getByLabelText('Set 1 weight (kg)'), '1a4o0,5.2kg');
    await fireEvent.changeText(card.getByLabelText('Set 1 reps'), '1x0.5');

    // Letters are dropped, and so are a second decimal point and a third decimal.
    expect(card.getByLabelText('Set 1 weight (kg)')).toHaveDisplayValue('140,52');
    expect(card.getByLabelText('Set 1 reps')).toHaveDisplayValue('105');
    await fireEvent.changeText(card.getByLabelText('Set 1 weight (kg)'), '12345');
    expect(card.getByLabelText('Set 1 weight (kg)')).toHaveDisplayValue('1234');
  });

  it('logs a set with an optional RPE, picked from a scale that says what each value means', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    await resumeWorkout(account.id);
    const card = exerciseCard('Back Squat');

    await fireEvent.changeText(card.getByLabelText('Set 1 weight (kg)'), '140');
    await fireEvent.changeText(card.getByLabelText('Set 1 reps'), '5');
    await fireEvent.press(card.getByRole('button', { name: 'Set 1 RPE' }));

    const scale = within(screen.getByLabelText('Set 1 RPE options'));
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
    expect(screen.queryByLabelText('Set 1 RPE options')).toBeNull();
    expect(within(card.getByRole('button', { name: 'Set 1 RPE' })).getByText('6')).toBeVisible();
    expect(card.queryByText(/more reps/)).toBeNull();
    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));

    await waitFor(() => expect(loggedSets(card)).toEqual(['140 kg × 5 @ RPE 6']));
    // The next set's RPE starts blank; left unset, the set has none.
    expect(within(card.getByRole('button', { name: 'Set 2 RPE' })).getByText('–')).toBeVisible();
    await fireEvent.changeText(card.getByLabelText('Set 2 reps'), '4');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 2' }));
    await waitFor(() => expect(loggedSets(card)).toEqual(['140 kg × 5 @ RPE 6', '140 kg × 4']));

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

    await fireEvent.press(card.getByRole('button', { name: 'Set 1 RPE' }));
    await fireEvent.press(within(screen.getByLabelText('Set 1 RPE options')).getByRole('radio', { name: '9' }));
    expect(within(card.getByRole('button', { name: 'Set 1 RPE' })).getByText('9')).toBeVisible();

    await fireEvent.press(card.getByRole('button', { name: 'Set 1 RPE' }));
    await fireEvent.press(within(screen.getByLabelText('Set 1 RPE options')).getByRole('button', { name: 'No RPE' }));

    expect(within(card.getByRole('button', { name: 'Set 1 RPE' })).getByText('–')).toBeVisible();
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
    await fireEvent.changeText(bench.getByLabelText('Set 1 weight (kg)'), '80');
    await fireEvent.changeText(bench.getByLabelText('Set 1 reps'), '8');
    await fireEvent.press(bench.getByRole('button', { name: 'Log set 1' }));
    // No rest between the exercises of a superset...
    expect(await superset.findByText('Next: Lat Pulldown, no rest')).toBeVisible();

    const pulldown = within(superset.getByLabelText('Lat Pulldown card'));
    await fireEvent.changeText(pulldown.getByLabelText('Set 1 weight (kg)'), '60');
    await fireEvent.changeText(pulldown.getByLabelText('Set 1 reps'), '10');
    await fireEvent.press(pulldown.getByRole('button', { name: 'Log set 1' }));
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

  it('corrects a logged set', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSet(fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat'), 140, 'kg', 5);
    await resumeWorkout(account.id);
    const card = exerciseCard('Back Squat');

    await fireEvent.press(card.getByRole('button', { name: 'Edit set 1' }));
    const editing = within(card.getByLabelText('Editing set 1'));
    expect(editing.getByLabelText('Weight (kg)')).toHaveDisplayValue('140');
    await fireEvent.changeText(editing.getByLabelText('Reps'), '6');
    await fireEvent.press(editing.getByRole('button', { name: 'RPE' }));
    await fireEvent.press(within(screen.getByLabelText('RPE options')).getByRole('radio', { name: '8' }));
    await fireEvent.press(editing.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(loggedSets(card)).toEqual(['140 kg × 6 @ RPE 8']));
    expect(card.queryByLabelText('Editing set 1')).toBeNull();

    // Cancelling leaves the set as it was.
    await fireEvent.press(card.getByRole('button', { name: 'Edit set 1' }));
    await fireEvent.changeText(within(card.getByLabelText('Editing set 1')).getByLabelText('Reps'), '9');
    await fireEvent.press(within(card.getByLabelText('Editing set 1')).getByRole('button', { name: 'Cancel' }));
    expect(loggedSets(card)).toEqual(['140 kg × 6 @ RPE 8']);

    expect(fakeApi.sessions(account.id)[0].exercises[0].sets).toMatchObject([{ weight: 140, reps: 6, rpe: 8 }]);
  });

  it('deletes a set, with a moment to undo it', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
      const squat = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
      fakeApi.addSet(squat, 140, 'kg', 5);
      fakeApi.addSet(squat, 140, 'kg', 3);
      await resumeWorkout(account.id);
      const card = exerciseCard('Back Squat');

      await fireEvent.press(card.getByRole('button', { name: 'Edit set 1' }));
      await fireEvent.press(card.getByRole('button', { name: 'Delete set' }));

      // The sets left are renumbered.
      expect(loggedSets(card)).toEqual(['140 kg × 3']);
      expect(screen.getByText('Set deleted.')).toBeVisible();

      await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
      expect(loggedSets(card)).toEqual(['140 kg × 5', '140 kg × 3']);
      expect(screen.queryByText('Set deleted.')).toBeNull();

      await fireEvent.press(card.getByRole('button', { name: 'Edit set 1' }));
      await fireEvent.press(card.getByRole('button', { name: 'Delete set' }));
      // Nothing is deleted until the moment to undo has passed.
      expect(squat.sets).toHaveLength(2);
      await act(async () => jest.advanceTimersByTime(5_000));

      await waitFor(() => expect(squat.sets).toHaveLength(1));
      expect(squat.sets[0]).toMatchObject({ reps: 3 });
      expect(screen.queryByText('Set deleted.')).toBeNull();
      expect(loggedSets(card)).toEqual(['140 kg × 3']);
    } finally {
      jest.useRealTimers();
    }
  });

  it('deletes a pending set before finishing the workout', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const squat = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    fakeApi.addSet(squat, 140, 'kg', 5);
    fakeApi.addSet(squat, 140, 'kg', 3);
    await resumeWorkout(account.id);
    const card = exerciseCard('Back Squat');

    await fireEvent.press(card.getByRole('button', { name: 'Edit set 2' }));
    await fireEvent.press(card.getByRole('button', { name: 'Delete set' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));

    await findHeaderTitle('Workout finished');
    const [saved] = fakeApi.sessions(account.id);
    expect(saved.finishedAt).not.toBeNull();
    expect(saved.exercises[0].sets).toMatchObject([{ reps: 5 }]);
  });

  it("can't finish a workout once its only set is deleted", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSet(fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat'), 140, 'kg', 5);
    await resumeWorkout(account.id);

    await fireEvent.press(exerciseCard('Back Squat').getByRole('button', { name: 'Edit set 1' }));
    await fireEvent.press(exerciseCard('Back Squat').getByRole('button', { name: 'Delete set' }));

    expect(screen.getByRole('button', { name: 'Finish workout' })).toBeDisabled();
  });

  it('counts down a rest timer between sets', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      await openWorkoutTab();
      await fireEvent.press(screen.getByRole('button', { name: 'Start Workout' }));
      await findHeaderTitle('Current workout');

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
    await findHeaderTitle('Current workout');
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
