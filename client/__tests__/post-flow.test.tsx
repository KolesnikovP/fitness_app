import { router } from 'expo-router';
import { Linking } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { fakeApi } from './support/fake-api';
import { imagePicker } from './support/image-picker';
import { secureStore } from './support/secure-store';
import { sharing } from './support/sharing';

/**
 * Signs in as a lifter who benched 100 kg × 5 two days ago, so today's
 * heavier bench sets a Personal record, and opens the Workout tab.
 */
async function openApp() {
  const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
  const earlier = fakeApi.addSession(account.id, new Date(Date.now() - 2 * 86_400_000));
  fakeApi.addSet(fakeApi.addSessionExercise(earlier, 'Bench Press'), 100, 'kg', 5);
  fakeApi.finishSession(earlier, new Date(Date.now() - 2 * 86_400_000 + 3_600_000));
  secureStore.set('auth-token', fakeApi.issueToken(account.id));
  await renderRouter('./src/app', { initialUrl: '/' });
  await screen.findByRole('header', { name: 'History' });
  await act(async () => router.navigate('/workout'));
  await screen.findByRole('header', { name: 'Workout' });
  return account;
}

/** Logs one Bench Press set of 105 kg × 5 and finishes the workout. */
async function finishABenchWorkout() {
  await fireEvent.press(await screen.findByRole('button', { name: 'Start Workout' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Add exercise' }));
  const picker = within(await screen.findByLabelText('Exercise picker'));
  await fireEvent.changeText(picker.getByLabelText('Search exercises'), 'bench press');
  await fireEvent.press(await picker.findByRole('button', { name: 'Bench Press' }));
  const card = within(await screen.findByLabelText('Bench Press card'));
  await fireEvent.changeText(card.getByLabelText('Set 1 weight (kg)'), '105');
  await fireEvent.changeText(card.getByLabelText('Set 1 reps'), '5');
  await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Finish workout' })).toBeEnabled());
  await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));
  await screen.findByRole('header', { name: 'Workout finished' });
}

/**
 * Presses a button that saves to the Post. The fake API can answer while the
 * press is still settling, after its act() has closed, so press inside an
 * outer act() that stays open until then.
 */
async function pressAndSave(button: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    await fireEvent.press(button);
  });
}

