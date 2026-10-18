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
  await screen.findByRole('header', { name: 'Feed' });
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

describe('exercise library', () => {
  it('lists the library and narrows it by name, muscle group and equipment type', async () => {
    await openExercisesTab();
    expect(await screen.findByRole('button', { name: 'Bench Press' })).toBeVisible();

    await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'press');
    await waitFor(() => expect(listedExercises()).toEqual(['Bench Press', 'Dumbbell Bench Press', 'Overhead Press']));

    await fireEvent.changeText(screen.getByLabelText('Search exercises'), '');
    await fireEvent.press(chip('Muscle group', 'Back'));
    await fireEvent.press(chip('Equipment', 'Cable'));
    await waitFor(() => expect(listedExercises()).toEqual(['Lat Pulldown']));

    // Tapping a selected filter again clears it.
    await fireEvent.press(chip('Equipment', 'Cable'));
    await waitFor(() => expect(listedExercises()).toEqual(['Deadlift', 'Lat Pulldown']));
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
