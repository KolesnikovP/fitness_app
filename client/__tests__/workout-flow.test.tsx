import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { http, HttpResponse } from 'msw';
import { Alert } from 'react-native';

import {
  chipNames,
  openExerciseMenuItem,
  openSwapSheet,
  pressChip,
  removeExercise,
  swap,
} from './support/exercise-chips';
import { fakeApi, server } from './support/fake-api';
import { openFinishedWorkout } from './support/finished-workout';
import { findHeaderTitle } from './support/native-header';
import { answerAlertWith } from './support/alert';
import {
  chooseDiscardWorkout,
  endWorkoutChoices,
  finishWorkout,
  openRestTimer,
  sessionHeader,
  startRest,
} from './support/session-header';
import { secureStore } from './support/secure-store';
import {
  doneTiles,
  exerciseCard,
  type ExerciseCard,
  shownTile,
  showExercise,
  strip,
  tileNames,
} from './support/session-exercises';
import type { FakeSetType } from './support/fake-api';
import {
  chooseSetType,
  loggedSets,
  logSet,
  readouts,
  removeRow,
  repsToDo,
  rowsToDo,
  rowsToDoHold,
} from './support/set-table';
import { swipeLeft } from './support/swipeable';

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

describe('freeform workout', () => {
  it('starts an empty workout, logs a set and shows it in the history once finished', async () => {
    const account = await openWorkoutTab();

    await fireEvent.press(screen.getByRole('button', { name: 'Start Workout' }));
    await findHeaderTitle('Current workout');
    // An empty workout can't be saved yet, only discarded.
    expect(await endWorkoutChoices()).toEqual(['Discard workout', 'Keep logging']);

    await fireEvent.press(screen.getByRole('button', { name: 'Add exercise' }));
    await findHeaderTitle('Add exercise');
    // Jest mounts every tab, so the Exercises tab's search is also on screen.
    const picker = within(screen.getByLabelText('Exercise picker'));
    await fireEvent.changeText(picker.getByLabelText('Search exercises'), 'bench');
    await fireEvent.press(await picker.findByRole('button', { name: 'Dumbbell Bench Press' }));

    await findHeaderTitle('Current workout');
    const card = await exerciseCard('Dumbbell Bench Press');
    // A table of sets, a column each for weight, reps and RPE; with nothing
    // planned, one row is ready for the first set.
    expect(card.getByText('KG')).toBeVisible();
    expect(card.getByText('REPS')).toBeVisible();
    expect(card.getByText('RPE')).toBeVisible();
    expect(card.queryByLabelText('Set 2 reps')).toBeNull();
    await fireEvent.changeText(card.getByLabelText('Set 1 weight (kg)'), '32,5');
    await fireEvent.changeText(card.getByLabelText('Set 1 reps'), '10');
    // Notes stay out of the way until asked for.
    expect(screen.queryByLabelText('Exercise note')).toBeNull();
    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));

    await waitFor(() => expect(loggedSets(card)).toEqual(['32.5 kg × 10']));
    // Done with one exercise, the sets need no label.
    expect(within(card.getByLabelText('Sets')).queryAllByRole('header')).toEqual([]);
    // With no Target, no row is left; one added repeats the set just done.
    expect(rowsToDo(card)).toBe(0);
    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    expect(card.getByLabelText('Set 2 weight (kg)')).toHaveDisplayValue('32.5');
    expect(card.getByLabelText('Set 2 reps')).toHaveDisplayValue('10');

    // A set's note is added by tapping it.
    await fireEvent.press(card.getByRole('button', { name: 'Edit set 1' }));
    const editing = within(card.getByLabelText('Editing set 1'));
    await fireEvent.press(editing.getByRole('button', { name: 'Add set note' }));
    await fireEvent.changeText(editing.getByLabelText('Set note'), 'Slow negatives');
    await fireEvent.press(editing.getByRole('button', { name: 'Save' }));
    expect(await card.findByText('Slow negatives')).toBeVisible();

    await pressChip('Dumbbell Bench Press', 'Note');
    const noteSheet = within(await screen.findByLabelText('Dumbbell Bench Press note'));
    await fireEvent.changeText(noteSheet.getByLabelText('Exercise note'), 'Bench 3 was free');
    await fireEvent.press(noteSheet.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByLabelText('Dumbbell Bench Press note')).toBeNull());

    await finishWorkout();

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
    expect(loggedSets(await exerciseCard('Deadlift'))).toEqual(['140 kg × 3']);
    // A note already written is there to read in its sheet.
    await pressChip('Deadlift', 'Note');
    const noteSheet = within(await screen.findByLabelText('Deadlift note'));
    expect(noteSheet.getByLabelText('Exercise note')).toHaveDisplayValue('Mixed grip');
    await fireEvent.press(noteSheet.getByRole('button', { name: 'Close' }));
    expect(await endWorkoutChoices()).toContain('Finish workout');
  });

  it('tells the user the moment a set beats their record, and marks it in the table', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const earlier = fakeApi.addSession(account.id, new Date(Date.now() - 86_400_000));
    fakeApi.addSet(fakeApi.addSessionExercise(earlier, 'Bench Press'), 100, 'kg', 5);
    fakeApi.finishSession(earlier, new Date(Date.now() - 86_400_000 + 3_600_000));
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    await resumeWorkout(account.id);
    const card = await exerciseCard('Bench Press');

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
    const card = await exerciseCard('Bench Press');

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
    const card = await exerciseCard('Back Squat');

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
    const card = await exerciseCard('Back Squat');

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
    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
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
    const card = await exerciseCard('Back Squat');
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

    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    await chooseSetType(card, 3, 'Drop');
    expect(within(typeOf(3)).getByText('D')).toBeVisible();
    await fireEvent.changeText(card.getByLabelText('Set 3 reps'), '8');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 3' }));
    await waitFor(() => expect(loggedSets(card)).toHaveLength(3));

    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    // A failure set counts, though it shows F: the normal set after it is the third.
    await chooseSetType(card, 4, 'Failure');
    await fireEvent.changeText(card.getByLabelText('Set 4 reps'), '4');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 4' }));
    await waitFor(() => expect(loggedSets(card)).toHaveLength(4));
    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
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
    const card = await exerciseCard('Back Squat');

    await chooseSetType(card, 1, 'Warm-up');

    await waitFor(() => expect(loggedSets(card)).toEqual(['60 kg × 10 @ RPE 7, Warm-up']));
    expect(within(card.getByRole('button', { name: 'Set 1 type' })).getByText('W')).toBeVisible();
    // Its first row was used up by the Set logged; rows to do now come from + Add set.
    expect(rowsToDo(card)).toBe(0);
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
    const card = await exerciseCard('Back Squat');

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

    await pressChip('Bench Press', 'Superset');
    const picker = within(await screen.findByLabelText('Superset with Bench Press'));
    // Picked from the other exercises; one alone isn't a superset.
    expect(picker.getAllByRole('checkbox').map((c) => c.props.accessibilityLabel)).toEqual(['Plank', 'Lat Pulldown']);
    expect(picker.getByRole('button', { name: 'Group as superset' })).toBeDisabled();
    await fireEvent.press(picker.getByRole('checkbox', { name: 'Lat Pulldown' }));
    await fireEvent.press(picker.getByRole('button', { name: 'Group as superset' }));

    await screen.findByLabelText('Tiles of superset of Bench Press and Lat Pulldown');
    expect(screen.queryByLabelText('Superset with Bench Press')).toBeNull();
    // Its exercises' tiles are together, ahead of the one added between them.
    expect(tileNames()).toEqual(['Bench Press', 'Lat Pulldown', 'Plank']);
    const tiles = within(screen.getByLabelText('Tiles of superset of Bench Press and Lat Pulldown'));
    expect(tileNames(tiles)).toEqual(['Bench Press', 'Lat Pulldown']);
    const superset = within(screen.getByLabelText('Superset of Bench Press and Lat Pulldown'));
    expect(superset.getByText('Next: Bench Press')).toBeVisible();

    const bench = await exerciseCard('Bench Press');
    await fireEvent.changeText(bench.getByLabelText('Set 1 weight (kg)'), '80');
    await fireEvent.changeText(bench.getByLabelText('Set 1 reps'), '8');
    await fireEvent.press(bench.getByRole('button', { name: 'Log set 1' }));
    // No rest between the exercises of a superset...
    expect(await superset.findByText('Next: Lat Pulldown, no rest')).toBeVisible();

    const pulldown = await exerciseCard('Lat Pulldown');
    const pulldownSuperset = within(screen.getByLabelText('Superset of Bench Press and Lat Pulldown'));
    await fireEvent.changeText(pulldown.getByLabelText('Set 1 weight (kg)'), '60');
    await fireEvent.changeText(pulldown.getByLabelText('Set 1 reps'), '10');
    await fireEvent.press(pulldown.getByRole('button', { name: 'Log set 1' }));
    // ...only after the whole round.
    expect(await pulldownSuperset.findByText('Round 1 done. Rest now.')).toBeVisible();

    const [saved] = fakeApi.sessions(account.id);
    const [benchPress, plank, latPulldown] = saved.exercises;
    expect(benchPress.supersetId).not.toBeNull();
    expect(latPulldown.supersetId).toBe(benchPress.supersetId);
    expect(plank.supersetId).toBeNull();
    expect(benchPress.sets).toMatchObject([{ weight: 80, reps: 8, supersetId: benchPress.supersetId }]);
    expect(latPulldown.sets).toMatchObject([{ weight: 60, reps: 10, supersetId: benchPress.supersetId }]);

    expect(chipNames('Lat Pulldown')).toEqual(['Note', 'Ungroup', 'More']);
    await pressChip('Lat Pulldown', 'Ungroup');
    await waitFor(() => expect(screen.queryByLabelText(/^Superset of/)).toBeNull());
    expect(screen.queryByLabelText(/^Tiles of superset/)).toBeNull();
    expect(fakeApi.sessions(account.id)[0].exercises.every((e) => e.supersetId === null)).toBe(true);
    expect(chipNames('Lat Pulldown')).toEqual(['Note', 'Superset', 'More']);
  });

  it("swaps an exercise in a superset from its card's menu", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    const bench = fakeApi.addSessionExercise(session, 'Bench Press');
    bench.plannedExerciseId = bench.exerciseId;
    bench.substituteIds = [fakeApi.exerciseNamed('Dumbbell Bench Press').id];
    const pulldown = fakeApi.addSessionExercise(session, 'Lat Pulldown');
    bench.supersetId = 'superset-1';
    pulldown.supersetId = 'superset-1';
    await resumeWorkout(account.id);

    await openSwapSheet('Bench Press');
    await fireEvent.press(
      within(await screen.findByLabelText('Substitutes for Bench Press')).getByRole('button', {
        name: 'Swap to Dumbbell Bench Press',
      }),
    );
    const superset = within(screen.getByLabelText('Superset of Dumbbell Bench Press and Lat Pulldown'));
    const swapped = within(await superset.findByLabelText('Dumbbell Bench Press card'));
    // Its tile is the Exercise swapped to.
    expect(tileNames()).toEqual(['Dumbbell Bench Press', 'Lat Pulldown']);
    expect(swapped.getByText('Instead of Bench Press')).toBeVisible();
    expect(fakeApi.sessions(account.id)[0].exercises[0].exerciseId).toBe(
      fakeApi.exerciseNamed('Dumbbell Bench Press').id,
    );
  });

  it('corrects a logged set', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSet(fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat'), 140, 'kg', 5);
    await resumeWorkout(account.id);
    const card = await exerciseCard('Back Squat');

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
      const card = await exerciseCard('Back Squat');

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

  it('deletes a set by swiping its row left, with a moment to undo it', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
      const squat = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
      fakeApi.addSet(squat, 140, 'kg', 5);
      fakeApi.addSet(squat, 140, 'kg', 3);
      await resumeWorkout(account.id);
      const card = await exerciseCard('Back Squat');

      // Delete is under the row until it's swiped.
      expect(card.queryByRole('button', { name: 'Delete set 1' })).toBeNull();
      await swipeLeft(card.getByRole('button', { name: 'Edit set 1' }));
      await fireEvent.press(card.getByRole('button', { name: 'Delete set 1' }));

      expect(loggedSets(card)).toEqual(['140 kg × 3']);
      expect(screen.getByText('Set deleted.')).toBeVisible();

      await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
      // It comes back as it was, with Delete hidden again.
      expect(loggedSets(card)).toEqual(['140 kg × 5', '140 kg × 3']);
      expect(card.queryByRole('button', { name: 'Delete set 1' })).toBeNull();

      await swipeLeft(card.getByRole('button', { name: 'Edit set 2' }));
      await fireEvent.press(card.getByRole('button', { name: 'Delete set 2' }));
      expect(squat.sets).toHaveLength(2);
      await act(async () => jest.advanceTimersByTime(5_000));

      await waitFor(() => expect(squat.sets).toHaveLength(1));
      expect(squat.sets[0]).toMatchObject({ reps: 5 });
      expect(loggedSets(card)).toEqual(['140 kg × 5']);
    } finally {
      jest.useRealTimers();
    }
  });

  it("swipes to delete a set in a superset's card, and one done with another exercise before a swap", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    const bench = fakeApi.addSessionExercise(session, 'Bench Press');
    const pulldown = fakeApi.addSessionExercise(session, 'Lat Pulldown');
    bench.supersetId = 'superset-1';
    pulldown.supersetId = 'superset-1';
    fakeApi.addSet(pulldown, 60, 'kg', 10);
    fakeApi.addSet(pulldown, 60, 'kg', 8);
    // Bench Press's first Set was done before it was swapped to dumbbells.
    fakeApi.addSet(bench, 80, 'kg', 8);
    bench.exerciseId = fakeApi.exerciseNamed('Dumbbell Bench Press').id;
    fakeApi.addSet(bench, 30, 'kg', 10);
    await resumeWorkout(account.id);

    const pulldownCard = await exerciseCard('Lat Pulldown');
    await swipeLeft(pulldownCard.getByRole('button', { name: 'Edit set 2' }));
    await fireEvent.press(pulldownCard.getByRole('button', { name: 'Delete set 2' }));
    expect(loggedSets(pulldownCard)).toEqual(['60 kg × 10']);

    const benchCard = await exerciseCard('Dumbbell Bench Press');
    await swipeLeft(benchCard.getByRole('button', { name: 'Edit set 1' }));
    await fireEvent.press(benchCard.getByRole('button', { name: 'Delete set 1' }));
    expect(loggedSets(benchCard)).toEqual(['30 kg × 10']);

    // Deleting another Set sends the one before it.
    await waitFor(() => expect(pulldown.sets).toMatchObject([{ reps: 10 }]));
  });

  it("doesn't swipe the set being edited", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSet(fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat'), 140, 'kg', 5);
    await resumeWorkout(account.id);
    const card = await exerciseCard('Back Squat');

    await fireEvent.press(card.getByRole('button', { name: 'Edit set 1' }));
    await swipeLeft(within(card.getByLabelText('Editing set 1')).getByLabelText('Reps'));

    expect(card.queryByRole('button', { name: 'Delete set 1' })).toBeNull();
  });

  it('deletes a pending set before finishing the workout', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const squat = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    fakeApi.addSet(squat, 140, 'kg', 5);
    fakeApi.addSet(squat, 140, 'kg', 3);
    await resumeWorkout(account.id);
    const card = await exerciseCard('Back Squat');

    await fireEvent.press(card.getByRole('button', { name: 'Edit set 2' }));
    await fireEvent.press(card.getByRole('button', { name: 'Delete set' }));
    await finishWorkout();

    await findHeaderTitle('Workout finished');
    const [saved] = fakeApi.sessions(account.id);
    expect(saved.finishedAt).not.toBeNull();
    expect(saved.exercises[0].sets).toMatchObject([{ reps: 5 }]);
  });

  it("can't finish a workout once its only set is deleted", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSet(fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat'), 140, 'kg', 5);
    await resumeWorkout(account.id);

    await fireEvent.press((await exerciseCard('Back Squat')).getByRole('button', { name: 'Edit set 1' }));
    await fireEvent.press((await exerciseCard('Back Squat')).getByRole('button', { name: 'Delete set' }));

    expect(await endWorkoutChoices()).toEqual(['Discard workout', 'Keep logging']);
  });

  it('counts down a rest picked on two wheels from the header, shown beside its icon', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      await openWorkoutTab();
      await fireEvent.press(screen.getByRole('button', { name: 'Start Workout' }));
      await findHeaderTitle('Current workout');
      const restTimer = () => sessionHeader().getByRole('button', { name: 'Rest timer' });
      // Just the icon until a rest starts.
      expect(restTimer()).toHaveTextContent(/^⏱$/);

      await startRest(1, 30);
      expect(restTimer()).toHaveTextContent('⏱1:30');

      await act(async () => jest.advanceTimersByTime(30_000));
      expect(restTimer()).toHaveTextContent('⏱1:00');

      await act(async () => jest.advanceTimersByTime(60_000));
      expect(restTimer()).toHaveTextContent(/^⏱$/);

      await startRest(2, 0);
      const sheet = await openRestTimer();
      expect(sheet.getByLabelText('Rest time left')).toHaveTextContent('2:00');
      await fireEvent.press(sheet.getByRole('button', { name: '+15s' }));
      expect(sheet.getByLabelText('Rest time left')).toHaveTextContent('2:15');
      await fireEvent.press(sheet.getByRole('button', { name: 'Skip rest' }));
      expect(restTimer()).toHaveTextContent(/^⏱$/);
    } finally {
      jest.useRealTimers();
    }
  });

  it('offers seconds on its wheel in 15-second steps, and minutes up to 10', async () => {
    await openWorkoutTab();
    await fireEvent.press(screen.getByRole('button', { name: 'Start Workout' }));
    await findHeaderTitle('Current workout');

    const sheet = await openRestTimer();

    expect(sheet.getAllByRole('button', { name: /^\d+ seconds$/ }).map((b) => b.props.accessibilityLabel)).toEqual([
      '0 seconds',
      '15 seconds',
      '30 seconds',
      '45 seconds',
    ]);
    expect(sheet.getAllByRole('button', { name: /^\d+ minutes$/ }).at(-1)?.props.accessibilityLabel).toBe('10 minutes');
  });

  it('discards a workout after confirming', async () => {
    const account = await openWorkoutTab();
    await fireEvent.press(screen.getByRole('button', { name: 'Start Workout' }));
    await findHeaderTitle('Current workout');
    await chooseDiscardWorkout('Discard');

    await screen.findByRole('header', { name: 'Workout' });
    expect(await screen.findByRole('button', { name: 'Start Workout' })).toBeVisible();
    expect(fakeApi.sessions(account.id)).toEqual([]);
  });
});

