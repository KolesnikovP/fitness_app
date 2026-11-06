import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { fakeApi } from './support/fake-api';
import { imagePicker } from './support/image-picker';
import { secureStore } from './support/secure-store';

/** Launches the app signed in as an onboarded user, on the Exercises tab. */
async function openExercisesTab() {
  const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
  secureStore.set('auth-token', fakeApi.issueToken(account.id));
  await renderRouter('./src/app', { initialUrl: '/' });
  await screen.findByRole('header', { name: 'History' });
  // The native tab bar isn't rendered in Jest; switch tabs by navigating.
  await act(async () => router.navigate('/exercises'));
  await screen.findByRole('header', { name: 'Exercises' });
  return account;
}

/** The names of the exercises currently listed in the library. */
function listedExercises() {
  return within(screen.getByLabelText('Exercise list'))
    .queryAllByRole('button')
    .map((row) => row.props.accessibilityLabel as string);
}

function chip(group: string, label: string) {
  return within(screen.getByLabelText(group)).getByRole('radio', { name: label });
}

/** Opens a library filter's sheet and taps one of its cards. */
async function pickFilter(group: string, label: string) {
  await fireEvent.press(screen.getByRole('button', { name: group }));
  const options = await screen.findByLabelText(`${group} options`);
  await fireEvent.press(within(options).getByRole('radio', { name: label }));
}

