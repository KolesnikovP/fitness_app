import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { fakeApi } from './support/fake-api';
import { findHeaderTitle, queryHeaderTitle } from './support/native-header';
import { secureStore } from './support/secure-store';
import { loggedSets } from './support/set-table';

/** Launches the app signed in as an onboarded kg user (made unless given), on the Workout tab. */
async function openWorkoutTab(accountId?: string) {
  const id = accountId ?? fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg').id;
  secureStore.set('auth-token', fakeApi.issueToken(id));
  await renderRouter('./src/app', { initialUrl: '/' });
  await screen.findByRole('header', { name: 'Workout' });
  return id;
}

/**
 * Adds a library exercise to the routine being built, through the picker
 * screen, and returns its slot once back on the editor.
 */
async function addSlot(search: string, name: string) {
  await fireEvent.press(screen.getByRole('button', { name: 'Add exercises' }));
  await findHeaderTitle('Add exercises');
  // Jest mounts every tab, so the Exercises tab's search is also on screen.
  const picker = within(screen.getByLabelText('Exercise picker'));
  await fireEvent.changeText(picker.getByLabelText('Search exercises'), search);
  await fireEvent.press(await picker.findByRole('checkbox', { name }));
  await fireEvent.press(screen.getByRole('button', { name: 'Add 1 exercise' }));
  return within(await screen.findByLabelText(`${name} slot`));
}