describe('removing an exercise', () => {
  it('removes an exercise with nothing logged at once, with a moment to undo it', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
      const session = fakeApi.addSession(account.id);
      fakeApi.addSet(fakeApi.addSessionExercise(session, 'Back Squat'), 140, 'kg', 5);
      fakeApi.addSessionExercise(session, 'Bench Press');
      fakeApi.addSessionExercise(session, 'Plank');
      await resumeWorkout(account.id);
      const alert = jest.spyOn(Alert, 'alert');

      await removeExercise('Bench Press');

      expect(alert).not.toHaveBeenCalled();
      expect(tileNames()).toEqual(['Back Squat', 'Plank']);
      expect(screen.getByText('Exercise removed.')).toBeVisible();

      // Undo puts it back where it was.
      await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
      expect(tileNames()).toEqual(['Back Squat', 'Bench Press', 'Plank']);
      expect(screen.queryByText('Exercise removed.')).toBeNull();

      await removeExercise('Bench Press');
      // Nothing is removed until the moment to undo has passed.
      expect(fakeApi.sessions(account.id)[0].exercises).toHaveLength(3);
      await act(async () => jest.advanceTimersByTime(5_000));

      await waitFor(() => expect(fakeApi.sessions(account.id)[0].exercises).toHaveLength(2));
      expect(screen.queryByText('Exercise removed.')).toBeNull();
      expect(tileNames()).toEqual(['Back Squat', 'Plank']);
    } finally {
      jest.useRealTimers();
    }
  });

  it('asks before removing an exercise with logged sets, and its sets come back with it on undo', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    const bench = fakeApi.addSessionExercise(session, 'Bench Press');
    fakeApi.addSet(bench, 100, 'kg', 5);
    fakeApi.addSet(bench, 100, 'kg', 4);
    fakeApi.addSessionExercise(session, 'Plank');
    await resumeWorkout(account.id);

    const keep = answerAlertWith('Keep it');
    await removeExercise('Bench Press');

    expect(keep).toHaveBeenCalledWith(
      'Remove Bench Press?',
      'Its 2 logged sets will be deleted too.',
      expect.anything(),
    );
    expect(tileNames()).toEqual(['Bench Press', 'Plank']);
    expect(loggedSets(await exerciseCard('Bench Press'))).toEqual(['100 kg × 5', '100 kg × 4']);
    expect(screen.queryByText('Exercise removed.')).toBeNull();

    answerAlertWith('Remove');
    await removeExercise('Bench Press');

    expect(tileNames()).toEqual(['Plank']);
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(tileNames()).toEqual(['Bench Press', 'Plank']);
    expect(loggedSets(await exerciseCard('Bench Press'))).toEqual(['100 kg × 5', '100 kg × 4']);
    expect(bench.sets).toHaveLength(2);
  });

  it('removes a pending exercise before finishing the workout', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    fakeApi.addSet(fakeApi.addSessionExercise(session, 'Back Squat'), 140, 'kg', 5);
    fakeApi.addSet(fakeApi.addSessionExercise(session, 'Bench Press'), 100, 'kg', 5);
    await resumeWorkout(account.id);

    answerAlertWith('Remove');
    await removeExercise('Bench Press');
    await finishWorkout();

    await findHeaderTitle('Workout finished');
    const [saved] = fakeApi.sessions(account.id);
    expect(saved.finishedAt).not.toBeNull();
    expect(saved.exercises.map((e) => e.exerciseId)).toEqual([fakeApi.exerciseNamed('Back Squat').id]);
  });

  it("doesn't finish the workout when removing a pending exercise fails", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    fakeApi.addSet(fakeApi.addSessionExercise(session, 'Back Squat'), 140, 'kg', 5);
    const bench = fakeApi.addSessionExercise(session, 'Bench Press');
    await resumeWorkout(account.id);

    await removeExercise('Bench Press');
    // Removed from another device meanwhile, so removing it here fails.
    session.exercises = session.exercises.filter((e) => e !== bench);
    await finishWorkout();

    expect(await screen.findByRole('alert')).toHaveTextContent("That exercise isn't in this workout.");
    expect(await endWorkoutChoices()).toContain('Finish workout');
    expect(fakeApi.sessions(account.id)[0].finishedAt).toBeNull();
  });

  it('can undo only the last of a set deletion and an exercise removal', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    const squat = fakeApi.addSessionExercise(session, 'Back Squat');
    fakeApi.addSet(squat, 140, 'kg', 5);
    fakeApi.addSet(squat, 140, 'kg', 3);
    fakeApi.addSessionExercise(session, 'Bench Press');
    await resumeWorkout(account.id);

    await fireEvent.press((await exerciseCard('Back Squat')).getByRole('button', { name: 'Edit set 1' }));
    await fireEvent.press((await exerciseCard('Back Squat')).getByRole('button', { name: 'Delete set' }));
    await removeExercise('Bench Press');

    // Removing the exercise sent the set's deletion at once.
    await waitFor(() => expect(squat.sets).toMatchObject([{ reps: 3 }]));
    expect(screen.queryByText('Set deleted.')).toBeNull();
    expect(screen.getByText('Exercise removed.')).toBeVisible();

    await fireEvent.press((await exerciseCard('Back Squat')).getByRole('button', { name: 'Edit set 1' }));
    await fireEvent.press((await exerciseCard('Back Squat')).getByRole('button', { name: 'Delete set' }));

    // And deleting a set sends the exercise's removal.
    await waitFor(() => expect(session.exercises).toHaveLength(1));
    expect(screen.queryByText('Exercise removed.')).toBeNull();
    expect(screen.getByText('Set deleted.')).toBeVisible();
  });

  it('leaves the workout in progress and empty once its only exercise is removed', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSet(fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat'), 140, 'kg', 5);
    await resumeWorkout(account.id);

    answerAlertWith('Remove');
    await removeExercise('Back Squat');

    expect(screen.queryAllByLabelText(/ card$/)).toEqual([]);
    expect(strip().queryAllByRole('tab')).toEqual([]);
    expect(await endWorkoutChoices()).toEqual(['Discard workout', 'Keep logging']);
    expect(screen.getByRole('button', { name: 'Add exercise' })).toBeVisible();
  });

  it('takes the other exercise of a superset of two out of it once one is removed, and Undo puts both back in it', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    const bench = fakeApi.addSessionExercise(session, 'Bench Press');
    const pulldown = fakeApi.addSessionExercise(session, 'Lat Pulldown');
    bench.supersetId = 'superset-1';
    pulldown.supersetId = 'superset-1';
    fakeApi.addSet(pulldown, 60, 'kg', 10);
    await resumeWorkout(account.id);

    await removeExercise('Bench Press');

    expect(await exerciseCard('Lat Pulldown')).toBeTruthy();
    expect(screen.queryByLabelText(/^Superset of/)).toBeNull();
    expect(screen.queryByLabelText(/^Tiles of superset/)).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByLabelText('Superset of Bench Press and Lat Pulldown')).toBeVisible();
    expect(screen.getByLabelText('Tiles of superset of Bench Press and Lat Pulldown')).toBeVisible();

    await removeExercise('Bench Press');
    await finishWorkout();

    await findHeaderTitle('Workout finished');
    const [saved] = fakeApi.sessions(account.id);
    expect(saved.exercises).toMatchObject([{ exerciseId: pulldown.exerciseId, supersetId: null }]);
    expect(saved.exercises[0].sets).toMatchObject([{ weight: 60, reps: 10, supersetId: 'superset-1' }]);
  });

  it('puts the exercise left alone in a superset in a new one while its removal can still be undone', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    const bench = fakeApi.addSessionExercise(session, 'Bench Press');
    const pulldown = fakeApi.addSessionExercise(session, 'Lat Pulldown');
    bench.supersetId = 'superset-1';
    pulldown.supersetId = 'superset-1';
    fakeApi.addSessionExercise(session, 'Plank');
    await resumeWorkout(account.id);

    await removeExercise('Bench Press');
    await pressChip('Lat Pulldown', 'Superset');
    const picker = within(await screen.findByLabelText('Superset with Lat Pulldown'));
    await fireEvent.press(picker.getByRole('checkbox', { name: 'Plank' }));
    await fireEvent.press(picker.getByRole('button', { name: 'Group as superset' }));

    expect(await screen.findByLabelText('Tiles of superset of Lat Pulldown and Plank')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('drops an exercise removed from a superset of three from the superset', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    const members = ['Bench Press', 'Deadlift', 'Lat Pulldown'].map((name) =>
      fakeApi.addSessionExercise(session, name),
    );
    members.forEach((e) => (e.supersetId = 'superset-1'));
    await resumeWorkout(account.id);

    await removeExercise('Deadlift');

    expect(screen.getByLabelText('Superset of Bench Press and Lat Pulldown')).toBeVisible();
  });
});

