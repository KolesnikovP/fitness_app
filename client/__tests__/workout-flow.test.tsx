import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { openSwapSheet } from './support/exercise-menu';
import { fakeApi } from './support/fake-api';
import { findHeaderTitle } from './support/native-header';
import { secureStore } from './support/secure-store';
import type { FakeSetType } from './support/fake-api';
import { chooseSetType, loggedSets, readouts } from './support/set-table';

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
    // Each tiered row shows its medal by its mark, in order; the last has none.
    expect(card.getAllByText(/^(🏆|🥈|🥉)$/).map((medal) => medal.props.children)).toEqual(['🏆', '🥈', '🥉', '🥉']);
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

  it('marks a set as a warm-up, failure or drop set by tapping its number, and numbers only the working sets', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    await resumeWorkout(account.id);
    const card = exerciseCard('Back Squat');
    const typeOf = (n: number) => card.getByRole('button', { name: `Set ${n} type` });

    // A set is normal until marked, showing its number.
    expect(within(typeOf(1)).getByText('1')).toBeVisible();
    await fireEvent.press(typeOf(1));
    const types = within(screen.getByLabelText('Set 1 type options'));
    expect(types.getAllByRole('radio').map((option) => option.props.accessibilityLabel)).toEqual([
      'Normal',
      'Warm-up',
      'Failure',
      'Drop',
    ]);
    await fireEvent.press(types.getByRole('radio', { name: 'Warm-up' }));
    expect(screen.queryByLabelText('Set 1 type options')).toBeNull();
    expect(within(typeOf(1)).getByText('W')).toBeVisible();

    await fireEvent.changeText(card.getByLabelText('Set 1 weight (kg)'), '60');
    await fireEvent.changeText(card.getByLabelText('Set 1 reps'), '10');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
    await waitFor(() => expect(loggedSets(card)).toEqual(['60 kg × 10, Warm-up']));

    // The warm-up takes no number, so the next set, normal, is the first.
    expect(within(typeOf(1)).getByText('W')).toBeVisible();
    expect(within(typeOf(2)).getByText('1')).toBeVisible();
    await fireEvent.changeText(card.getByLabelText('Set 2 weight (kg)'), '140');
    await fireEvent.changeText(card.getByLabelText('Set 2 reps'), '5');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 2' }));
    await waitFor(() => expect(loggedSets(card)).toHaveLength(2));

    await chooseSetType(card, 3, 'Drop');
    expect(within(typeOf(3)).getByText('D')).toBeVisible();
    await fireEvent.changeText(card.getByLabelText('Set 3 reps'), '8');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 3' }));
    await waitFor(() => expect(loggedSets(card)).toHaveLength(3));

    // A failure set counts, though it shows F: the normal set after it is the third.
    await chooseSetType(card, 4, 'Failure');
    await fireEvent.changeText(card.getByLabelText('Set 4 reps'), '4');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 4' }));
    await waitFor(() => expect(loggedSets(card)).toHaveLength(4));
    expect(['W', '1', 'D', 'F', '3'].map((mark, i) => within(typeOf(i + 1)).getByText(mark))).toHaveLength(5);

    expect(fakeApi.sessions(account.id)[0].exercises[0].sets.map((set) => set.type)).toEqual([
      'warmup',
      'normal',
      'drop',
      'failure',
    ]);
  });

  it('changes the type of a logged set by tapping its number, keeping its values', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const squat = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    fakeApi.addSet(squat, 60, 'kg', 10, '', 7);
    await resumeWorkout(account.id);
    const card = exerciseCard('Back Squat');

    await chooseSetType(card, 1, 'Warm-up');

    await waitFor(() => expect(loggedSets(card)).toEqual(['60 kg × 10 @ RPE 7, Warm-up']));
    expect(within(card.getByRole('button', { name: 'Set 1 type' })).getByText('W')).toBeVisible();
    expect(within(card.getByRole('button', { name: 'Set 2 type' })).getByText('1')).toBeVisible();
    expect(fakeApi.sessions(account.id)[0].exercises[0].sets).toMatchObject([
      { weight: 60, reps: 10, rpe: 7, type: 'warmup' },
    ]);

    // Correcting the set's values keeps its type.
    await fireEvent.press(card.getByRole('button', { name: 'Edit set 1' }));
    await fireEvent.changeText(within(card.getByLabelText('Editing set 1')).getByLabelText('Reps'), '8');
    await fireEvent.press(within(card.getByLabelText('Editing set 1')).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(loggedSets(card)).toEqual(['60 kg × 8 @ RPE 7, Warm-up']));
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

  it("swaps an exercise in a superset from its card's menu, and offers no Replace without Substitutes", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    const bench = fakeApi.addSessionExercise(session, 'Bench Press');
    bench.plannedExerciseId = bench.exerciseId;
    bench.substituteIds = [fakeApi.exerciseNamed('Dumbbell Bench Press').id];
    const pulldown = fakeApi.addSessionExercise(session, 'Lat Pulldown');
    bench.supersetId = 'superset-1';
    pulldown.supersetId = 'superset-1';
    await resumeWorkout(account.id);
    const superset = within(screen.getByLabelText('Superset of Bench Press and Lat Pulldown'));

    await fireEvent.press(superset.getByRole('button', { name: 'Lat Pulldown options' }));
    const menu = within(await screen.findByLabelText('Lat Pulldown options sheet'));
    expect(menu.queryByRole('button', { name: 'Replace exercise' })).toBeNull();
    await fireEvent.press(menu.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Lat Pulldown options sheet')).toBeNull();

    await openSwapSheet('Bench Press');
    await fireEvent.press(
      within(await screen.findByLabelText('Substitutes for Bench Press')).getByRole('button', {
        name: 'Swap to Dumbbell Bench Press',
      }),
    );
    const swapped = within(await superset.findByLabelText('Dumbbell Bench Press card'));
    expect(swapped.getByText('Instead of Bench Press')).toBeVisible();
    expect(fakeApi.sessions(account.id)[0].exercises[0].exerciseId).toBe(
      fakeApi.exerciseNamed('Dumbbell Bench Press').id,
    );
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

describe('last time', () => {
  /** What each row's Last time cell shows, in order: last time's Set at that place, or none. */
  function lastTimeCells(card: ReturnType<typeof exerciseCard>) {
    return readouts(card.getAllByLabelText(/^Set \d+ last time$/));
  }

  /** A finished Session of Bench Press, a day ago, with these Sets. */
  function benchedYesterday(accountId: string, sets: [number, 'kg' | 'lb', number, (number | null)?][]) {
    const earlier = fakeApi.addSession(accountId, new Date(Date.now() - 86_400_000));
    const bench = fakeApi.addSessionExercise(earlier, 'Bench Press');
    for (const [weight, unit, reps, rpe = null] of sets) fakeApi.addSet(bench, weight, unit, reps, '', rpe);
    fakeApi.finishSession(earlier, new Date(Date.now() - 86_400_000 + 3_600_000));
  }

  it("shows last time's sets beside today's, and starts each row from them or the row above", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    benchedYesterday(account.id, [
      [60, 'kg', 10, 7],
      [62.5, 'kg', 8],
    ]);
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    await resumeWorkout(account.id);
    const card = exerciseCard('Bench Press');

    expect(card.getByText('PREV')).toBeVisible();
    expect(lastTimeCells(card)).toEqual(['60 kg × 10 @ RPE 7']);
    expect(card.getByText('60 × 10')).toBeVisible();
    expect(card.getByText('@ 7')).toBeVisible();
    // Set 1 starts as last time's set 1, but not its RPE: that's how it felt.
    expect(card.getByLabelText('Set 1 weight (kg)')).toHaveDisplayValue('60');
    expect(card.getByLabelText('Set 1 reps')).toHaveDisplayValue('10');
    expect(within(card.getByRole('button', { name: 'Set 1 RPE' })).getByText('–')).toBeVisible();

    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
    // Last time's set 1 again ties the best before: silver.
    await waitFor(() => expect(loggedSets(card)).toEqual(['60 kg × 10, Silver']));

    // The logged set keeps its Last time; the next row repeats the set just done.
    expect(lastTimeCells(card)).toEqual(['60 kg × 10 @ RPE 7', '62.5 kg × 8']);
    expect(card.getByLabelText('Set 2 weight (kg)')).toHaveDisplayValue('60');
    expect(card.getByLabelText('Set 2 reps')).toHaveDisplayValue('10');

    // Tapping Last time puts its weight and reps into the row, keeping the RPE picked.
    await fireEvent.press(card.getByRole('button', { name: 'Set 2 RPE' }));
    await fireEvent.press(within(screen.getByLabelText('Set 2 RPE options')).getByRole('radio', { name: '9' }));
    await fireEvent.press(card.getByRole('button', { name: 'Set 2 last time' }));
    expect(card.getByLabelText('Set 2 weight (kg)')).toHaveDisplayValue('62.5');
    expect(card.getByLabelText('Set 2 reps')).toHaveDisplayValue('8');
    expect(within(card.getByRole('button', { name: 'Set 2 RPE' })).getByText('9')).toBeVisible();

    // A row added after follows the row above, and last time had no set there.
    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    expect(lastTimeCells(card)).toEqual(['60 kg × 10 @ RPE 7', '62.5 kg × 8', 'None']);
    expect(card.getByLabelText('Set 3 weight (kg)')).toHaveDisplayValue('62.5');
    expect(card.getByLabelText('Set 3 reps')).toHaveDisplayValue('8');
    await fireEvent.changeText(card.getByLabelText('Set 2 weight (kg)'), '65');
    expect(card.getByLabelText('Set 3 weight (kg)')).toHaveDisplayValue('65');
  });

  it('comes before the Target, and is in the unit the user sees', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'lb');
    // 100 kg is 220.5 lb.
    benchedYesterday(account.id, [
      [100, 'kg', 6],
      [225, 'lb', 5],
    ]);
    const bench = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    bench.target = { sets: 3, reps: 10, weight: 185, weightUnit: 'lb', restSeconds: null, note: '' };
    await resumeWorkout(account.id);
    const card = exerciseCard('Bench Press');

    expect(lastTimeCells(card)).toEqual(['220.5 lb × 6', '225 lb × 5', 'None']);
    for (const set of [1, 2, 3]) {
      expect(card.getByLabelText(`Set ${set} weight (lb)`)).toHaveDisplayValue('220.5');
      expect(card.getByLabelText(`Set ${set} reps`)).toHaveDisplayValue('6');
    }
  });
});