describe('routines', () => {
  it('builds a routine, starts a workout from it and logs sets against its targets', async () => {
    const accountId = await openWorkoutTab();
    expect(await screen.findByText('No routines yet.')).toBeVisible();

    await fireEvent.press(screen.getByRole('button', { name: 'New routine' }));
    await findHeaderTitle('New routine');
    await fireEvent.changeText(screen.getByLabelText('Routine name'), 'Push day');
    // Nothing to save until it has an exercise.
    expect(screen.getByRole('button', { name: 'Save routine' })).toBeDisabled();

    const bench = await addSlot('bench', 'Bench Press');
    await fireEvent.changeText(bench.getByLabelText('Sets'), '3');
    await fireEvent.changeText(bench.getByLabelText('Reps'), '5');
    await fireEvent.changeText(bench.getByLabelText('Weight (kg)'), '100');
    await fireEvent.press(bench.getByRole('button', { name: 'Rest' }));
    await fireEvent.press(within(screen.getByLabelText('Rest options')).getByRole('radio', { name: '3:00' }));
    await fireEvent.press(bench.getByRole('button', { name: 'Add note' }));
    await fireEvent.changeText(bench.getByLabelText('Note'), 'Pause on the chest');

    const press = await addSlot('overhead', 'Overhead Press');
    await fireEvent.changeText(press.getByLabelText('Sets'), '3');
    await fireEvent.changeText(press.getByLabelText('Reps'), '8');
    await fireEvent.changeText(press.getByLabelText('Weight (kg)'), '40');
    await fireEvent.press(screen.getByRole('button', { name: 'Save routine' }));

    await screen.findByRole('header', { name: 'Workout' });
    const list = within(await screen.findByLabelText('Routines'));
    expect(await list.findByText('Bench Press, Overhead Press')).toBeVisible();
    const [saved] = fakeApi.routines(accountId);
    expect(saved).toMatchObject({
      name: 'Push day',
      slots: [
        {
          targetSets: 3,
          targetReps: 5,
          targetWeight: 100,
          weightUnit: 'kg',
          restSeconds: 180,
          note: 'Pause on the chest',
        },
        { targetSets: 3, targetReps: 8, targetWeight: 40, weightUnit: 'kg', restSeconds: null },
      ],
    });

    await fireEvent.press(list.getByRole('button', { name: 'Push day' }));
    await findHeaderTitle('Push day');
    expect(screen.getByText('3 × 5 · 100 kg')).toBeVisible();
    expect(screen.getByText('Rest 3:00 · Pause on the chest')).toBeVisible();

    await fireEvent.press(screen.getByRole('button', { name: 'Start workout' }));

    await findHeaderTitle('Current workout');
    const benchCard = within(screen.getByLabelText('Bench Press card'));
    expect(benchCard.getByText('Target 3 × 5 · 100 kg')).toBeVisible();
    expect(benchCard.getByText('Pause on the chest')).toBeVisible();
    // A row for each planned set, at the target, ready to log as planned or adjust.
    for (const set of [1, 2, 3]) {
      expect(benchCard.getByLabelText(`Set ${set} weight (kg)`)).toHaveDisplayValue('100');
      expect(benchCard.getByLabelText(`Set ${set} reps`)).toHaveDisplayValue('5');
    }
    expect(benchCard.queryByLabelText('Set 4 reps')).toBeNull();
    // The planned rest is offered on the rest timer.
    expect(screen.getByRole('button', { name: 'Rest 3:00' })).toBeVisible();

    await fireEvent.press(benchCard.getByRole('button', { name: 'Log set 1' }));
    await waitFor(() => expect(loggedSets(benchCard)).toEqual(['100 kg × 5']));
    await fireEvent.changeText(benchCard.getByLabelText('Set 2 reps'), '4');
    await fireEvent.press(benchCard.getByRole('button', { name: 'Log set 2' }));
    await waitFor(() => expect(loggedSets(benchCard)).toEqual(['100 kg × 5', '100 kg × 4']));
    // One planned set left.
    expect(benchCard.getByLabelText('Set 3 reps')).toHaveDisplayValue('5');
    expect(benchCard.queryByLabelText('Set 4 reps')).toBeNull();

    const pressCard = within(screen.getByLabelText('Overhead Press card'));
    await fireEvent.changeText(pressCard.getByLabelText('Set 1 weight (kg)'), '42,5');
    await fireEvent.press(pressCard.getByRole('button', { name: 'Log set 1' }));
    await waitFor(() => expect(loggedSets(pressCard)).toEqual(['42.5 kg × 8']));
    // The next planned sets follow the weight just done.
    expect(pressCard.getByLabelText('Set 2 weight (kg)')).toHaveDisplayValue('42.5');
    // One more than planned.
    await fireEvent.press(pressCard.getByRole('button', { name: '+ Add set' }));
    expect(pressCard.getByLabelText('Set 4 reps')).toHaveDisplayValue('8');

    await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));

    // A workout from a routine is already one: no offer to save it as one.
    await screen.findByRole('header', { name: 'Workout' });
    expect(queryHeaderTitle('Workout finished')).toBeNull();
    await act(async () => router.navigate('/profile'));
    expect(
      await within(await screen.findByLabelText('Workouts')).findByText('Bench Press, Overhead Press'),
    ).toBeVisible();
    const [session] = fakeApi.sessions(accountId);
    expect(session.routineId).toBe(saved.id);
    expect(session.finishedAt).not.toBeNull();
    expect(session.exercises.map((e) => e.sets.map((s) => [s.weight, s.reps]))).toEqual([
      [
        [100, 5],
        [100, 4],
      ],
      [[42.5, 8]],
    ]);
  });

  it('plans substitutes for a slot, and swaps to one mid-workout without changing the routine', async () => {
    const accountId = await openWorkoutTab();
    await fireEvent.press(await screen.findByRole('button', { name: 'New routine' }));
    await fireEvent.changeText(await screen.findByLabelText('Routine name'), 'Push day');
    let bench = await addSlot('bench', 'Bench Press');
    await fireEvent.changeText(bench.getByLabelText('Reps'), '5');
    await fireEvent.changeText(bench.getByLabelText('Weight (kg)'), '100');

    // Picked from the library, starting at exercises for the same muscles.
    await fireEvent.press(bench.getByRole('button', { name: 'Add substitutes' }));
    await findHeaderTitle('Add substitutes');
    const picker = within(screen.getByLabelText('Exercise picker'));
    expect(picker.getByRole('radio', { name: 'Chest' })).toBeChecked();
    await waitFor(() =>
      expect(picker.getAllByRole('checkbox').map((item) => item.props.accessibilityLabel)).toEqual([
        // Not Bench Press itself.
        'Dumbbell Bench Press',
        'Incline Bench Press',
        'Push-up',
      ]),
    );
    await fireEvent.press(picker.getByRole('checkbox', { name: 'Push-up' }));
    await fireEvent.press(picker.getByRole('checkbox', { name: 'Dumbbell Bench Press' }));
    // Anything else in the library, with the filter cleared.
    await fireEvent.press(picker.getByRole('radio', { name: 'Chest' }));
    expect(await picker.findByRole('checkbox', { name: 'Deadlift' })).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Add 2 substitutes' }));

    // Back on the editor, in the order picked.
    bench = within(await screen.findByLabelText('Bench Press slot'));
    expect(bench.getByLabelText('Substitutes').props.accessibilityValue).toEqual({
      text: 'Push-up and Dumbbell Bench Press',
    });
    // Dumbbell Bench Press is the better fallback: first in line.
    await fireEvent.press(bench.getByRole('button', { name: 'Move Dumbbell Bench Press up' }));
    expect(bench.getByLabelText('Substitutes').props.accessibilityValue).toEqual({
      text: 'Dumbbell Bench Press and Push-up',
    });
    // The ones already picked aren't offered again.
    await fireEvent.press(bench.getByRole('button', { name: 'Add substitutes' }));
    const again = within(await screen.findByLabelText('Exercise picker'));
    await waitFor(() =>
      expect(again.getAllByRole('checkbox').map((item) => item.props.accessibilityLabel)).toEqual([
        'Incline Bench Press',
      ]),
    );
    await act(async () => router.back());
    bench = within(await screen.findByLabelText('Bench Press slot'));

    await fireEvent.press(screen.getByRole('button', { name: 'Save routine' }));
    await screen.findByRole('header', { name: 'Workout' });
    const [saved] = fakeApi.routines(accountId);
    const planned = structuredClone(saved.slots);
    expect(saved.slots[0].substituteIds).toEqual([
      fakeApi.exerciseNamed('Dumbbell Bench Press').id,
      fakeApi.exerciseNamed('Push-up').id,
    ]);

    await fireEvent.press(within(screen.getByLabelText('Routines')).getByRole('button', { name: 'Push day' }));
    await findHeaderTitle('Push day');
    expect(screen.getByText('Substitutes: Dumbbell Bench Press, Push-up')).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Start workout' }));

    await findHeaderTitle('Current workout');
    let card = within(screen.getByLabelText('Bench Press card'));
    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
    await waitFor(() => expect(loggedSets(card)).toEqual(['100 kg × 5']));

    // The bench is taken: Swap shows the substitutes, saying what they're for.
    expect(card.getByText('Equipment taken?')).toBeVisible();
    await fireEvent.press(card.getByRole('button', { name: 'Swap Bench Press' }));
    let sheet = within(await screen.findByLabelText('Substitutes for Bench Press'));
    expect(sheet.getByRole('header', { name: "Can't do Bench Press right now?" })).toBeVisible();
    expect(sheet.getByText('Doing now · Barbell')).toBeVisible();
    expect(await sheet.findByText('Substitute 1 · Dumbbell')).toBeVisible();
    expect(sheet.getByText('Substitute 2 · Bodyweight')).toBeVisible();
    await fireEvent.press(sheet.getByRole('button', { name: 'Swap to Dumbbell Bench Press' }));
    card = within(await screen.findByLabelText('Dumbbell Bench Press card'));
    expect(screen.queryByLabelText('Substitutes for Bench Press')).toBeNull();
    expect(card.getByText('Instead of Bench Press')).toBeVisible();
    // The set already logged keeps the exercise it was done with; each
    // exercise's sets are labelled, the rows still to do too.
    const runLabels = () =>
      within(card.getByLabelText('Sets'))
        .getAllByRole('header')
        .map((h) => h.props.children);
    expect(runLabels()).toEqual(['Bench Press', 'Dumbbell Bench Press']);
    // Back to the bench is a swap away, once it's free.
    await fireEvent.press(card.getByRole('button', { name: 'Swap Dumbbell Bench Press' }));
    sheet = within(await screen.findByLabelText('Substitutes for Bench Press'));
    expect(sheet.getByRole('header', { name: "Can't do Bench Press right now?" })).toBeVisible();
    expect(sheet.getByRole('button', { name: 'Swap to Bench Press' })).toBeVisible();
    await fireEvent.press(sheet.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Substitutes for Bench Press')).toBeNull();
    // The planned sets and reps still stand, but not the barbell's weight.
    expect(card.getByText('Target 3 × 5')).toBeVisible();
    expect(card.getByLabelText('Set 2 weight (kg)')).toHaveDisplayValue('');
    expect(card.getByLabelText('Set 2 reps')).toHaveDisplayValue('5');
    await fireEvent.changeText(card.getByLabelText('Set 2 weight (kg)'), '35');
    await fireEvent.changeText(card.getByLabelText('Set 2 reps'), '10');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 2' }));
    await waitFor(() => expect(loggedSets(card)).toEqual(['100 kg × 5', '35 kg × 10']));
    expect(runLabels()).toEqual(['Bench Press', 'Dumbbell Bench Press']);

    await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));
    await screen.findByRole('header', { name: 'Workout' });
    await act(async () => router.navigate('/profile'));
    expect(
      await within(await screen.findByLabelText('Workouts')).findByText('Bench Press, Dumbbell Bench Press'),
    ).toBeVisible();
    const [session] = fakeApi.sessions(accountId);
    expect(session.exercises[0].sets.map((set) => fakeApi.exerciseName(set.exerciseId))).toEqual([
      'Bench Press',
      'Dumbbell Bench Press',
    ]);

    // The routine still plans the bench, with the same substitutes.
    expect(fakeApi.routines(accountId)[0].slots).toEqual(planned);
    await act(async () => router.navigate('/workout'));
    await fireEvent.press(within(await screen.findByLabelText('Routines')).getByRole('button', { name: 'Push day' }));
    const plan = within(await screen.findByLabelText('Planned exercises'));
    expect(plan.getByText('Bench Press')).toBeVisible();
    expect(plan.queryByText('Dumbbell Bench Press')).toBeNull();
    expect(plan.getByText('Substitutes: Dumbbell Bench Press, Push-up')).toBeVisible();
  });

  it('adds several exercises at once, in the order they were picked', async () => {
    await openWorkoutTab();
    await fireEvent.press(await screen.findByRole('button', { name: 'New routine' }));
    await fireEvent.changeText(await screen.findByLabelText('Routine name'), 'Full body');
    // The editor doesn't list the library itself.
    expect(screen.queryByLabelText('Exercise picker')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Add exercises' }));
    await findHeaderTitle('Add exercises');
    const picker = within(screen.getByLabelText('Exercise picker'));
    expect(screen.getByRole('button', { name: 'Add exercises' })).toBeDisabled();
    await fireEvent.changeText(picker.getByLabelText('Search exercises'), 'press');
    await fireEvent.press(await picker.findByRole('checkbox', { name: 'Overhead Press' }));
    await fireEvent.press(picker.getByRole('checkbox', { name: 'Bench Press' }));
    await fireEvent.press(picker.getByRole('checkbox', { name: 'Bench Press' })); // Changed their mind.
    // Picks are kept while searching for the next one.
    await fireEvent.changeText(picker.getByLabelText('Search exercises'), 'squat');
    await fireEvent.press(await picker.findByRole('checkbox', { name: 'Back Squat' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add 2 exercises' }));

    await findHeaderTitle('New routine');
    // The name typed before picking is still there.
    expect(screen.getByLabelText('Routine name')).toHaveDisplayValue('Full body');
    const slots = screen.getAllByLabelText(/ slot$/).map((slot) => slot.props.accessibilityLabel);
    expect(slots).toEqual(['Overhead Press slot', 'Back Squat slot']);

    // Picking again adds to the end.
    await addSlot('deadlift', 'Deadlift');
    expect(screen.getAllByLabelText(/ slot$/)).toHaveLength(3);
  });

  it('plans an exercise without a weight, and asks for it when the routine is started', async () => {
    const accountId = await openWorkoutTab();
    await fireEvent.press(await screen.findByRole('button', { name: 'New routine' }));
    await fireEvent.changeText(await screen.findByLabelText('Routine name'), 'First day');
    // A new lifter doesn't know their squat yet: the weight is left blank.
    const squat = await addSlot('squat', 'Back Squat');
    await fireEvent.changeText(squat.getByLabelText('Reps'), '8');
    const press = await addSlot('overhead', 'Overhead Press');
    await fireEvent.changeText(press.getByLabelText('Weight (kg)'), '30');
    await fireEvent.press(screen.getByRole('button', { name: 'Save routine' }));

    await screen.findByRole('header', { name: 'Workout' });
    expect(fakeApi.routines(accountId)[0].slots.map((s) => s.targetWeight)).toEqual([0, 30]);
    await fireEvent.press(within(await screen.findByLabelText('Routines')).getByRole('button', { name: 'First day' }));
    await findHeaderTitle('First day');
    expect(screen.getByText('3 × 8')).toBeVisible();
    // Only the exercise with no weight is asked about.
    const starting = within(screen.getByLabelText('Starting weights'));
    expect(starting.queryByLabelText('Overhead Press weight (kg)')).toBeNull();
    await fireEvent.changeText(starting.getByLabelText('Back Squat weight (kg)'), '60');

    await fireEvent.press(screen.getByRole('button', { name: 'Start workout' }));

    await findHeaderTitle('Current workout');
    const card = within(screen.getByLabelText('Back Squat card'));
    expect(card.getByText('Target 3 × 8 · 60 kg')).toBeVisible();
    expect(card.getByLabelText('Set 1 weight (kg)')).toHaveDisplayValue('60');
    // Saved to the routine, so it isn't asked again.
    expect(fakeApi.routines(accountId)[0].slots.map((s) => s.targetWeight)).toEqual([60, 30]);
  });

  it('starts a routine without a starting weight, leaving the weight to fill in while logging', async () => {
    const accountId = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg').id;
    fakeApi.addRoutine(accountId, 'First day', ['Back Squat']).slots[0].targetWeight = 0;
    await openWorkoutTab(accountId);
    await fireEvent.press(within(await screen.findByLabelText('Routines')).getByRole('button', { name: 'First day' }));

    await fireEvent.press(await screen.findByRole('button', { name: 'Start workout' }));

    await findHeaderTitle('Current workout');
    const card = within(screen.getByLabelText('Back Squat card'));
    expect(card.getByText('Target 3 × 10')).toBeVisible();
    expect(card.getByLabelText('Set 1 weight (kg)')).toHaveDisplayValue('');
    expect(card.getByLabelText('Set 1 reps')).toHaveDisplayValue('10');
    expect(fakeApi.routines(accountId)[0].slots[0].targetWeight).toBe(0);
  });

  it('plans a superset in a routine, and starts the workout with it grouped', async () => {
    const accountId = await openWorkoutTab();
    await fireEvent.press(await screen.findByRole('button', { name: 'New routine' }));
    await fireEvent.changeText(await screen.findByLabelText('Routine name'), 'Pull day');
    for (const [search, name] of [
      ['deadlift', 'Deadlift'],
      ['pulldown', 'Lat Pulldown'],
      ['overhead', 'Overhead Press'],
    ]) {
      const slot = await addSlot(search, name);
      await fireEvent.changeText(slot.getByLabelText('Weight (kg)'), '60');
    }

    await fireEvent.press(screen.getByRole('button', { name: 'Create superset' }));
    const form = within(screen.getByLabelText('New superset'));
    await fireEvent.press(form.getByRole('checkbox', { name: 'Lat Pulldown' }));
    await fireEvent.press(form.getByRole('checkbox', { name: 'Overhead Press' }));
    await fireEvent.press(form.getByRole('button', { name: 'Group as superset' }));
    expect(screen.getByLabelText('Superset of Lat Pulldown and Overhead Press')).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Save routine' }));

    await screen.findByRole('header', { name: 'Workout' });
    expect(fakeApi.routines(accountId)[0].slots.map((s) => s.supersetGroup)).toEqual([null, 1, 1]);
    await fireEvent.press(within(await screen.findByLabelText('Routines')).getByRole('button', { name: 'Pull day' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Start workout' }));

    await findHeaderTitle('Current workout');
    const superset = within(screen.getByLabelText('Superset of Lat Pulldown and Overhead Press'));
    expect(superset.getByText('Next: Lat Pulldown')).toBeVisible();
  });

  it('edits a routine', async () => {
    const accountId = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg').id;
    fakeApi.addRoutine(accountId, 'Push day', ['Bench Press', 'Overhead Press', 'Plank']);
    await openWorkoutTab(accountId);
    await fireEvent.press(within(await screen.findByLabelText('Routines')).getByRole('button', { name: 'Push day' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit routine' }));

    await findHeaderTitle('Edit routine');
    expect(screen.getByLabelText('Routine name')).toHaveDisplayValue('Push day');
    expect(within(screen.getByLabelText('Bench Press slot')).getByLabelText('Weight (kg)')).toHaveDisplayValue('50');
    await fireEvent.changeText(screen.getByLabelText('Routine name'), 'Push day B');
    await fireEvent.press(within(screen.getByLabelText('Overhead Press slot')).getByRole('button', { name: 'Remove' }));
    await fireEvent.press(within(screen.getByLabelText('Plank slot')).getByRole('button', { name: 'Move up' }));
    await fireEvent.changeText(within(screen.getByLabelText('Bench Press slot')).getByLabelText('Sets'), '5');
    await addSlot('deadlift', 'Deadlift');
    await findHeaderTitle('Edit routine');
    // Edits made before picking are kept.
    expect(screen.getByLabelText('Routine name')).toHaveDisplayValue('Push day B');
    await fireEvent.press(screen.getByRole('button', { name: 'Save routine' }));

    await findHeaderTitle('Push day B');
    const plan = within(screen.getByLabelText('Planned exercises'));
    expect(plan.getByText('Bench Press')).toBeVisible();
    expect(plan.queryByText('Overhead Press')).toBeNull();
    expect(fakeApi.routines(accountId)[0].slots.map((s) => [s.exerciseId, s.targetSets])).toEqual([
      [fakeApi.exerciseNamed('Plank').id, 3],
      [fakeApi.exerciseNamed('Bench Press').id, 5],
      [fakeApi.exerciseNamed('Deadlift').id, 3],
    ]);
  });

  it('deletes a routine after confirming', async () => {
    const accountId = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg').id;
    fakeApi.addRoutine(accountId, 'Push day', ['Bench Press']);
    await openWorkoutTab(accountId);
    await fireEvent.press(within(await screen.findByLabelText('Routines')).getByRole('button', { name: 'Push day' }));
    await findHeaderTitle('Push day');
    // Confirm the dialog by choosing its destructive button.
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Delete routine' }));

    await screen.findByRole('header', { name: 'Workout' });
    expect(await screen.findByText('No routines yet.')).toBeVisible();
    expect(fakeApi.routines(accountId)).toEqual([]);
  });

  it('saves a finished freeform workout as a routine', async () => {
    const accountId = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg').id;
    const session = fakeApi.addSession(accountId);
    const deadlift = fakeApi.addSessionExercise(session, 'Deadlift');
    fakeApi.addSet(deadlift, 140, 'kg', 5);
    fakeApi.addSet(deadlift, 150, 'kg', 3);
    await openWorkoutTab(accountId);
    await fireEvent.press(await screen.findByRole('button', { name: 'Resume workout' }));
    await findHeaderTitle('Current workout');

    await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));

    await findHeaderTitle('Workout finished');
    expect(screen.getByRole('button', { name: 'Save as routine' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Routine name'), 'Heavy pulls');
    await fireEvent.press(screen.getByRole('button', { name: 'Save as routine' }));

    await screen.findByRole('header', { name: 'Workout' });
    const list = within(await screen.findByLabelText('Routines'));
    expect(await list.findByRole('button', { name: 'Heavy pulls' })).toBeVisible();
    expect(list.getByText('Deadlift')).toBeVisible();
    expect(fakeApi.routines(accountId)[0].slots).toMatchObject([
      { targetSets: 2, targetReps: 3, targetWeight: 150, weightUnit: 'kg' },
    ]);
  });

  it('can skip saving a finished freeform workout', async () => {
    const accountId = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg').id;
    fakeApi.addSet(fakeApi.addSessionExercise(fakeApi.addSession(accountId), 'Deadlift'), 140, 'kg', 5);
    await openWorkoutTab(accountId);
    await fireEvent.press(await screen.findByRole('button', { name: 'Resume workout' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Finish workout' }));
    await findHeaderTitle('Workout finished');

    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    await screen.findByRole('header', { name: 'Workout' });
    expect(await screen.findByText('No routines yet.')).toBeVisible();
    expect(fakeApi.routines(accountId)).toEqual([]);
  });

  it('shows the records a routine workout set once finished, with no offer to save it as a routine', async () => {
    const accountId = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg').id;
    const earlier = fakeApi.addSession(accountId, new Date(Date.now() - 86_400_000));
    fakeApi.addSet(fakeApi.addSessionExercise(earlier, 'Deadlift'), 140, 'kg', 5);
    fakeApi.finishSession(earlier, new Date(Date.now() - 86_400_000 + 3_600_000));
    const today = fakeApi.addSession(accountId);
    today.routineId = fakeApi.addRoutine(accountId, 'Pull day', ['Deadlift']).id;
    fakeApi.addSet(fakeApi.addSessionExercise(today, 'Deadlift'), 140, 'kg', 6);
    await openWorkoutTab(accountId);
    await fireEvent.press(await screen.findByRole('button', { name: 'Resume workout' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Finish workout' }));

    await findHeaderTitle('Workout finished');
    const records = within(await screen.findByLabelText('Personal records'));
    expect(await records.findByText('Deadlift: Estimated 1RM 168 kg, from 140 kg × 6')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save as routine' })).toBeNull();
  });
});