describe('last time', () => {
  /** What each row's Last time cell shows, in order: last time's Set at that place, or none. */
  function lastTimeCells(card: ExerciseCard) {
    return readouts(card.getAllByLabelText(/^Set \d+ last time$/));
  }

  /** A finished Session of Bench Press, a day ago, with these Sets. */
  function benchedYesterday(accountId: string, sets: [number, 'kg' | 'lb', number, (number | null)?][]) {
    const earlier = fakeApi.addSession(accountId, new Date(Date.now() - 86_400_000));
    const bench = fakeApi.addSessionExercise(earlier, 'Bench Press');
    for (const [weight, unit, reps, rpe = null] of sets) fakeApi.addSet(bench, weight, unit, reps, '', rpe);
    fakeApi.finishSession(earlier, new Date(Date.now() - 86_400_000 + 3_600_000));
  }

  it("shows last time's sets beside today's, starts a row from each, and each row added from the row above", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    benchedYesterday(account.id, [
      [60, 'kg', 10, 7],
      [62.5, 'kg', 8],
    ]);
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    await resumeWorkout(account.id);
    const card = await exerciseCard('Bench Press');

    expect(card.getByText('PREV')).toBeVisible();
    expect(lastTimeCells(card)).toEqual(['60 kg × 10 @ RPE 7', '62.5 kg × 8']);
    expect(card.getByText('60 × 10')).toBeVisible();
    expect(card.getByText('@ 7')).toBeVisible();
    // Each row starts as last time's Set, but not its RPE: that's how it felt.
    expect(rowsToDoHold(card)).toEqual(['1 60×10', '2 62.5×8']);
    expect(within(card.getByRole('button', { name: 'Set 1 RPE' })).getByText('–')).toBeVisible();

    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
    // Last time's set 1 again ties the best before: silver.
    await waitFor(() => expect(loggedSets(card)).toEqual(['60 kg × 10, Silver']));

    // The logged set keeps its Last time.
    expect(lastTimeCells(card)).toEqual(['60 kg × 10 @ RPE 7', '62.5 kg × 8']);
    expect(rowsToDoHold(card)).toEqual(['2 62.5×8']);

    // Tapping Last time puts its weight and reps into the row, keeping the RPE picked.
    await fireEvent.changeText(card.getByLabelText('Set 2 weight (kg)'), '65');
    await fireEvent.changeText(card.getByLabelText('Set 2 reps'), '6');
    await fireEvent.press(card.getByRole('button', { name: 'Set 2 RPE' }));
    await fireEvent.press(within(screen.getByLabelText('Set 2 RPE options')).getByRole('radio', { name: '9' }));
    await fireEvent.press(card.getByRole('button', { name: 'Set 2 last time' }));
    expect(card.getByLabelText('Set 2 weight (kg)')).toHaveDisplayValue('62.5');
    expect(card.getByLabelText('Set 2 reps')).toHaveDisplayValue('8');
    expect(within(card.getByRole('button', { name: 'Set 2 RPE' })).getByText('9')).toBeVisible();

    // A row added follows the row above, and last time had no set there.
    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    expect(lastTimeCells(card)).toEqual(['60 kg × 10 @ RPE 7', '62.5 kg × 8', 'None']);
    expect(card.getByLabelText('Set 3 weight (kg)')).toHaveDisplayValue('62.5');
    expect(card.getByLabelText('Set 3 reps')).toHaveDisplayValue('8');
    await fireEvent.changeText(card.getByLabelText('Set 2 weight (kg)'), '65');
    expect(card.getByLabelText('Set 3 weight (kg)')).toHaveDisplayValue('65');
  });

  it("lines up the rows left with their own last time's sets once a row is removed", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    benchedYesterday(account.id, [
      [100, 'kg', 5],
      [90, 'kg', 6],
    ]);
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    await resumeWorkout(account.id);
    const card = await exerciseCard('Bench Press');

    await removeRow(card, 1);
    expect(rowsToDoHold(card)).toEqual(['1 90×6']);
    expect(lastTimeCells(card)).toEqual(['90 kg × 6']);
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
    const card = await exerciseCard('Bench Press');

    expect(lastTimeCells(card)).toEqual(['220.5 lb × 6', '225 lb × 5', 'None']);
    for (const set of [1, 2, 3]) {
      expect(card.getByLabelText(`Set ${set} weight (lb)`)).toHaveDisplayValue('220.5');
      expect(card.getByLabelText(`Set ${set} reps`)).toHaveDisplayValue('6');
    }
  });
});