describe('warm-ups from last time', () => {
  /**
   * A finished Session of Bench Press a day ago: W 60×8, W 80×3, then
   * 1: 100×5, 2: 102.5×5, a mid-Session W 50×5, D 70×10, 3: 105×4.
   */
  function benchedYesterday(accountId: string) {
    const earlier = fakeApi.addSession(accountId, new Date(Date.now() - 86_400_000));
    const bench = fakeApi.addSessionExercise(earlier, 'Bench Press');
    const sets: [number, number, FakeSetType][] = [
      [60, 8, 'warmup'],
      [80, 3, 'warmup'],
      [100, 5, 'normal'],
      [102.5, 5, 'normal'],
      [50, 5, 'warmup'],
      [70, 10, 'drop'],
      [105, 4, 'normal'],
    ];
    for (const [weight, reps, type] of sets) fakeApi.addSet(bench, weight, 'kg', reps, '', null, type);
    fakeApi.finishSession(earlier, new Date(Date.now() - 86_400_000 + 3_600_000));
  }

  /** Each row still to do, as its mark and the weight × reps it holds: "W 60×8". */
  function rowsToDoHold(card: ReturnType<typeof exerciseCard>) {
    return card.getAllByRole('button', { name: /^Log set \d+$/ }).map((box) => {
      const n = box.props.accessibilityLabel.replace('Log set ', '');
      const mark = within(card.getByRole('button', { name: `Set ${n} type` })).getByText(/./).props.children;
      const weight = card.getByLabelText(`Set ${n} weight (kg)`).props.value;
      const reps = card.getByLabelText(`Set ${n} reps`).props.value;
      return `${mark} ${weight}×${reps}`;
    });
  }

  function lastTimeCells(card: ReturnType<typeof exerciseCard>) {
    return readouts(card.getAllByLabelText(/^Set \d+ last time$/));
  }

  it("starts with last time's warm-ups before its first set, and lines up warm-ups and numbered sets apart", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    benchedYesterday(account.id);
    const bench = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    bench.target = { sets: 3, reps: 5, weight: 100, weightUnit: 'kg', restSeconds: null, note: '' };
    await resumeWorkout(account.id);
    const card = exerciseCard('Bench Press');

    // The mid-Session warm-up and the drop set don't come back; set 3
    // lines up with last time's set 3.
    expect(rowsToDoHold(card)).toEqual(['W 60×8', 'W 80×3', '1 100×5', '2 100×5', '3 100×5']);
    expect(lastTimeCells(card)).toEqual(['60 kg × 8', '80 kg × 3', '100 kg × 5', '102.5 kg × 5', '105 kg × 4']);

    // A drop set lines up with nothing, so the set after it is set 2.
    await chooseSetType(card, 4, 'Drop');
    expect(lastTimeCells(card)).toEqual(['60 kg × 8', '80 kg × 3', '100 kg × 5', 'None', '102.5 kg × 5']);
    await chooseSetType(card, 4, 'Normal');

    // Logging the warm-ups leaves the working sets where they start.
    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
    await waitFor(() => expect(loggedSets(card)).toEqual(['60 kg × 8, Warm-up']));
    await fireEvent.press(card.getByRole('button', { name: 'Log set 2' }));
    await waitFor(() => expect(loggedSets(card)).toEqual(['60 kg × 8, Warm-up', '80 kg × 3, Warm-up']));
    expect(rowsToDoHold(card)).toEqual(['1 100×5', '2 100×5', '3 100×5']);
    expect(lastTimeCells(card)).toEqual(['60 kg × 8', '80 kg × 3', '100 kg × 5', '102.5 kg × 5', '105 kg × 4']);
  });

  it("swaps to the other Exercise's warm-ups before a set is logged, and brings in none after", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    benchedYesterday(account.id);
    const earlier = fakeApi.addSession(account.id, new Date(Date.now() - 2 * 86_400_000));
    const dumbbells = fakeApi.addSessionExercise(earlier, 'Dumbbell Bench Press');
    fakeApi.addSet(dumbbells, 20, 'kg', 10, '', null, 'warmup');
    fakeApi.addSet(dumbbells, 25, 'kg', 8, '', null, 'warmup');
    fakeApi.addSet(dumbbells, 30, 'kg', 10);
    fakeApi.finishSession(earlier, new Date(Date.now() - 2 * 86_400_000 + 3_600_000));
    const bench = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    bench.target = { sets: 3, reps: 5, weight: 100, weightUnit: 'kg', restSeconds: null, note: '' };
    bench.plannedExerciseId = bench.exerciseId;
    bench.substituteIds = [fakeApi.exerciseNamed('Dumbbell Bench Press').id];
    await resumeWorkout(account.id);

    async function swap(from: string, to: string) {
      await openSwapSheet(from);
      await fireEvent.press(
        within(await screen.findByLabelText('Substitutes for Bench Press')).getByRole('button', {
          name: `Swap to ${to}`,
        }),
      );
      return within(await screen.findByLabelText(`${to} card`));
    }

    let card = await swap('Bench Press', 'Dumbbell Bench Press');
    expect(rowsToDoHold(card)).toEqual(['W 20×10', 'W 25×8', '1 30×10', '2 30×10', '3 30×10']);
    card = await swap('Dumbbell Bench Press', 'Bench Press');
    expect(rowsToDoHold(card)).toEqual(['W 60×8', 'W 80×3', '1 100×5', '2 100×5', '3 100×5']);

    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
    await waitFor(() => expect(loggedSets(card)).toEqual(['60 kg × 8, Warm-up']));
    card = await swap('Bench Press', 'Dumbbell Bench Press');
    expect(rowsToDoHold(card)).toEqual(['1 30×10', '2 30×10', '3 30×10']);
  });

  it('gives a freeform exercise its warm-ups too, and a row marked a warm-up by hand takes a warm-up place', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    benchedYesterday(account.id);
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    await resumeWorkout(account.id);
    const card = exerciseCard('Bench Press');

    expect(rowsToDoHold(card)).toEqual(['W 60×8', 'W 80×3', '1 100×5']);
    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    await chooseSetType(card, 4, 'Warm-up');
    // Last time's third warm-up, from mid-Session.
    expect(lastTimeCells(card)).toEqual(['60 kg × 8', '80 kg × 3', '100 kg × 5', '50 kg × 5']);

    // Going straight to the working set leaves the warm-ups behind, and the
    // rows after keep what was typed in them.
    await fireEvent.changeText(card.getByLabelText('Set 4 reps'), '6');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 3' }));
    await waitFor(() => expect(loggedSets(card)).toHaveLength(1));
    expect(rowsToDoHold(card)).toEqual(['W 100×6']);
  });
});