describe('posts', () => {
  it('finish a workout, add a caption and photo, see them on the Post, and save its Carousel', async () => {
    const account = await openApp();
    await finishABenchWorkout();
    const [, today] = fakeApi.sessions(account.id);

    // The finished screen sets up the Post.
    await fireEvent.changeText(screen.getByLabelText('Caption'), 'New bench PR 💪');
    await pressAndSave(screen.getByRole('button', { name: 'Save caption' }));
    await waitFor(() => expect(fakeApi.post(today.id).caption).toBe('New bench PR 💪'));
    imagePicker.nextPick = { uri: 'file:///photos/mirror.jpg', mimeType: 'image/jpeg', fileName: 'mirror.jpg' };
    await pressAndSave(screen.getByRole('button', { name: 'Add progress photo' }));
    expect(await screen.findByLabelText('Progress photo')).toBeVisible();
    expect(fakeApi.photoUploads).toEqual([{ postId: today.id, fileName: 'mirror.jpg', type: 'image/jpeg' }]);

    // The Post shows them, and its Carousel.
    await fireEvent.press(screen.getByRole('button', { name: 'View post' }));
    const post = within(await screen.findByLabelText('Post'));
    expect(post.getByText('New bench PR 💪')).toBeVisible();
    expect(post.getByLabelText('Progress photo')).toBeVisible();
    const carousel = within(screen.getByLabelText('Carousel'));
    // Cover, stats, records, then the one exercise.
    expect(carousel.getAllByLabelText(/^Carousel image \d of 4$/)).toHaveLength(4);
    expect(within(carousel.getByLabelText('Carousel image 2 of 4')).getByText('525 kg')).toBeVisible(); // Volume
    expect(within(carousel.getByLabelText('Carousel image 3 of 4')).getByText('2 personal records')).toBeVisible();
    expect(within(carousel.getByLabelText('Carousel image 4 of 4')).getByText('105 kg × 5')).toBeVisible();

    // Saving puts the images in Photos, in order, and the caption on the clipboard.
    // Saving waits for the cover's photo, so the image isn't captured without it.
    expect(screen.getByRole('button', { name: 'Save to Photos' })).toBeDisabled();
    await act(async () => fireEvent(screen.getByTestId('carousel-cover-photo'), 'load'));
    expect(screen.getByRole('button', { name: 'Save to Photos' })).toBeEnabled();
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await pressAndSave(screen.getByRole('button', { name: 'Save to Photos' }));
    expect(await screen.findByText('Saved 4 images to Photos. The caption is copied.')).toBeVisible();
    expect(sharing.savedToPhotos).toEqual(sharing.captured);
    expect(sharing.savedToPhotos).toHaveLength(4);
    expect(sharing.clipboard).toBe('New bench PR 💪');
    await fireEvent.press(screen.getByRole('button', { name: 'Open Instagram' }));
    expect(openURL).toHaveBeenCalledWith('instagram://app');
  });

  it('a photo and caption can be changed or removed later from the Post, reached from History', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id, new Date(Date.now() - 86_400_000));
    fakeApi.addSet(fakeApi.addSessionExercise(session, 'Deadlift'), 140, 'kg', 3);
    fakeApi.finishSession(session, new Date(Date.now() - 86_400_000 + 3_600_000));
    secureStore.set('auth-token', fakeApi.issueToken(account.id));
    await renderRouter('./src/app', { initialUrl: '/' });

    const history = within(await screen.findByLabelText('Past workouts'));
    await fireEvent.press(await history.findByRole('button', { name: /Deadlift/ }));
    await fireEvent.press(await screen.findByRole('button', { name: 'View post' }));
    await screen.findByLabelText('Post');
    // With no photo, the Carousel opens on a stats cover.
    expect(within(screen.getByLabelText('Carousel image 1 of 3')).getByText('Deadlift')).toBeVisible();

    imagePicker.nextPick = { uri: 'file:///photos/back.jpg', mimeType: 'image/jpeg', fileName: 'back.jpg' };
    await pressAndSave(screen.getByRole('button', { name: 'Add progress photo' }));
    await waitFor(() => expect(fakeApi.post(session.id).photoUrl).not.toBeNull());
    await pressAndSave(await screen.findByRole('button', { name: 'Remove photo' }));
    await waitFor(() => expect(fakeApi.post(session.id).photoUrl).toBeNull());
    expect(screen.queryByLabelText('Progress photo')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Caption'), 'Pulled');
    await pressAndSave(screen.getByRole('button', { name: 'Save caption' }));
    await waitFor(() => expect(fakeApi.post(session.id).caption).toBe('Pulled'));
    // A caption is at most 2,200 characters, counted as people count them: an emoji is one.
    await fireEvent.changeText(screen.getByLabelText('Caption'), '💪'.repeat(2200));
    expect(screen.getByText('2,200 / 2,200')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save caption' })).toBeEnabled();
    await fireEvent.changeText(screen.getByLabelText('Caption'), '💪'.repeat(2201));
    expect(screen.getByText('2,201 / 2,200')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save caption' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Caption'), '');
    await pressAndSave(screen.getByRole('button', { name: 'Save caption' }));
    await waitFor(() => expect(fakeApi.post(session.id).caption).toBe(''));
  });

  it('without access to Photos, says so and saves nothing', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    fakeApi.addSet(fakeApi.addSessionExercise(session, 'Deadlift'), 140, 'kg', 3);
    fakeApi.finishSession(session);
    secureStore.set('auth-token', fakeApi.issueToken(account.id));
    sharing.grantPhotos = false;
    await renderRouter('./src/app', { initialUrl: '/' });
    await screen.findByRole('header', { name: 'History' });
    await act(async () => router.navigate(`/posts/${session.id}`));
    await screen.findByLabelText('Post');

    await pressAndSave(screen.getByRole('button', { name: 'Save to Photos' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Allow access to Photos in Settings to save the images.',
    );
    expect(sharing.savedToPhotos).toEqual([]);
  });
});