describe('removing a row still to do', () => {
  it('removes a planned row at once, and it stays gone after later sets are logged', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const squat = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    squat.target = { sets: 4, reps: 5, weight: 100, weightUnit: 'kg', restSeconds: null, note: '' };
    await resumeWorkout(account.id);
    const card = await exerciseCard('Back Squat');
    for (const [set, reps] of [
      [1, '5'],
      [2, '4'],
      [3, '3'],
      [4, '2'],
    ] as const) {
      await fireEvent.changeText(card.getByLabelText(`Set ${set} reps`), reps);
    }

    await removeRow(card, 2);
    // No confirmation and no Undo bar: the row holds nothing that can't be typed again.
    expect(alert).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    // What was typed stays with its row, and the rows renumber.
    expect(repsToDo(card)).toEqual(['5', '3', '2']);
    expect(card.getByRole('button', { name: 'Log set 3' })).toBeVisible();
    expect(card.queryByRole('button', { name: 'Log set 4' })).toBeNull();

    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
    await waitFor(() => expect(loggedSets(card)).toEqual(['100 kg × 5']));
    expect(repsToDo(card)).toEqual(['3', '2']);
    await fireEvent.press(card.getByRole('button', { name: 'Log set 2' }));
    await waitFor(() => expect(loggedSets(card)).toHaveLength(2));
    expect(repsToDo(card)).toEqual(['2']);
    expect(squat.sets).toHaveLength(2);
  });

  it("keeps a row's own state with it when a row above it is removed", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const squat = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    squat.target = { sets: 4, reps: 5, weight: 100, weightUnit: 'kg', restSeconds: null, note: '' };
    await resumeWorkout(account.id);
    const card = await exerciseCard('Back Squat');
    for (const [set, reps] of [
      [1, '5'],
      [2, '4'],
      [3, '3'],
      [4, '2'],
    ] as const) {
      await fireEvent.changeText(card.getByLabelText(`Set ${set} reps`), reps);
    }
    server.use(
      http.post(
        '*/sets',
        () => HttpResponse.json({ error: { code: 'unavailable', message: 'Try again later.' } }, { status: 503 }),
        { once: true },
      ),
    );
    await fireEvent.press(card.getByRole('button', { name: 'Log set 3' }));
    expect(card.getByRole('alert')).toHaveTextContent('Try again later.');

    // Set 3's error moves up with it to set 2, so removing the last row leaves it.
    await removeRow(card, 1);
    await removeRow(card, 3);
    expect(repsToDo(card)).toEqual(['4', '3']);
    expect(card.getByRole('alert')).toHaveTextContent('Try again later.');
    await removeRow(card, 2);
    expect(card.queryByRole('alert')).toBeNull();
  });

  it('removes a row added with + Add set, and removing every row leaves only + Add set', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Deadlift');
    await resumeWorkout(account.id);
    const card = await exerciseCard('Deadlift');
    await fireEvent.changeText(card.getByLabelText('Set 1 reps'), '5');
    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    await fireEvent.changeText(card.getByLabelText('Set 2 reps'), '3');

    await removeRow(card, 2);
    expect(repsToDo(card)).toEqual(['5']);
    await removeRow(card, 1);
    expect(rowsToDo(card)).toBe(0);
    expect(card.getByRole('button', { name: '+ Add set' })).toBeVisible();

    // A row added after starts afresh.
    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    expect(repsToDo(card)).toEqual(['']);
  });
});

describe('rows still to do with no Target', () => {
  it('shows one row until a set is logged, then only the rows added with + Add set', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Deadlift');
    await resumeWorkout(account.id);
    const card = await exerciseCard('Deadlift');
    expect(rowsToDo(card)).toBe(1);

    await fireEvent.changeText(card.getByLabelText('Set 1 weight (kg)'), '140');
    await fireEvent.changeText(card.getByLabelText('Set 1 reps'), '3');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
    await waitFor(() => expect(loggedSets(card)).toEqual(['140 kg × 3']));
    expect(rowsToDo(card)).toBe(0);

    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    expect(rowsToDo(card)).toBe(2);
    await fireEvent.press(card.getByRole('button', { name: 'Log set 2' }));
    await waitFor(() => expect(loggedSets(card)).toHaveLength(2));
    expect(rowsToDo(card)).toBe(1);
    await fireEvent.press(card.getByRole('button', { name: 'Log set 3' }));
    await waitFor(() => expect(loggedSets(card)).toHaveLength(3));
    expect(rowsToDo(card)).toBe(0);
  });

  it('keeps the row for the first set once a warm-up is logged', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Deadlift');
    await resumeWorkout(account.id);
    const card = await exerciseCard('Deadlift');

    await chooseSetType(card, 1, 'Warm-up');
    await fireEvent.changeText(card.getByLabelText('Set 1 weight (kg)'), '60');
    await fireEvent.changeText(card.getByLabelText('Set 1 reps'), '5');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
    await waitFor(() => expect(loggedSets(card)).toEqual(['60 kg × 5, Warm-up']));
    expect(rowsToDo(card)).toBe(1);
    expect(card.getByRole('button', { name: 'Log set 2' })).toBeVisible();
  });

  it('shows no row on resuming once a set is logged', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSet(fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Deadlift'), 140, 'kg', 3);
    await resumeWorkout(account.id);
    const card = await exerciseCard('Deadlift');

    expect(loggedSets(card)).toEqual(['140 kg × 3']);
    expect(rowsToDo(card)).toBe(0);
    expect(card.getByRole('button', { name: '+ Add set' })).toBeVisible();
  });

  it("doesn't bring the row back once the only set is deleted", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Deadlift');
    await resumeWorkout(account.id);
    const card = await exerciseCard('Deadlift');
    await logFirstSet(card, '140', '3');

    await swipeLeft(card.getByRole('button', { name: 'Edit set 1' }));
    await fireEvent.press(card.getByRole('button', { name: 'Delete set 1' }));
    expect(loggedSets(card)).toEqual([]);
    expect(rowsToDo(card)).toBe(0);

    // Undo brings back the Set, and no row below it.
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(loggedSets(card)).toEqual(['140 kg × 3']);
    expect(rowsToDo(card)).toBe(0);
  });

  it('adds a row for set 1 with + Add set once the only set, logged before resuming, is deleted', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSet(fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Deadlift'), 140, 'kg', 3);
    await resumeWorkout(account.id);
    const card = await exerciseCard('Deadlift');

    await swipeLeft(card.getByRole('button', { name: 'Edit set 1' }));
    await fireEvent.press(card.getByRole('button', { name: 'Delete set 1' }));
    expect(rowsToDo(card)).toBe(0);

    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    expect(rowsToDo(card)).toBe(1);
    await logFirstSet(card, '150', '2');
    expect(loggedSets(card)).toEqual(['150 kg × 2']);
    expect(rowsToDo(card)).toBe(0);
  });

  it('leaves no rows once every set is deleted', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Deadlift');
    await resumeWorkout(account.id);
    const card = await exerciseCard('Deadlift');
    await logFirstSet(card, '140', '3');
    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    await fireEvent.press(card.getByRole('button', { name: 'Log set 2' }));
    await waitFor(() => expect(loggedSets(card)).toHaveLength(2));

    // Deleting a second Set sends the first one's pending deletion.
    await swipeLeft(card.getByRole('button', { name: 'Edit set 2' }));
    await fireEvent.press(card.getByRole('button', { name: 'Delete set 2' }));
    await swipeLeft(card.getByRole('button', { name: 'Edit set 1' }));
    await fireEvent.press(card.getByRole('button', { name: 'Delete set 1' }));
    await waitFor(() => expect(loggedSets(card)).toEqual([]));
    expect(rowsToDo(card)).toBe(0);
  });

  it("doesn't bring the row back once the only set is made a warm-up", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Deadlift');
    await resumeWorkout(account.id);
    const card = await exerciseCard('Deadlift');
    await logFirstSet(card, '140', '3');

    await chooseSetType(card, 1, 'Warm-up');
    await waitFor(() => expect(loggedSets(card)).toEqual(['140 kg × 3, Warm-up']));
    expect(rowsToDo(card)).toBe(0);
  });
});

/** Types weight and reps into a card's row for set 1 and logs it. */
async function logFirstSet(card: ReturnType<typeof within>, weight: string, reps: string) {
  await fireEvent.changeText(card.getByLabelText('Set 1 weight (kg)'), weight);
  await fireEvent.changeText(card.getByLabelText('Set 1 reps'), reps);
  await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
  await waitFor(() => expect(loggedSets(card)).toHaveLength(1));
}

describe('deleting a set with a Target', () => {
  it('brings back the planned row', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const squat = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    squat.target = { sets: 3, reps: 5, weight: 100, weightUnit: 'kg', restSeconds: null, note: '' };
    fakeApi.addSet(squat, 100, 'kg', 5);
    await resumeWorkout(account.id);
    const card = await exerciseCard('Back Squat');
    expect(rowsToDo(card)).toBe(2);

    await swipeLeft(card.getByRole('button', { name: 'Edit set 1' }));
    await fireEvent.press(card.getByRole('button', { name: 'Delete set 1' }));
    expect(loggedSets(card)).toEqual([]);
    expect(rowsToDo(card)).toBe(3);
  });
});