describe('exercise library', () => {
  it('lists the library and narrows it by name, muscle group and equipment type', async () => {
    await openExercisesTab();
    expect(await screen.findByRole('button', { name: 'Bench Press' })).toBeVisible();

    await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'press');
    await waitFor(() =>
      expect(listedExercises()).toEqual([
        'Bench Press',
        'Dumbbell Bench Press',
        'Incline Bench Press',
        'Overhead Press',
      ]),
    );

    await fireEvent.changeText(screen.getByLabelText('Search exercises'), '');
    await pickFilter('Muscle group', 'Back');
    await pickFilter('Equipment', 'Cable');
    await waitFor(() => expect(listedExercises()).toEqual(['Lat Pulldown']));
    // Picking closes the sheet, and the button shows what's picked.
    expect(screen.queryByLabelText('Equipment options')).toBeNull();
    expect(screen.getByRole('button', { name: 'Equipment' })).toHaveAccessibilityValue({ text: 'Cable' });

    // Picking the selected card again clears it.
    await pickFilter('Equipment', 'Cable');
    await waitFor(() => expect(listedExercises()).toEqual(['Deadlift', 'Lat Pulldown']));
    expect(screen.getByRole('button', { name: 'Equipment' })).toHaveAccessibilityValue({ text: 'Any' });

    // Clear filters resets every filter at once, then goes away.
    await pickFilter('Equipment', 'Barbell');
    await waitFor(() => expect(listedExercises()).toEqual(['Deadlift']));
    await fireEvent.press(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('button', { name: 'Muscle group' })).toHaveAccessibilityValue({ text: 'Any' });
    expect(screen.getByRole('button', { name: 'Equipment' })).toHaveAccessibilityValue({ text: 'Any' });
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
    await waitFor(() => expect(listedExercises()).toContain('Bench Press'));
  });

  it('shows an exercise in detail', async () => {
    await openExercisesTab();

    await fireEvent.press(await screen.findByRole('button', { name: 'Deadlift' }));

    expect(await screen.findByRole('header', { name: 'Deadlift' })).toBeVisible();
    expect(screen.getByLabelText('Muscle group')).toHaveTextContent(/Back$/);
    expect(screen.getByLabelText('Equipment')).toHaveTextContent(/Barbell$/);
    // Canonical exercises can't be changed.
    expect(screen.queryByRole('button', { name: 'Add image or GIF' })).toBeNull();
  });

  it("lists the user's current records for an exercise", async () => {
    const account = await openExercisesTab();
    const day = (n: number) => new Date(Date.now() - n * 86_400_000);
    const first = fakeApi.addSession(account.id, day(3));
    const deadlift = fakeApi.addSessionExercise(first, 'Deadlift');
    fakeApi.addSet(deadlift, 140, 'kg', 5);
    fakeApi.addSet(deadlift, 330, 'lb', 3);
    fakeApi.finishSession(first, day(3));
    const second = fakeApi.addSession(account.id, day(1));
    fakeApi.addSet(fakeApi.addSessionExercise(second, 'Deadlift'), 160, 'kg', 1);
    fakeApi.finishSession(second, day(1));

    await fireEvent.press(await screen.findByRole('button', { name: 'Deadlift' }));

    const records = within(await screen.findByLabelText('Records'));
    // 330 lb × 3 is 149.7 kg, so 164.7 kg estimated; 140 × 5 is 163.3.
    expect(await records.findByText('Estimated 1RM: 164.7 kg, from 330 lb × 3')).toBeVisible();
    expect(records.getByText('1 rep: 160 kg')).toBeVisible();
    expect(records.getByText('3 reps: 330 lb')).toBeVisible();
    expect(records.getByText('5 reps: 140 kg')).toBeVisible();
  });

  it('shows no records for an exercise never logged', async () => {
    await openExercisesTab();

    await fireEvent.press(await screen.findByRole('button', { name: 'Plank' }));

    expect(await within(await screen.findByLabelText('Records')).findByText('No records yet.')).toBeVisible();
  });

  it('creates a custom exercise that then turns up in search', async () => {
    const account = await openExercisesTab();

    await fireEvent.press(await screen.findByRole('button', { name: 'New exercise' }));
    expect(await screen.findByRole('header', { name: 'New exercise' })).toBeVisible();
    const save = screen.getByRole('button', { name: 'Save exercise' });
    expect(save).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Belt Squat');
    await fireEvent.press(chip('Muscle group', 'Quads'));
    await fireEvent.press(chip('Equipment', 'Machine'));
    await fireEvent.press(save);

    // Saving opens the new exercise.
    expect(await screen.findByRole('header', { name: 'Belt Squat' })).toBeVisible();
    expect(screen.getByText('Custom')).toBeVisible();
    expect(fakeApi.customExercises(account.id).map((e) => e.name)).toEqual(['Belt Squat']);

    await act(async () => router.back());
    await screen.findByRole('header', { name: 'Exercises' });
    await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'squat');
    expect(await screen.findByRole('button', { name: 'Belt Squat' })).toBeVisible();
  });

  it('adds an image to a custom exercise', async () => {
    const account = await openExercisesTab();
    const exercise = fakeApi.addCustomExercise(account.id, 'Sled Push', 'full_body', 'other');
    imagePicker.nextPick = { uri: 'file:///photos/sled.gif', mimeType: 'image/gif', fileName: 'sled.gif' };

    await act(async () => router.navigate(`/exercises/${exercise.id}`));
    await screen.findByRole('header', { name: 'Sled Push' });
    expect(screen.queryByLabelText('Sled Push animated demo')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Add image or GIF' }));

    expect(await screen.findByLabelText('Sled Push animated demo')).toBeVisible();
    expect(fakeApi.uploads).toEqual([{ exerciseId: exercise.id, fileName: 'sled.gif', type: 'image/gif' }]);
    // iOS must hand back the original file, or a GIF arrives as a still JPEG.
    expect(imagePicker.lastOptions).toMatchObject({ preferredAssetRepresentationMode: 'current' });
  });

  it('shows the API error when an upload is rejected', async () => {
    const account = await openExercisesTab();
    const exercise = fakeApi.addCustomExercise(account.id, 'Sled Push', 'full_body', 'other');
    imagePicker.nextPick = { uri: 'file:///docs/notes.txt', mimeType: 'text/plain', fileName: 'notes.txt' };

    await act(async () => router.navigate(`/exercises/${exercise.id}`));
    await fireEvent.press(await screen.findByRole('button', { name: 'Add image or GIF' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Upload a PNG, JPEG, WebP or GIF image.');
  });
});

describe('exercise progress chart', () => {
  const day = (n: number) => new Date(Date.now() - n * 86_400_000);

  /** Logs a finished Session of Bench Press n days ago with the given sets. */
  function logBench(ownerId: string, daysAgo: number, ...sets: [number, 'kg' | 'lb', number][]) {
    const session = fakeApi.addSession(ownerId, day(daysAgo));
    const exercise = fakeApi.addSessionExercise(session, 'Bench Press');
    for (const [weight, unit, reps] of sets) fakeApi.addSet(exercise, weight, unit, reps);
    fakeApi.finishSession(session, day(daysAgo));
  }

  async function openProgress(name: string) {
    await fireEvent.press(await screen.findByRole('button', { name }));
    return within(await screen.findByLabelText('Progress'));
  }

  it("charts an exercise's best Estimated 1RM per workout, and switches metric and range", async () => {
    const account = await openExercisesTab();
    logBench(account.id, 200, [100, 'kg', 5]); // 116.7 kg estimated
    logBench(account.id, 30, [100, 'kg', 8]); // 126.7 kg: a Personal record
    logBench(account.id, 1, [110, 'kg', 3]); // 121 kg

    const progress = await openProgress('Bench Press');

    const chart = await progress.findByRole('image');
    expect(chart).toHaveAccessibleName(
      /^Estimated 1RM, last 3 months, 2 workouts: .*126\.7 kg, Personal record; .*121 kg$/,
    );

    await fireEvent.press(progress.getByRole('radio', { name: 'All time' }));
    expect(progress.getByRole('image')).toHaveAccessibleName(
      /^Estimated 1RM, all time, 3 workouts: .*116\.7 kg; .*126\.7 kg, Personal record; .*121 kg$/,
    );

    await fireEvent.press(progress.getByRole('radio', { name: 'Heaviest weight' }));
    expect(progress.getByRole('image')).toHaveAccessibleName(
      /^Heaviest weight, all time, 3 workouts: .*100 kg; .*100 kg, Personal record; .*110 kg$/,
    );

    await fireEvent.press(progress.getByRole('radio', { name: 'Volume' }));
    expect(progress.getByRole('image')).toHaveAccessibleName(
      /^Volume, all time, 3 workouts: .*500 kg; .*800 kg, Personal record; .*330 kg$/,
    );

    await fireEvent.press(progress.getByRole('radio', { name: '1 year' }));
    expect(progress.getByRole('image')).toHaveAccessibleName(/^Volume, last year, 3 workouts: /);
  });

  it('shows a single workout as its one point', async () => {
    const account = await openExercisesTab();
    logBench(account.id, 2, [60, 'kg', 10]);

    const progress = await openProgress('Bench Press');

    expect(await progress.findByRole('image')).toHaveAccessibleName(
      /^Estimated 1RM, last 3 months, 1 workout: .*80 kg$/,
    );
  });

  it('says so instead of charting an exercise never logged, or no workouts in the range', async () => {
    const account = await openExercisesTab();
    logBench(account.id, 200, [100, 'kg', 5]);

    const bench = await openProgress('Bench Press');
    expect(await bench.findByText('No workouts in the last 3 months.')).toBeVisible();
    expect(bench.queryByRole('image')).toBeNull();

    await act(async () => router.back());
    const plank = await openProgress('Plank');
    expect(await plank.findByText('No sets of this exercise yet.')).toBeVisible();
    expect(plank.queryByRole('image')).toBeNull();
  });
});
