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
  await screen.findByRole('header', { name: 'Workout' });
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

/**
 * Presses an upload button. The fake upload can answer while the press is
 * still settling, after its act() has closed, so press inside an outer act()
 * that stays open until then.
 */
async function upload(button: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    await fireEvent.press(button);
  });
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

  it('heads an exercise with its equipment and muscles, leaving out Secondary muscles when there are none', async () => {
    await openExercisesTab();

    await fireEvent.press(await screen.findByRole('button', { name: 'Deadlift' }));

    expect(await screen.findByRole('header', { name: 'Deadlift' })).toBeVisible();
    const header = within(screen.getByLabelText('About this exercise'));
    expect(header.getByText('Barbell')).toBeVisible();
    expect(header.getByText('Primary: Back')).toBeVisible();
    expect(header.queryByText(/^Secondary:/)).toBeNull();
    expect(screen.queryByText('Custom')).toBeNull();
  });

  it('heads an exercise with its Secondary muscles', async () => {
    const account = await openExercisesTab();
    const exercise = fakeApi.addCustomExercise(account.id, 'Spoto Press', 'chest', 'barbell', {
      secondaryMuscles: ['triceps', 'shoulders'],
    });

    await act(async () => router.navigate(`/exercises/${exercise.id}`));

    expect(await screen.findByRole('header', { name: 'Spoto Press' })).toBeVisible();
    const header = within(screen.getByLabelText('About this exercise'));
    expect(header.getByText('Primary: Chest')).toBeVisible();
    expect(header.getByText('Secondary: Triceps, Shoulders')).toBeVisible();
    expect(screen.getByText('Custom')).toBeVisible();
  });

  it('opens on Performance and switches to How to, with the Instructions as numbered steps', async () => {
    const account = await openExercisesTab();
    const exercise = fakeApi.addCustomExercise(account.id, 'Spoto Press', 'chest', 'barbell', {
      instructions: ['Lower the bar.', 'Pause above the chest.', 'Press.'],
    });

    await act(async () => router.navigate(`/exercises/${exercise.id}`));
    await screen.findByRole('header', { name: 'Spoto Press' });

    expect(screen.getByRole('tab', { name: 'Performance' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'How to' })).not.toBeSelected();
    expect(screen.getByLabelText('Progress')).toBeVisible();
    expect(screen.getByLabelText('Instructions', { includeHiddenElements: true })).not.toBeVisible();

    await fireEvent.press(screen.getByRole('tab', { name: 'How to' }));

    expect(screen.getByRole('tab', { name: 'How to' })).toBeSelected();
    // Still mounted, so the chart keeps its metric and range.
    expect(screen.getByLabelText('Progress', { includeHiddenElements: true })).not.toBeVisible();
    const steps = within(screen.getByLabelText('Instructions'));
    expect(steps.getByText('1.')).toBeVisible();
    expect(steps.getByText('Lower the bar.')).toBeVisible();
    expect(steps.getByText('3.')).toBeVisible();
    expect(steps.getByText('Press.')).toBeVisible();

    await fireEvent.press(screen.getByRole('tab', { name: 'Performance' }));
    expect(screen.getByLabelText('Progress')).toBeVisible();
  });

  it('says so on How to when an exercise has no Instructions or media', async () => {
    await openExercisesTab();
    await fireEvent.press(await screen.findByRole('button', { name: 'Deadlift' }));
    await screen.findByRole('header', { name: 'Deadlift' });

    await fireEvent.press(screen.getByRole('tab', { name: 'How to' }));

    expect(within(screen.getByLabelText('Instructions')).getByText('No instructions yet.')).toBeVisible();
    // The media slot is there, empty, for media to come.
    const slot = screen.getByLabelText('Media');
    expect(within(slot).queryByRole('image')).toBeNull();
    // Canonical exercises can't be changed.
    expect(screen.queryByRole('button', { name: 'Add image or GIF' })).toBeNull();
  });

  it("lists the user's Bests for an exercise, then its Rep records", async () => {
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
    const date = (n: number) => day(n).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    await fireEvent.press(await screen.findByRole('button', { name: 'Deadlift' }));

    const bests = within(await screen.findByLabelText('Bests'));
    // 330 lb × 3 is 149.7 kg, so 164.7 kg estimated; 140 × 5 is 163.3.
    expect(within(await bests.findByLabelText('Best 1RM')).getByText(`330 lb × 3 · ${date(3)}`)).toBeVisible();
    expect(within(bests.getByLabelText('Heaviest weight')).getByText(`160 kg × 1 · ${date(1)}`)).toBeVisible();
    expect(within(bests.getByLabelText('Best set volume')).getByText(`140 kg × 5 · ${date(3)}`)).toBeVisible();
    // 700 kg and 449.1 kg in one Session.
    expect(within(bests.getByLabelText('Session volume')).getByText(`1,149 kg · ${date(3)}`)).toBeVisible();
    expect(within(bests.getByLabelText('Most reps')).getByText(`8 reps · ${date(3)}`)).toBeVisible();
    const repRecords = within(screen.getByLabelText('Rep records'));
    expect(repRecords.getByText('1 rep: 160 kg')).toBeVisible();
    expect(repRecords.getByText('3 reps: 330 lb')).toBeVisible();
    expect(repRecords.getByText('5 reps: 140 kg')).toBeVisible();
  });

  it('shows only Most reps in Bests for an exercise logged without weight', async () => {
    const account = await openExercisesTab();
    const session = fakeApi.addSession(account.id, new Date(Date.now() - 86_400_000));
    const pushUp = fakeApi.addSessionExercise(session, 'Push-up');
    fakeApi.addSet(pushUp, 0, 'kg', 20);
    fakeApi.addSet(pushUp, 0, 'kg', 15);
    fakeApi.finishSession(session, new Date(Date.now() - 86_400_000));

    await fireEvent.press(await screen.findByRole('button', { name: 'Push-up' }));

    const bests = within(await screen.findByLabelText('Bests'));
    expect(within(await bests.findByLabelText('Most reps')).getByText(/^35 reps · /)).toBeVisible();
    for (const measure of ['Best 1RM', 'Heaviest weight', 'Best set volume', 'Session volume']) {
      expect(bests.queryByLabelText(measure)).toBeNull();
    }
    expect(screen.queryByLabelText('Rep records')).toBeNull();
  });

  it('shows no Bests for an exercise never logged', async () => {
    await openExercisesTab();

    await fireEvent.press(await screen.findByRole('button', { name: 'Plank' }));

    expect(await within(await screen.findByLabelText('Bests')).findByText('No bests yet.')).toBeVisible();
    expect(screen.queryByLabelText('Rep records')).toBeNull();
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
    expect(fakeApi.customExercises(account.id)).toEqual([
      expect.objectContaining({ name: 'Belt Squat', secondaryMuscles: [], instructions: [] }),
    ]);

    await act(async () => router.back());
    await screen.findByRole('header', { name: 'Exercises' });
    await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'squat');
    expect(await screen.findByRole('button', { name: 'Belt Squat' })).toBeVisible();
  });

  it('creates a custom exercise with Secondary muscles and Instructions', async () => {
    const account = await openExercisesTab();
    await fireEvent.press(await screen.findByRole('button', { name: 'New exercise' }));
    await screen.findByRole('header', { name: 'New exercise' });

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Spoto Press');
    await fireEvent.press(chip('Muscle group', 'Chest'));
    const secondary = (label: string) =>
      within(screen.getByLabelText('Secondary muscles (optional)')).queryByRole('checkbox', { name: label });
    // The primary can't also be secondary.
    expect(secondary('Chest')).toBeNull();
    await fireEvent.press(secondary('Triceps')!);
    await fireEvent.press(secondary('Shoulders')!);
    await fireEvent.press(secondary('Biceps')!);
    await fireEvent.press(secondary('Biceps')!);
    expect(secondary('Triceps')).toBeChecked();
    expect(secondary('Biceps')).not.toBeChecked();
    await fireEvent.press(chip('Equipment', 'Barbell'));
    await fireEvent.changeText(
      screen.getByLabelText('Instructions (optional)'),
      'Lower the bar.\n\n  Pause above the chest.  \nPress.',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save exercise' }));

    expect(await screen.findByRole('header', { name: 'Spoto Press' })).toBeVisible();
    expect(fakeApi.customExercises(account.id)).toEqual([
      expect.objectContaining({
        secondaryMuscles: ['triceps', 'shoulders'],
        instructions: ['Lower the bar.', 'Pause above the chest.', 'Press.'],
      }),
    ]);
  });

  it('does not send a muscle chosen as secondary and then as primary as secondary', async () => {
    const account = await openExercisesTab();
    await fireEvent.press(await screen.findByRole('button', { name: 'New exercise' }));
    await screen.findByRole('header', { name: 'New exercise' });

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Close-grip Press');
    await fireEvent.press(
      within(screen.getByLabelText('Secondary muscles (optional)')).getByRole('checkbox', { name: 'Triceps' }),
    );
    await fireEvent.press(chip('Muscle group', 'Triceps'));
    await fireEvent.press(chip('Equipment', 'Barbell'));
    await fireEvent.press(screen.getByRole('button', { name: 'Save exercise' }));

    expect(await screen.findByRole('header', { name: 'Close-grip Press' })).toBeVisible();
    expect(fakeApi.customExercises(account.id)).toEqual([
      expect.objectContaining({ muscleGroup: 'triceps', secondaryMuscles: [] }),
    ]);
  });

  it('adds an image to a custom exercise', async () => {
    const account = await openExercisesTab();
    const exercise = fakeApi.addCustomExercise(account.id, 'Sled Push', 'full_body', 'other');
    imagePicker.nextPick = { uri: 'file:///photos/sled.gif', mimeType: 'image/gif', fileName: 'sled.gif' };

    await act(async () => router.navigate(`/exercises/${exercise.id}`));
    await screen.findByRole('header', { name: 'Sled Push' });
    await fireEvent.press(screen.getByRole('tab', { name: 'How to' }));
    expect(screen.queryByLabelText('Sled Push animated demo')).toBeNull();

    await upload(screen.getByRole('button', { name: 'Add image or GIF' }));

    // The demo fills the media slot at the top of How to.
    expect(await within(screen.getByLabelText('Media')).findByLabelText('Sled Push animated demo')).toBeVisible();
    expect(fakeApi.uploads).toEqual([{ exerciseId: exercise.id, fileName: 'sled.gif', type: 'image/gif' }]);
    // iOS must hand back the original file, or a GIF arrives as a still JPEG.
    expect(imagePicker.lastOptions).toMatchObject({ preferredAssetRepresentationMode: 'current' });
  });

  it('shows an image in the media slot of an exercise without an animated demo', async () => {
    const account = await openExercisesTab();
    const exercise = fakeApi.addCustomExercise(account.id, 'Sled Push', 'full_body', 'other');
    imagePicker.nextPick = { uri: 'file:///photos/sled.png', mimeType: 'image/png', fileName: 'sled.png' };

    await act(async () => router.navigate(`/exercises/${exercise.id}`));
    await fireEvent.press(await screen.findByRole('tab', { name: 'How to' }));
    await upload(screen.getByRole('button', { name: 'Add image or GIF' }));

    expect(await within(screen.getByLabelText('Media')).findByLabelText('Sled Push image')).toBeVisible();
  });

  it('shows the API error when an upload is rejected', async () => {
    const account = await openExercisesTab();
    const exercise = fakeApi.addCustomExercise(account.id, 'Sled Push', 'full_body', 'other');
    imagePicker.nextPick = { uri: 'file:///docs/notes.txt', mimeType: 'text/plain', fileName: 'notes.txt' };

    await act(async () => router.navigate(`/exercises/${exercise.id}`));
    await fireEvent.press(await screen.findByRole('tab', { name: 'How to' }));
    await upload(screen.getByRole('button', { name: 'Add image or GIF' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Upload a PNG, JPEG, WebP or GIF image.');
  });
});

describe('exercise progress chart', () => {
  const day = (n: number) => new Date(Date.now() - n * 86_400_000);

  /** Logs a finished Session of one exercise n days ago with the given sets. */
  function logWorkout(ownerId: string, name: string, daysAgo: number, ...sets: [number, 'kg' | 'lb', number][]) {
    const session = fakeApi.addSession(ownerId, day(daysAgo));
    const exercise = fakeApi.addSessionExercise(session, name);
    for (const [weight, unit, reps] of sets) fakeApi.addSet(exercise, weight, unit, reps);
    fakeApi.finishSession(session, day(daysAgo));
  }

  async function openProgress(name: string) {
    await fireEvent.press(await screen.findByRole('button', { name }));
    return within(await screen.findByLabelText('Progress'));
  }

  it('charts an exercise by each measure per workout, starting on Best 1RM, and switches range', async () => {
    const account = await openExercisesTab();
    logWorkout(account.id, 'Bench Press', 400, [80, 'kg', 5]); // 93.3 kg estimated
    logWorkout(account.id, 'Bench Press', 200, [100, 'kg', 5]); // 116.7 kg: a Personal record
    logWorkout(account.id, 'Bench Press', 30, [100, 'kg', 8]); // 126.7 kg: a Personal record
    logWorkout(account.id, 'Bench Press', 1, [110, 'kg', 3], [60, 'kg', 10]); // 121 kg

    const progress = await openProgress('Bench Press');

    const metrics = within(progress.getByLabelText('Metric'))
      .getAllByRole('radio')
      .map((chip) => chip.props.accessibilityLabel as string);
    expect(metrics).toEqual(['Best 1RM', 'Heaviest weight', 'Best set volume', 'Session volume', 'Total reps']);
    expect(progress.getByRole('radio', { name: 'Best 1RM' })).toBeChecked();
    const chart = await progress.findByRole('image');
    expect(chart).toHaveAccessibleName(/^Best 1RM, last 3 months, 2 workouts: .*126\.7 kg, Personal record; .*121 kg$/);

    await fireEvent.press(progress.getByRole('radio', { name: 'All time' }));
    expect(progress.getByRole('image')).toHaveAccessibleName(
      /^Best 1RM, all time, 4 workouts: .*93\.3 kg; .*116\.7 kg, Personal record; .*126\.7 kg, Personal record; .*121 kg$/,
    );

    await fireEvent.press(progress.getByRole('radio', { name: 'Heaviest weight' }));
    expect(progress.getByRole('image')).toHaveAccessibleName(
      /^Heaviest weight, all time, 4 workouts: .*80 kg; .*100 kg, Personal record; .*100 kg, Personal record; .*110 kg$/,
    );

    await fireEvent.press(progress.getByRole('radio', { name: 'Best set volume' }));
    expect(progress.getByRole('image')).toHaveAccessibleName(
      /^Best set volume, all time, 4 workouts: .*400 kg; .*500 kg, Personal record; .*800 kg, Personal record; .*600 kg$/,
    );

    await fireEvent.press(progress.getByRole('radio', { name: 'Session volume' }));
    expect(progress.getByRole('image')).toHaveAccessibleName(
      /^Session volume, all time, 4 workouts: .*400 kg; .*500 kg, Personal record; .*800 kg, Personal record; .*930 kg$/,
    );

    await fireEvent.press(progress.getByRole('radio', { name: 'Total reps' }));
    expect(progress.getByRole('image')).toHaveAccessibleName(
      /^Total reps, all time, 4 workouts: .*5 reps; .*5 reps, Personal record; .*8 reps, Personal record; .*13 reps$/,
    );

    // Going to How to and back keeps the chosen metric.
    await fireEvent.press(screen.getByRole('tab', { name: 'How to' }));
    await fireEvent.press(screen.getByRole('tab', { name: 'Performance' }));
    expect(progress.getByRole('radio', { name: 'Total reps' })).toBeChecked();

    await fireEvent.press(progress.getByRole('radio', { name: '1 year' }));
    expect(progress.getByRole('image')).toHaveAccessibleName(
      /^Total reps, last year, 3 workouts: .*5 reps, Personal record; .*8 reps, Personal record; .*13 reps$/,
    );
  });

  it('shows a single workout as its one point', async () => {
    const account = await openExercisesTab();
    logWorkout(account.id, 'Bench Press', 2, [60, 'kg', 10]);

    const progress = await openProgress('Bench Press');

    expect(await progress.findByRole('image')).toHaveAccessibleName(/^Best 1RM, last 3 months, 1 workout: .*80 kg$/);
  });

  it('charts only Total reps for an exercise only ever logged without weight', async () => {
    const account = await openExercisesTab();
    logWorkout(account.id, 'Push-up', 3, [0, 'kg', 20], [0, 'kg', 15]);

    const progress = await openProgress('Push-up');

    const metrics = within(progress.getByLabelText('Metric')).getAllByRole('radio');
    expect(metrics.map((chip) => chip.props.accessibilityLabel)).toEqual(['Total reps']);
    expect(await progress.findByRole('image')).toHaveAccessibleName(
      /^Total reps, last 3 months, 1 workout: .*35 reps$/,
    );
  });

  it('says so instead of charting an exercise never logged, or not in the range', async () => {
    const account = await openExercisesTab();
    logWorkout(account.id, 'Bench Press', 200, [100, 'kg', 5]);

    const bench = await openProgress('Bench Press');
    expect(await bench.findByText('No workouts in the last 3 months.')).toBeVisible();
    expect(bench.queryByRole('image')).toBeNull();

    await act(async () => router.back());
    const plank = await openProgress('Plank');
    expect(await plank.findByText('No sets of this exercise yet.')).toBeVisible();
    expect(plank.queryByRole('image')).toBeNull();
  });
});