describe('rows still to do without last time', () => {
  it('starts each row from the row above, including what was typed in it', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    await resumeWorkout(account.id);
    const card = await exerciseCard('Back Squat');

    await fireEvent.changeText(card.getByLabelText('Set 1 weight (kg)'), '60');
    await fireEvent.changeText(card.getByLabelText('Set 1 reps'), '10');
    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));

    expect(card.getByLabelText('Set 2 weight (kg)')).toHaveDisplayValue('60');
    expect(card.getByLabelText('Set 2 reps')).toHaveDisplayValue('10');
  });

  it('starts the next row from the set just done, not the Target', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const squat = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    squat.target = { sets: 3, reps: 5, weight: 100, weightUnit: 'kg', restSeconds: null, note: '' };
    await resumeWorkout(account.id);
    const card = await exerciseCard('Back Squat');

    expect(card.getByLabelText('Set 1 weight (kg)')).toHaveDisplayValue('100');
    expect(card.getByLabelText('Set 1 reps')).toHaveDisplayValue('5');
    await fireEvent.changeText(card.getByLabelText('Set 1 reps'), '4');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
    await waitFor(() => expect(loggedSets(card)).toEqual(['100 kg × 4']));

    for (const set of [2, 3]) {
      expect(card.getByLabelText(`Set ${set} weight (kg)`)).toHaveDisplayValue('100');
      expect(card.getByLabelText(`Set ${set} reps`)).toHaveDisplayValue('4');
    }
  });

  it("doesn't start a working row from a warm-up", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    await resumeWorkout(account.id);
    const card = await exerciseCard('Back Squat');

    await chooseSetType(card, 1, 'Warm-up');
    await fireEvent.changeText(card.getByLabelText('Set 1 weight (kg)'), '60');
    await fireEvent.changeText(card.getByLabelText('Set 1 reps'), '8');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
    await waitFor(() => expect(loggedSets(card)).toEqual(['60 kg × 8, Warm-up']));
    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));

    for (const set of [2, 3]) {
      expect(card.getByLabelText(`Set ${set} weight (kg)`)).toHaveDisplayValue('');
      expect(card.getByLabelText(`Set ${set} reps`)).toHaveDisplayValue('');
    }
  });

  it('starts a working row from the working row above a warm-up row, not the warm-up', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    await resumeWorkout(account.id);
    const card = await exerciseCard('Back Squat');

    // A warm-up row at the top gives the row below nothing to start from.
    await chooseSetType(card, 1, 'Warm-up');
    await fireEvent.changeText(card.getByLabelText('Set 1 weight (kg)'), '60');
    await fireEvent.changeText(card.getByLabelText('Set 1 reps'), '8');
    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    expect(card.getByLabelText('Set 2 weight (kg)')).toHaveDisplayValue('');
    expect(card.getByLabelText('Set 2 reps')).toHaveDisplayValue('');

    // Past a warm-up row in the middle, a working row repeats the working row above it.
    await fireEvent.changeText(card.getByLabelText('Set 2 weight (kg)'), '100');
    await fireEvent.changeText(card.getByLabelText('Set 2 reps'), '5');
    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    await chooseSetType(card, 3, 'Warm-up');
    await fireEvent.changeText(card.getByLabelText('Set 3 weight (kg)'), '70');
    await fireEvent.changeText(card.getByLabelText('Set 3 reps'), '3');
    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    expect(card.getByLabelText('Set 4 weight (kg)')).toHaveDisplayValue('100');
    expect(card.getByLabelText('Set 4 reps')).toHaveDisplayValue('5');
  });

  it("doesn't start a drop row from a warm-up", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    await resumeWorkout(account.id);
    const card = await exerciseCard('Back Squat');

    // Logged: a warm-up, then a normal Set. A drop row after a warm-up row
    // still to do starts from the normal Set, not the warm-up.
    await chooseSetType(card, 1, 'Warm-up');
    await fireEvent.changeText(card.getByLabelText('Set 1 weight (kg)'), '60');
    await fireEvent.changeText(card.getByLabelText('Set 1 reps'), '8');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
    await waitFor(() => expect(loggedSets(card)).toEqual(['60 kg × 8, Warm-up']));
    await fireEvent.changeText(card.getByLabelText('Set 2 weight (kg)'), '100');
    await fireEvent.changeText(card.getByLabelText('Set 2 reps'), '5');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 2' }));
    await waitFor(() => expect(loggedSets(card)).toEqual(['60 kg × 8, Warm-up', '100 kg × 5']));

    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    await chooseSetType(card, 3, 'Warm-up');
    await fireEvent.changeText(card.getByLabelText('Set 3 weight (kg)'), '70');
    await fireEvent.changeText(card.getByLabelText('Set 3 reps'), '3');
    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    await chooseSetType(card, 4, 'Drop');
    expect(card.getByLabelText('Set 4 weight (kg)')).toHaveDisplayValue('100');
    expect(card.getByLabelText('Set 4 reps')).toHaveDisplayValue('5');
  });
});

describe('last time across a swap', () => {
  function lastTimeCells(card: ExerciseCard) {
    return readouts(card.getAllByLabelText(/^Set \d+ last time$/));
  }

  /**
   * A finished Session a day ago of Bench Press, 60×10, 62.5×8, 65×6, and
   * Dumbbell Bench Press, 30×10, 32×8; then today's, with Bench Press on a
   * Target of targetSets × 5 at 60 kg that can swap to Dumbbell Bench Press.
   */
  async function benchToday(targetSets: number) {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const earlier = fakeApi.addSession(account.id, new Date(Date.now() - 86_400_000));
    const benchBefore = fakeApi.addSessionExercise(earlier, 'Bench Press');
    for (const [weight, reps] of [
      [60, 10],
      [62.5, 8],
      [65, 6],
    ])
      fakeApi.addSet(benchBefore, weight, 'kg', reps);
    const dumbbellsBefore = fakeApi.addSessionExercise(earlier, 'Dumbbell Bench Press');
    for (const [weight, reps] of [
      [30, 10],
      [32, 8],
    ])
      fakeApi.addSet(dumbbellsBefore, weight, 'kg', reps);
    fakeApi.finishSession(earlier, new Date(Date.now() - 86_400_000 + 3_600_000));
    const bench = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    bench.target = { sets: targetSets, reps: 5, weight: 60, weightUnit: 'kg', restSeconds: null, note: '' };
    bench.plannedExerciseId = bench.exerciseId;
    bench.substituteIds = [fakeApi.exerciseNamed('Dumbbell Bench Press').id];
    await resumeWorkout(account.id);
  }

  it("starts the Exercise swapped to at its own set 1, and shows no last time for the other's Sets", async () => {
    await benchToday(3);
    const bench = await exerciseCard('Bench Press');
    await logSet(bench, 1);
    await logSet(bench, 2);

    const card = await swap('Bench Press', 'Dumbbell Bench Press');
    // The Target still counts the Bench Press Sets: one row left.
    expect(rowsToDo(card)).toBe(1);
    expect(lastTimeCells(card)).toEqual(['None', 'None', '30 kg × 10']);
    expect(card.getByLabelText('Set 3 weight (kg)')).toHaveDisplayValue('30');
    expect(card.getByLabelText('Set 3 reps')).toHaveDisplayValue('10');
  });

  it("carries on where an Exercise's Sets left off after a Swap back", async () => {
    await benchToday(4);
    const bench = await exerciseCard('Bench Press');
    await logSet(bench, 1);
    await logSet(bench, 2);
    const dumbbells = await swap('Bench Press', 'Dumbbell Bench Press');
    await logSet(dumbbells, 3);

    const card = await swap('Dumbbell Bench Press', 'Bench Press');
    expect(rowsToDo(card)).toBe(1);
    // The Bench Press rows show its Last time again, the Dumbbell one none,
    // and the next row lines up with Bench Press's set 3.
    expect(lastTimeCells(card)).toEqual(['60 kg × 10', '62.5 kg × 8', 'None', '65 kg × 6']);
    // It starts from the last Bench Press Set logged, not last time's set 3.
    expect(card.getByLabelText('Set 4 weight (kg)')).toHaveDisplayValue('60');
    expect(card.getByLabelText('Set 4 reps')).toHaveDisplayValue('10');
  });
});

describe('set numbers across a swap', () => {
  /** What marks each row of a card's set table, logged then still to do: a number, or a type's letter. */
  function marks(card: ExerciseCard): string[] {
    return card
      .getAllByRole('button', { name: /^Set \d+ type$/ })
      .map((mark) => within(mark).getByText(/^(W|F|D|\d+)$/).props.children);
  }

  /** Today's Session, with Bench Press on a Target of targetSets × 5 at 60 kg that can swap to Dumbbell Bench Press. */
  async function benchToday(targetSets: number) {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    const bench = fakeApi.addSessionExercise(session, 'Bench Press');
    bench.target = { sets: targetSets, reps: 5, weight: 60, weightUnit: 'kg', restSeconds: null, note: '' };
    bench.plannedExerciseId = bench.exerciseId;
    bench.substituteIds = [fakeApi.exerciseNamed('Dumbbell Bench Press').id];
    await resumeWorkout(account.id);
    return session;
  }

  it('starts the Exercise swapped to at set 1, in the Session and the finished workout', async () => {
    const session = await benchToday(3);
    const bench = await exerciseCard('Bench Press');
    await logSet(bench, 1);
    await logSet(bench, 2);

    const card = await swap('Bench Press', 'Dumbbell Bench Press');
    // The Target counts the Bench Press Sets, leaving one row, the first Dumbbell Set.
    expect(rowsToDo(card)).toBe(1);
    expect(marks(card)).toEqual(['1', '2', '1']);
    // The Target's weight is Bench Press's, so the Dumbbell row starts without one.
    await fireEvent.changeText(card.getByLabelText('Set 3 weight (kg)'), '30');
    await logSet(card, 3);
    expect(marks(card)).toEqual(['1', '2', '1']);

    await finishWorkout();
    await findHeaderTitle('Workout finished');
    await openFinishedWorkout(session.id);
    const lines = ['Set 1', 'Set 2', 'Set 3'].map((name) => screen.getByLabelText(name));
    expect(lines.map((line) => within(line).getByText(/^\d+$/).props.children)).toEqual(['1', '2', '1']);
  });

  it("carries on an Exercise's numbers after a Swap back", async () => {
    await benchToday(4);
    const bench = await exerciseCard('Bench Press');
    await logSet(bench, 1);
    await logSet(bench, 2);
    const dumbbells = await swap('Bench Press', 'Dumbbell Bench Press');
    await fireEvent.changeText(dumbbells.getByLabelText('Set 3 weight (kg)'), '30');
    await logSet(dumbbells, 3);

    const card = await swap('Dumbbell Bench Press', 'Bench Press');
    expect(rowsToDo(card)).toBe(1);
    expect(marks(card)).toEqual(['1', '2', '1', '3']);
  });
});

describe('replacing an exercise', () => {
  /** Picks name from the exercise picker, searching for it first. */
  async function pick(name: string) {
    const picker = within(screen.getByLabelText('Exercise picker'));
    await fireEvent.changeText(picker.getByLabelText('Search exercises'), name);
    await fireEvent.press(await picker.findByRole('button', { name }));
    await findHeaderTitle('Current workout');
  }

  it("replaces an exercise with no Substitutes with any from the picker, keeping its logged Sets' Exercise", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const earlier = fakeApi.addSession(account.id, new Date(Date.now() - 86_400_000));
    fakeApi.addSet(fakeApi.addSessionExercise(earlier, 'Incline Bench Press'), 80, 'kg', 6);
    fakeApi.finishSession(earlier, new Date(Date.now() - 86_400_000 + 3_600_000));
    const today = fakeApi.addSession(account.id);
    fakeApi.addSet(fakeApi.addSessionExercise(today, 'Bench Press'), 100, 'kg', 5);
    await resumeWorkout(account.id);

    await openExerciseMenuItem('Bench Press', 'Replace exercise');
    await findHeaderTitle('Replace exercise');
    await pick('Incline Bench Press');

    const card = await exerciseCard('Incline Bench Press');
    expect(tileNames()).toEqual(['Incline Bench Press']);
    // Added during the workout, it has no planned Exercise to be instead of.
    expect(card.queryByText(/^Instead of/)).toBeNull();
    // Set 1 was Bench Press, so only set 2 lines up with last time's Incline Bench Press.
    expect(readouts(card.getAllByLabelText(/^Set \d+ last time$/))).toEqual(['None', '80 kg × 6']);
    const [replaced] = today.exercises;
    expect(replaced.exerciseId).toBe(fakeApi.exerciseNamed('Incline Bench Press').id);
    expect(replaced.sets).toMatchObject([{ exerciseId: fakeApi.exerciseNamed('Bench Press').id, weight: 100 }]);
  });

  it('sends an exercise removal waiting out its Undo window before opening the picker', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const today = fakeApi.addSession(account.id);
    fakeApi.addSessionExercise(today, 'Plank');
    fakeApi.addSessionExercise(today, 'Bench Press');
    await resumeWorkout(account.id);
    await removeExercise('Plank');
    expect(await screen.findByText('Exercise removed.')).toBeVisible();

    await openExerciseMenuItem('Bench Press', 'Replace exercise');
    await findHeaderTitle('Replace exercise');

    expect(today.exercises.map((e) => e.exerciseId)).toEqual([fakeApi.exerciseNamed('Bench Press').id]);
  });

  it('reaches the picker from the Swap sheet, keeping the Target but not its weight', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const today = fakeApi.addSession(account.id);
    const bench = fakeApi.addSessionExercise(today, 'Bench Press');
    bench.target = { sets: 3, reps: 5, weight: 100, weightUnit: 'kg', restSeconds: null, note: '' };
    bench.plannedExerciseId = bench.exerciseId;
    bench.substituteIds = [fakeApi.exerciseNamed('Dumbbell Bench Press').id];
    await resumeWorkout(account.id);

    await openSwapSheet('Bench Press');
    await fireEvent.press(
      within(await screen.findByLabelText('Substitutes for Bench Press')).getByRole('button', {
        name: 'Any other exercise…',
      }),
    );
    await findHeaderTitle('Replace exercise');
    await pick('Overhead Press');

    const card = await exerciseCard('Overhead Press');
    expect(card.getByText('Instead of Bench Press')).toBeVisible();
    expect(card.getByText('Set 1 of 3 · 5 reps')).toBeVisible();
    expect(today.exercises[0].exerciseId).toBe(fakeApi.exerciseNamed('Overhead Press').id);
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

  function lastTimeCells(card: ExerciseCard) {
    return readouts(card.getAllByLabelText(/^Set \d+ last time$/));
  }

  it("starts with last time's warm-ups before its first set, and lines up warm-ups and numbered sets apart", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    benchedYesterday(account.id);
    const bench = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    bench.target = { sets: 3, reps: 5, weight: 100, weightUnit: 'kg', restSeconds: null, note: '' };
    await resumeWorkout(account.id);
    const card = await exerciseCard('Bench Press');

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

  it('removes the warm-up row swiped, and the others keep their places and last time', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    benchedYesterday(account.id);
    const bench = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    bench.target = { sets: 3, reps: 5, weight: 100, weightUnit: 'kg', restSeconds: null, note: '' };
    await resumeWorkout(account.id);
    const card = await exerciseCard('Bench Press');

    await removeRow(card, 1);
    expect(rowsToDoHold(card)).toEqual(['W 80×3', '1 100×5', '2 100×5', '3 100×5']);
    expect(lastTimeCells(card)).toEqual(['80 kg × 3', '100 kg × 5', '102.5 kg × 5', '105 kg × 4']);

    // Logging the warm-up left doesn't bring back the one removed.
    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
    await waitFor(() => expect(loggedSets(card)).toEqual(['80 kg × 3, Warm-up']));
    expect(rowsToDoHold(card)).toEqual(['1 100×5', '2 100×5', '3 100×5']);
    expect(lastTimeCells(card)).toEqual(['80 kg × 3', '100 kg × 5', '102.5 kg × 5', '105 kg × 4']);
  });

  it('leaves only + Add set once every row, warm-ups and planned, is removed', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    benchedYesterday(account.id);
    const bench = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    bench.target = { sets: 3, reps: 5, weight: 100, weightUnit: 'kg', restSeconds: null, note: '' };
    await resumeWorkout(account.id);
    const card = await exerciseCard('Bench Press');
    await fireEvent.changeText(card.getByLabelText('Set 3 reps'), '6');

    // The last warm-up goes; what was typed in set 1 stays with it.
    await removeRow(card, 2);
    expect(rowsToDoHold(card)).toEqual(['W 60×8', '1 100×6', '2 100×6', '3 100×6']);
    for (const n of [4, 3, 2, 1]) await removeRow(card, n);
    expect(rowsToDo(card)).toBe(0);
    expect(card.getByRole('button', { name: '+ Add set' })).toBeVisible();
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

    let card = await swap('Bench Press', 'Dumbbell Bench Press');
    expect(rowsToDoHold(card)).toEqual(['W 20×10', 'W 25×8', '1 30×10', '2 30×10', '3 30×10']);
    card = await swap('Dumbbell Bench Press', 'Bench Press');
    expect(rowsToDoHold(card)).toEqual(['W 60×8', 'W 80×3', '1 100×5', '2 100×5', '3 100×5']);

    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
    await waitFor(() => expect(loggedSets(card)).toEqual(['60 kg × 8, Warm-up']));
    card = await swap('Bench Press', 'Dumbbell Bench Press');
    expect(rowsToDoHold(card)).toEqual(['1 30×10', '2 30×10', '3 30×10']);
  });

  it("gives a freeform exercise a row for each of last time's sets, mid-Session warm-ups and drop sets too", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    benchedYesterday(account.id);
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    await resumeWorkout(account.id);
    const card = await exerciseCard('Bench Press');

    expect(rowsToDoHold(card)).toEqual(['W 60×8', 'W 80×3', '1 100×5', '2 102.5×5', 'W 50×5', 'D 70×10', '3 105×4']);
    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
    await waitFor(() => expect(loggedSets(card)).toEqual(['60 kg × 8, Warm-up']));
    expect(rowsToDoHold(card)).toEqual(['W 80×3', '1 100×5', '2 102.5×5', 'W 50×5', 'D 70×10', '3 105×4']);
  });

  it("logs a freeform exercise's rows in any order, and a row marked a warm-up by hand takes a warm-up place", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    benchedYesterday(account.id);
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    await resumeWorkout(account.id);
    const card = await exerciseCard('Bench Press');

    // Set 1 made a warm-up lines up with last time's third warm-up, from
    // mid-Session; the warm-up row after it with none, the next set with set 1.
    await chooseSetType(card, 3, 'Warm-up');
    expect(lastTimeCells(card)).toEqual([
      '60 kg × 8',
      '80 kg × 3',
      '50 kg × 5',
      '100 kg × 5',
      'None',
      'None',
      '102.5 kg × 5',
    ]);

    // Going straight to a working set leaves the warm-up rows, and the rows
    // below keep what was typed in them.
    await fireEvent.changeText(card.getByLabelText('Set 5 reps'), '6');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 4' }));
    // Last time's set 2 again ties the best before: silver.
    await waitFor(() => expect(loggedSets(card)).toEqual(['102.5 kg × 5, Silver']));
    expect(rowsToDoHold(card)).toEqual(['W 60×8', 'W 80×3', 'W 100×5', 'W 50×6', 'D 70×10', '2 105×4']);
  });
});

describe('rows still to do from last time with no Target', () => {
  /** A finished Session of Bench Press a day ago: W 60×8, 1: 100×5, 2: 100×5, D 80×8. */
  function benchedYesterday(accountId: string) {
    const earlier = fakeApi.addSession(accountId, new Date(Date.now() - 86_400_000));
    const bench = fakeApi.addSessionExercise(earlier, 'Bench Press');
    const sets: [number, number, FakeSetType][] = [
      [60, 8, 'warmup'],
      [100, 5, 'normal'],
      [100, 5, 'normal'],
      [80, 8, 'drop'],
    ];
    for (const [weight, reps, type] of sets) fakeApi.addSet(bench, weight, 'kg', reps, '', null, type);
    fakeApi.finishSession(earlier, new Date(Date.now() - 86_400_000 + 3_600_000));
  }

  async function benchToday() {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    benchedYesterday(account.id);
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    await resumeWorkout(account.id);
    return exerciseCard('Bench Press');
  }

  it("opens with a row for each of last time's sets, of its type and values, in order", async () => {
    const card = await benchToday();
    expect(rowsToDoHold(card)).toEqual(['W 60×8', '1 100×5', '2 100×5', 'D 80×8']);
  });

  it('opens with one empty row with no last time', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    await resumeWorkout(account.id);
    expect(rowsToDoHold(await exerciseCard('Bench Press'))).toEqual(['1 ×']);
  });

  it('uses up each row as it is logged, leaving none once all are', async () => {
    const card = await benchToday();
    await logSet(card, 1, 1);
    expect(rowsToDoHold(card)).toEqual(['1 100×5', '2 100×5', 'D 80×8']);
    await logSet(card, 2, 2);
    await logSet(card, 3, 3);
    expect(rowsToDoHold(card)).toEqual(['D 80×8']);
    await logSet(card, 4, 4);
    // Each 100 × 5 ties last time's best: silver.
    expect(loggedSets(card)).toEqual([
      '60 kg × 8, Warm-up',
      '100 kg × 5, Silver',
      '100 kg × 5, Silver',
      '80 kg × 8, Drop',
    ]);
    expect(rowsToDo(card)).toBe(0);
  });

  it("doesn't bring a row back once its set is deleted, and leaves the rows below as they were", async () => {
    const card = await benchToday();
    await fireEvent.changeText(card.getByLabelText('Set 3 reps'), '4');
    await logSet(card, 2, 1);
    expect(rowsToDoHold(card)).toEqual(['W 60×8', '2 100×4', 'D 80×8']);

    await swipeLeft(card.getByRole('button', { name: 'Edit set 1' }));
    await fireEvent.press(card.getByRole('button', { name: 'Delete set 1' }));
    expect(loggedSets(card)).toEqual([]);
    expect(rowsToDoHold(card)).toEqual(['W 60×8', '1 100×4', 'D 80×8']);
  });

  it("doesn't bring back a row used up by a set logged before resuming once it's deleted", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    benchedYesterday(account.id);
    const bench = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    fakeApi.addSet(bench, 60, 'kg', 8, '', null, 'warmup');
    await resumeWorkout(account.id);
    const card = await exerciseCard('Bench Press');
    expect(rowsToDoHold(card)).toEqual(['1 100×5', '2 100×5', 'D 80×8']);

    await swipeLeft(card.getByRole('button', { name: 'Edit set 1' }));
    await fireEvent.press(card.getByRole('button', { name: 'Delete set 1' }));
    expect(loggedSets(card)).toEqual([]);
    expect(rowsToDoHold(card)).toEqual(['1 100×5', '2 100×5', 'D 80×8']);
  });

  it('keeps a row removed by swipe gone as later sets are logged', async () => {
    const card = await benchToday();
    await removeRow(card, 2);
    expect(rowsToDoHold(card)).toEqual(['W 60×8', '1 100×5', 'D 80×8']);
    await logSet(card, 1, 1);
    await logSet(card, 2, 2);
    expect(rowsToDoHold(card)).toEqual(['D 80×8']);
  });

  it('plans the rows from the Target, not last time, with one', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const earlier = fakeApi.addSession(account.id, new Date(Date.now() - 86_400_000));
    const squatBefore = fakeApi.addSessionExercise(earlier, 'Back Squat');
    for (const reps of [5, 5, 5, 4, 3]) fakeApi.addSet(squatBefore, 100, 'kg', reps);
    fakeApi.finishSession(earlier, new Date(Date.now() - 86_400_000 + 3_600_000));
    const squat = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    squat.target = { sets: 3, reps: 5, weight: 100, weightUnit: 'kg', restSeconds: null, note: '' };
    await resumeWorkout(account.id);

    expect(rowsToDoHold(await exerciseCard('Back Squat'))).toEqual(['1 100×5', '2 100×5', '3 100×5']);
  });

  it("starts the rows over from the Exercise swapped to's last time", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    benchedYesterday(account.id);
    const earlier = fakeApi.addSession(account.id, new Date(Date.now() - 2 * 86_400_000));
    const dumbbellsBefore = fakeApi.addSessionExercise(earlier, 'Dumbbell Bench Press');
    fakeApi.addSet(dumbbellsBefore, 30, 'kg', 10);
    fakeApi.addSet(dumbbellsBefore, 32, 'kg', 8);
    fakeApi.finishSession(earlier, new Date(Date.now() - 2 * 86_400_000 + 3_600_000));
    const bench = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    bench.plannedExerciseId = bench.exerciseId;
    bench.substituteIds = [fakeApi.exerciseNamed('Dumbbell Bench Press').id];
    await resumeWorkout(account.id);
    await logSet(await exerciseCard('Bench Press'), 1, 1);

    expect(rowsToDoHold(await swap('Bench Press', 'Dumbbell Bench Press'))).toEqual(['1 30×10', '2 32×8']);
    // Back on Bench Press, the warm-up logged has used up its row.
    expect(rowsToDoHold(await swap('Dumbbell Bench Press', 'Bench Press'))).toEqual(['1 100×5', '2 100×5', 'D 80×8']);
  });
});

describe('one exercise at a time', () => {
  it('shows only the exercise whose tile is tapped, its bar highlighted', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    fakeApi.addSessionExercise(session, 'Back Squat');
    fakeApi.addSessionExercise(session, 'Bench Press');
    await resumeWorkout(account.id);

    expect(tileNames()).toEqual(['Back Squat', 'Bench Press']);
    expect(shownTile()).toBe('Back Squat');
    expect(screen.getByLabelText('Back Squat card')).toBeVisible();
    expect(screen.queryByLabelText('Bench Press card')).toBeNull();

    await showExercise('Bench Press');

    expect(shownTile()).toBe('Bench Press');
    expect(screen.getByLabelText('Bench Press card')).toBeVisible();
    expect(screen.queryByLabelText('Back Squat card')).toBeNull();
  });

  it('keeps its rows still to do, as typed, added and removed, while another exercise is shown', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    const squat = fakeApi.addSessionExercise(session, 'Back Squat');
    squat.target = { sets: 3, reps: 5, weight: 100, weightUnit: 'kg', restSeconds: null, note: '' };
    fakeApi.addSessionExercise(session, 'Bench Press');
    await resumeWorkout(account.id);

    let card = await exerciseCard('Back Squat');
    await fireEvent.changeText(card.getByLabelText('Set 1 reps'), '8');
    await removeRow(card, 2);
    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    // Each row after the first starts from the row above.
    expect(repsToDo(card)).toEqual(['8', '8', '8', '8']);

    await showExercise('Bench Press');
    card = await exerciseCard('Back Squat');

    // Planned 3, one removed, two added: 4 rows, the first as typed.
    expect(repsToDo(card)).toEqual(['8', '8', '8', '8']);
  });

  it('opens on the first exercise with a row still to do, ahead of ones whose Sets are done', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    const squat = fakeApi.addSessionExercise(session, 'Back Squat');
    squat.target = { sets: 1, reps: 5, weight: 140, weightUnit: 'kg', restSeconds: null, note: '' };
    fakeApi.addSet(squat, 140, 'kg', 5);
    // With no Target, the first numbered Set logged leaves no row.
    fakeApi.addSet(fakeApi.addSessionExercise(session, 'Deadlift'), 180, 'kg', 3);
    fakeApi.addSessionExercise(session, 'Bench Press');
    fakeApi.addSessionExercise(session, 'Plank');
    await resumeWorkout(account.id);

    expect(shownTile()).toBe('Bench Press');
    expect(screen.getByLabelText('Bench Press card')).toBeVisible();
  });

  it('opens on the first exercise once every one is done', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    fakeApi.addSet(fakeApi.addSessionExercise(session, 'Back Squat'), 140, 'kg', 5);
    fakeApi.addSet(fakeApi.addSessionExercise(session, 'Deadlift'), 180, 'kg', 3);
    await resumeWorkout(account.id);

    expect(shownTile()).toBe('Back Squat');
  });

  it('adds an exercise from the "+" tile and shows it', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    fakeApi.addSessionExercise(session, 'Back Squat');
    fakeApi.addSessionExercise(session, 'Deadlift');
    await resumeWorkout(account.id);

    await fireEvent.press(strip().getByRole('button', { name: 'Add exercise' }));
    await findHeaderTitle('Add exercise');
    const picker = within(screen.getByLabelText('Exercise picker'));
    await fireEvent.changeText(picker.getByLabelText('Search exercises'), 'plank');
    await fireEvent.press(await picker.findByRole('button', { name: 'Plank' }));

    await findHeaderTitle('Current workout');
    await waitFor(() => expect(tileNames()).toEqual(['Back Squat', 'Deadlift', 'Plank']));
    expect(shownTile()).toBe('Plank');
    expect(screen.getByLabelText('Plank card')).toBeVisible();
  });

  it('shows the next exercise once the one shown is removed, else the previous, and the removed one on undo', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    fakeApi.addSessionExercise(session, 'Back Squat');
    fakeApi.addSessionExercise(session, 'Bench Press');
    fakeApi.addSessionExercise(session, 'Plank');
    await resumeWorkout(account.id);

    await removeExercise('Bench Press');
    expect(shownTile()).toBe('Plank');
    expect(screen.getByLabelText('Plank card')).toBeVisible();

    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(tileNames()).toEqual(['Back Squat', 'Bench Press', 'Plank']);
    expect(shownTile()).toBe('Bench Press');
    expect(screen.getByLabelText('Bench Press card')).toBeVisible();

    // The last one shown goes back to the one before it.
    await removeExercise('Plank');
    expect(shownTile()).toBe('Bench Press');
  });

  it('leaves only the "+" tile once the only exercise is removed', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    await resumeWorkout(account.id);

    await removeExercise('Back Squat');

    expect(strip().queryAllByRole('tab')).toEqual([]);
    expect(strip().getByRole('button', { name: 'Add exercise' })).toBeVisible();
    expect(screen.queryAllByLabelText(/ card$/)).toEqual([]);
  });

  it("shows each Exercise's image on its tile, the one swapped to after a Swap, and none without one", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    const bench = fakeApi.addSessionExercise(session, 'Bench Press');
    bench.plannedExerciseId = bench.exerciseId;
    bench.substituteIds = [fakeApi.exerciseNamed('Dumbbell Bench Press').id];
    fakeApi.addSessionExercise(session, 'Plank');
    fakeApi.exerciseNamed('Bench Press').imageUrl = '/media/bench-press.png';
    fakeApi.exerciseNamed('Dumbbell Bench Press').imageUrl = '/media/dumbbell-bench-press.png';
    await resumeWorkout(account.id);

    const tileImage = (name: string) => within(strip().getByRole('tab', { name })).queryByRole('image');
    await waitFor(() => expect(tileImage('Bench Press')?.props.source.uri).toMatch(/\/media\/bench-press\.png$/));
    expect(tileImage('Plank')).toBeNull();

    await openSwapSheet('Bench Press');
    await fireEvent.press(
      within(await screen.findByLabelText('Substitutes for Bench Press')).getByRole('button', {
        name: 'Swap to Dumbbell Bench Press',
      }),
    );

    await waitFor(() =>
      expect(tileImage('Dumbbell Bench Press')?.props.source.uri).toMatch(/\/media\/dumbbell-bench-press\.png$/),
    );
  });
});

describe('the session header', () => {
  it('asks how to end the workout when Finish is pressed: finish, discard or keep logging', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSet(fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat'), 140, 'kg', 5);
    await resumeWorkout(account.id);

    expect(await endWorkoutChoices()).toEqual(['Finish workout', 'Discard workout', 'Keep logging']);
    expect(screen.getByLabelText('Back Squat card')).toBeVisible();
    expect(fakeApi.sessions(account.id)[0].finishedAt).toBeNull();
  });

  it('offers only Discard workout or Keep logging when nothing is logged', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    await resumeWorkout(account.id);

    expect(await endWorkoutChoices()).toEqual(['Discard workout', 'Keep logging']);
  });

  it('keeps the workout when Discard is answered with Keep logging', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    await resumeWorkout(account.id);

    await chooseDiscardWorkout('Keep logging');

    expect(screen.getByLabelText('Back Squat card')).toBeVisible();
    expect(fakeApi.sessions(account.id)).toHaveLength(1);
  });

  it('drops a Set deletion waiting out its Undo window when discarding, rather than sending it', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSet(fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat'), 140, 'kg', 5);
    await resumeWorkout(account.id);
    const card = await exerciseCard('Back Squat');
    await swipeLeft(card.getByRole('button', { name: 'Edit set 1' }));
    await fireEvent.press(card.getByRole('button', { name: 'Delete set 1' }));
    const sent: string[] = [];
    const listener = ({ request }: { request: Request }) => {
      sent.push(`${request.method} ${new URL(request.url).pathname}`);
    };
    server.events.on('request:start', listener);
    try {
      await chooseDiscardWorkout('Discard');
      await screen.findByRole('button', { name: 'Start Workout' });
    } finally {
      server.events.removeListener('request:start', listener);
    }

    expect(sent.filter((r) => r.includes('/sets/'))).toEqual([]);
    expect(fakeApi.sessions(account.id)).toEqual([]);
  });

  it('shows the time since the workout started, ticking, in place of "Started at"', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      await openWorkoutTab();
      await fireEvent.press(screen.getByRole('button', { name: 'Start Workout' }));
      await findHeaderTitle('Current workout');
      expect(screen.getByLabelText('Time since the workout started')).toHaveTextContent('0:00:00');
      expect(screen.queryByText(/^Started at/)).toBeNull();

      await act(async () => jest.advanceTimersByTime(65_000));
      expect(screen.getByLabelText('Time since the workout started')).toHaveTextContent('0:01:05');

      await act(async () => jest.advanceTimersByTime(3_600_000));
      expect(screen.getByLabelText('Time since the workout started')).toHaveTextContent('1:01:05');
    } finally {
      jest.useRealTimers();
    }
  });

  it('holds Finish, which can finish the workout once a Set is logged, and leaves nothing session-wide below the exercise', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const squat = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    squat.target = { sets: 3, reps: 5, weight: 100, weightUnit: 'kg', restSeconds: null, note: '' };
    await resumeWorkout(account.id);
    const header = sessionHeader();
    expect(await endWorkoutChoices()).not.toContain('Finish workout');

    await logSet(await exerciseCard('Back Squat'), 1);

    expect(await endWorkoutChoices()).toContain('Finish workout');
    // Logging a Set leaves the Rest timer to the User.
    expect(header.getByRole('button', { name: 'Rest timer' })).toHaveTextContent(/^⏱$/);
    // Finish and the Rest timer are each on screen once, in the header, and Discard is under Finish.
    expect(screen.getAllByRole('button', { name: 'Finish workout' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Discard workout' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Rest \d/ })).toBeNull();
    expect(header.getByRole('button', { name: 'Rest timer' })).toBeVisible();
    expect(header.queryByRole('button', { name: 'Workout menu' })).toBeNull();
  });
});

describe("the shown exercise's heading", () => {
  /** Today's Session, with Back Squat on a Target of targetSets × 5 at 100 kg and a slot note. */
  async function squatToday(targetSets: number) {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const squat = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    squat.target = { sets: targetSets, reps: 5, weight: 100, weightUnit: 'kg', restSeconds: null, note: 'Brace hard' };
    await resumeWorkout(account.id);
    return exerciseCard('Back Squat');
  }

  it("says which of the Target's Sets is next, with its reps and weight, and the slot note under it", async () => {
    const card = await squatToday(3);
    expect(card.getByText('Set 1 of 3 · 100 kg × 5')).toBeVisible();
    expect(card.getByText('Brace hard')).toBeVisible();

    await logSet(card, 1);

    expect(card.getByText('Set 2 of 3 · 100 kg × 5')).toBeVisible();
  });

  it('says the exercise is done once every planned Set is logged, and counts a Set added beyond the Target without "of"', async () => {
    const card = await squatToday(2);
    await logSet(card, 1);
    await logSet(card, 2);

    expect(card.getByText('2 of 2 done')).toBeVisible();

    await fireEvent.press(card.getByRole('button', { name: '+ Add set' }));
    expect(card.getByText('Set 3 · 100 kg × 5')).toBeVisible();
    await logSet(card, 3);
    expect(card.getByText('Set 4 · 100 kg × 5')).toBeVisible();
  });

  it("says how many of the Target's Sets were done once a planned row is removed and the rest logged", async () => {
    const card = await squatToday(3);
    await removeRow(card, 3);
    await logSet(card, 1);
    await logSet(card, 2);

    expect(rowsToDo(card)).toBe(0);
    expect(card.getByText('2 of 3 done')).toBeVisible();
  });

  it("counts only numbered Sets: logging a warm-up or a drop Set doesn't change it", async () => {
    const card = await squatToday(3);
    await chooseSetType(card, 1, 'Warm-up');
    await logSet(card, 1);
    expect(card.getByText('Set 1 of 3 · 100 kg × 5')).toBeVisible();

    await logSet(card, 2);
    await chooseSetType(card, 3, 'Drop');
    await logSet(card, 3);

    expect(card.getByText('Set 2 of 3 · 100 kg × 5')).toBeVisible();
  });

  it('says just "Set N" with no Target', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Back Squat');
    await resumeWorkout(account.id);
    const card = await exerciseCard('Back Squat');
    expect(card.getByText('Set 1')).toBeVisible();

    await fireEvent.changeText(card.getByLabelText('Set 1 weight (kg)'), '60');
    await fireEvent.changeText(card.getByLabelText('Set 1 reps'), '10');
    await logSet(card, 1);

    expect(card.getByText('Set 2')).toBeVisible();
  });

  it('shows what was planned under the name after a Swap, counting the Sets before it, with no weight', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const bench = fakeApi.addSessionExercise(fakeApi.addSession(account.id), 'Bench Press');
    bench.target = { sets: 3, reps: 5, weight: 100, weightUnit: 'kg', restSeconds: null, note: '' };
    bench.plannedExerciseId = bench.exerciseId;
    bench.substituteIds = [fakeApi.exerciseNamed('Dumbbell Bench Press').id];
    await resumeWorkout(account.id);
    await logSet(await exerciseCard('Bench Press'), 1);

    const card = await swap('Bench Press', 'Dumbbell Bench Press');

    expect(card.getByText('Instead of Bench Press')).toBeVisible();
    expect(card.getByText('Set 2 of 3 · 5 reps')).toBeVisible();
  });
});

describe("a tile's bar", () => {
  it('fills once every Set the Target plans is logged, and never without a Target', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    const squat = fakeApi.addSessionExercise(session, 'Back Squat');
    squat.target = { sets: 2, reps: 5, weight: 100, weightUnit: 'kg', restSeconds: null, note: '' };
    fakeApi.addSet(fakeApi.addSessionExercise(session, 'Deadlift'), 180, 'kg', 3);
    await resumeWorkout(account.id);
    expect(doneTiles()).toEqual([]);

    const card = await exerciseCard('Back Squat');
    await logSet(card, 1);
    expect(doneTiles()).toEqual([]);
    await logSet(card, 2);

    expect(doneTiles()).toEqual(['Back Squat']);
  });
});

describe("a Session exercise's chips", () => {
  it('shows Swap, Note, Superset and ⋯ in that order, in a row that scrolls sideways', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    const bench = fakeApi.addSessionExercise(session, 'Bench Press');
    bench.plannedExerciseId = bench.exerciseId;
    bench.substituteIds = [fakeApi.exerciseNamed('Dumbbell Bench Press').id];
    fakeApi.addSessionExercise(session, 'Plank');
    await resumeWorkout(account.id);

    await showExercise('Bench Press');

    expect(chipNames('Bench Press')).toEqual(['Swap', 'Note', 'Superset', 'More']);
    expect(screen.getByLabelText('Bench Press actions')).toHaveProp('horizontal', true);
    // They replace the card's old ⋯ menu, its inline note and the session-wide Create superset.
    expect(screen.queryByRole('button', { name: 'Bench Press options' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add exercise note' })).toBeNull();
    expect(screen.queryByLabelText('Exercise note')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create superset' })).toBeNull();
  });
});

describe('the Swap chip', () => {
  it('shows only for an exercise whose Exercise slot has Substitutes', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    fakeApi.addSessionExercise(session, 'Plank');
    const bench = fakeApi.addSessionExercise(session, 'Bench Press');
    bench.plannedExerciseId = bench.exerciseId;
    bench.substituteIds = [fakeApi.exerciseNamed('Dumbbell Bench Press').id];
    await resumeWorkout(account.id);

    await showExercise('Plank');
    expect(chipNames('Plank')).not.toContain('Swap');

    const card = await swap('Bench Press', 'Dumbbell Bench Press');
    expect(card.getByText('Instead of Bench Press')).toBeVisible();
    expect(chipNames('Dumbbell Bench Press')[0]).toBe('Swap');
  });
});

describe('the Note chip', () => {
  it('opens a sheet where Save stores the note and ✕ closes without saving', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    const bench = fakeApi.addSessionExercise(session, 'Bench Press');
    await resumeWorkout(account.id);
    // Alone in the workout, it has nothing to be a Superset with.
    expect(chipNames('Bench Press')).toEqual(['Note', 'More']);

    await pressChip('Bench Press', 'Note');
    let sheet = within(await screen.findByLabelText('Bench Press note'));
    expect(sheet.getByRole('header', { name: 'Note' })).toBeVisible();
    expect(sheet.getByText('0 / 500')).toBeVisible();
    await fireEvent.changeText(sheet.getByLabelText('Exercise note'), 'Bench 3 was free');
    expect(sheet.getByText('16 / 500')).toBeVisible();
    await fireEvent.press(sheet.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByLabelText('Bench Press note')).toBeNull());
    expect(bench.note).toBe('Bench 3 was free');

    await pressChip('Bench Press', 'Note');
    sheet = within(await screen.findByLabelText('Bench Press note'));
    expect(sheet.getByLabelText('Exercise note')).toHaveDisplayValue('Bench 3 was free');
    await fireEvent.changeText(sheet.getByLabelText('Exercise note'), 'Never mind');
    await fireEvent.press(sheet.getByRole('button', { name: 'Close' }));
    expect(screen.queryByLabelText('Bench Press note')).toBeNull();
    expect(bench.note).toBe('Bench 3 was free');

    // What was typed and not saved is gone the next time.
    await pressChip('Bench Press', 'Note');
    sheet = within(await screen.findByLabelText('Bench Press note'));
    expect(sheet.getByLabelText('Exercise note')).toHaveDisplayValue('Bench 3 was free');
  });
});
