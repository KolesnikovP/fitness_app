import { router } from 'expo-router';
import { Dimensions, Linking } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { findHeaderTitle } from './support/native-header';
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
  // render() is async, so the pathname helpers are on the promise renderRouter returns.
  const app = renderRouter('./src/app', { initialUrl: '/' });
  await app;
  await screen.findByRole('header', { name: 'Workout' });
  return { account, app };
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
  await findHeaderTitle('Workout finished');
}

/**
 * Presses a button that saves. The fake API can answer while the press is
 * still settling, after its act() has closed, so press inside an outer act()
 * that stays open until then.
 */
async function pressAndSave(button: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    await fireEvent.press(button);
  });
}

/** Swipes the Carousel to its image at index (from 0), a full width each. */
async function swipeCarouselTo(index: number) {
  const { width } = Dimensions.get('window');
  await act(async () => {
    fireEvent.scroll(screen.getByLabelText('Carousel'), {
      nativeEvent: {
        contentOffset: { x: index * width, y: 0 },
        contentSize: { width: 4 * width, height: width * 1.25 },
        layoutMeasurement: { width, height: width * 1.25 },
      },
    });
  });
}

describe('the workout screen', () => {
  it('finish a workout, set it up, swipe its Carousel, rename it, and copy its Session summary', async () => {
    const { account, app } = await openApp();
    await finishABenchWorkout();
    const [, today] = fakeApi.sessions(account.id);

    // The finished screen sets the name, photo and caption, with one Save.
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Bench day');
    await fireEvent.changeText(screen.getByLabelText('Caption'), 'New bench PR 💪');
    imagePicker.nextPick = { uri: 'file:///photos/mirror.jpg', mimeType: 'image/jpeg', fileName: 'mirror.jpg' };
    await pressAndSave(screen.getByRole('button', { name: 'Add progress photo' }));
    expect(fakeApi.photoUploads).toEqual([]); // Not until Save.
    await pressAndSave(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fakeApi.post(today.id).caption).toBe('New bench PR 💪'));
    expect(fakeApi.sessionName(today.id)).toBe('Bench day');
    expect(fakeApi.photoUploads).toEqual([{ postId: today.id, fileName: 'mirror.jpg', type: 'image/jpeg' }]);

    // The workout opens on top of the Workout tab.
    await fireEvent.press(screen.getByRole('button', { name: 'View workout' }));
    expect(await screen.findByRole('header', { name: 'Bench day' })).toBeVisible();
    expect(app.getPathname()).toBe(`/workout/workouts/${today.id}`);
    expect(screen.getByText('New bench PR 💪')).toBeVisible();
    const carousel = within(screen.getByLabelText('Carousel'));
    // Cover, stats, records, then the one exercise.
    expect(carousel.getAllByLabelText(/^Carousel image \d of 4$/)).toHaveLength(4);
    expect(within(carousel.getByLabelText('Carousel image 2 of 4')).getByText('525 kg')).toBeVisible(); // Volume
    expect(within(carousel.getByLabelText('Carousel image 4 of 4')).getByText('105 kg × 5')).toBeVisible();
    const detail = within(screen.getByLabelText('Workout detail'));
    expect(detail.getByText('Bench Press')).toBeVisible();
    expect(detail.getByText('105 kg × 5')).toBeVisible();

    // The dots follow the swipe.
    expect(screen.getByLabelText('Image 1 of 4')).toBeVisible();
    await swipeCarouselTo(2);
    expect(screen.getByLabelText('Image 3 of 4')).toBeVisible();
    await swipeCarouselTo(1);
    expect(screen.getByLabelText('Image 2 of 4')).toBeVisible();

    // Edit workout changes the name; the workout shows it once saved.
    await fireEvent.press(screen.getByRole('button', { name: 'Edit workout' }));
    await screen.findByRole('header', { name: 'Edit workout' });
    expect(screen.getByLabelText('Name')).toHaveDisplayValue('Bench day');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Bench PR day');
    await pressAndSave(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('header', { name: 'Bench PR day' })).toBeVisible();
    expect(fakeApi.sessionName(today.id)).toBe('Bench PR day');

    // Copy puts its Session summary on the clipboard.
    await pressAndSave(screen.getByRole('button', { name: 'Copy session summary' }));
    expect(await screen.findByText('Session summary copied.')).toBeVisible();
    expect(sharing.clipboard).toMatch(/^# Bench PR day\n\n- Date: \w+day, \w+ \d+, \d{4}\n/);
    expect(sharing.clipboard.replace(/^- Date: .*\n/m, '')).toBe(
      [
        '# Bench PR day',
        '',
        '- Duration: < 1 min',
        '- Volume: 525 kg',
        '- Sets: 1',
        '',
        '## Bench Press',
        '',
        '1. 105 kg × 5',
        '',
        '## Personal records',
        '',
        '- Bench Press: Estimated 1RM 122.5 kg, from 105 kg × 5',
        '- Bench Press: 105 kg × 5, best at 5 reps',
        '',
      ].join('\n'),
    );

    // Back returns to the finished screen, in the Workout tab.
    await act(async () => router.back());
    await findHeaderTitle('Workout finished');
    expect(app.getPathname()).toBe('/workout/finished');
  });

  it('saves its Carousel to Photos, copies the caption, then offers Instagram', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id, new Date(Date.now() - 86_400_000));
    fakeApi.addSet(fakeApi.addSessionExercise(session, 'Deadlift'), 140, 'kg', 3);
    fakeApi.finishSession(session, new Date(Date.now() - 86_400_000 + 3_600_000));
    fakeApi.setPost(session.id, { caption: 'Pulled', photoUrl: `/posts/${session.id}/photo?v=1` });
    secureStore.set('auth-token', fakeApi.issueToken(account.id));
    await renderRouter('./src/app', { initialUrl: '/' });
    await screen.findByRole('header', { name: 'Workout' });
    await act(async () => router.navigate(`/profile/workouts/${session.id}`));
    await screen.findByLabelText('Carousel');

    // Saving waits for the cover's photo, so the image isn't captured without it.
    expect(screen.getByRole('button', { name: 'Save to Photos' })).toBeDisabled();
    await act(async () => fireEvent(screen.getByTestId('carousel-cover-photo'), 'load'));
    expect(screen.getByRole('button', { name: 'Save to Photos' })).toBeEnabled();
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await pressAndSave(screen.getByRole('button', { name: 'Save to Photos' }));

    expect(await screen.findByText('Saved 3 images to Photos. The caption is copied.')).toBeVisible();
    expect(sharing.savedToPhotos).toEqual(sharing.captured);
    expect(sharing.savedToPhotos).toHaveLength(3);
    expect(sharing.clipboard).toBe('Pulled');
    await fireEvent.press(screen.getByRole('button', { name: 'Open Instagram' }));
    expect(openURL).toHaveBeenCalledWith('instagram://app');
  });

  it('opens from Profile on top of it, and Edit workout changes or removes the photo and caption', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id, new Date(Date.now() - 86_400_000));
    fakeApi.addSet(fakeApi.addSessionExercise(session, 'Deadlift'), 140, 'kg', 3);
    fakeApi.finishSession(session, new Date(Date.now() - 86_400_000 + 3_600_000));
    secureStore.set('auth-token', fakeApi.issueToken(account.id));
    const app = renderRouter('./src/app', { initialUrl: '/' });
    await app;
    await screen.findByRole('header', { name: 'Workout' });
    await act(async () => router.navigate('/profile'));

    const workouts = within(await screen.findByLabelText('Workouts'));
    await fireEvent.press(await workouts.findByRole('button', { name: /Deadlift/ }));
    await screen.findByLabelText('Carousel');
    expect(app.getPathname()).toBe(`/profile/workouts/${session.id}`);
    // With no photo, the Carousel opens on a stats cover.
    expect(within(screen.getByLabelText('Carousel image 1 of 3')).getByText('Deadlift')).toBeVisible();

    // With no caption, the space for one opens Edit workout.
    await fireEvent.press(screen.getByRole('button', { name: 'Add a caption…' }));
    await screen.findByRole('header', { name: 'Edit workout' });
    imagePicker.nextPick = { uri: 'file:///photos/back.jpg', mimeType: 'image/jpeg', fileName: 'back.jpg' };
    await pressAndSave(screen.getByRole('button', { name: 'Add progress photo' }));
    await fireEvent.changeText(screen.getByLabelText('Caption'), 'Pulled');
    await pressAndSave(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Pulled')).toBeVisible();
    expect(fakeApi.post(session.id).photoUrl).not.toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Edit workout' }));
    await pressAndSave(await screen.findByRole('button', { name: 'Remove photo' }));
    expect(screen.queryByLabelText('Progress photo')).toBeNull();
    // A caption is at most 2,200 characters, counted as people count them: an emoji is one.
    await fireEvent.changeText(screen.getByLabelText('Caption'), '💪'.repeat(2200));
    expect(screen.getByText('2,200 / 2,200')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    await fireEvent.changeText(screen.getByLabelText('Caption'), '💪'.repeat(2201));
    expect(screen.getByText('2,201 / 2,200')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Caption'), '');
    await pressAndSave(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('button', { name: 'Add a caption…' })).toBeVisible();
    expect(fakeApi.post(session.id)).toEqual({ caption: '', photoUrl: null });

    // Back returns to Profile.
    await act(async () => router.back());
    expect(await screen.findByRole('header', { name: 'Profile' })).toBeVisible();
    expect(app.getPathname()).toBe('/profile');
  });

  it('Cancel throws the changes away, and a cleared name goes back to the one it was given', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id, new Date(Date.now() - 86_400_000));
    session.routineId = fakeApi.addRoutine(account.id, 'Pull day', ['Deadlift']).id;
    fakeApi.addSet(fakeApi.addSessionExercise(session, 'Deadlift'), 140, 'kg', 3);
    fakeApi.finishSession(session, new Date(Date.now() - 86_400_000 + 3_600_000));
    fakeApi.setSessionName(session.id, 'Heavy pulls');
    secureStore.set('auth-token', fakeApi.issueToken(account.id));
    await renderRouter('./src/app', { initialUrl: '/' });
    await screen.findByRole('header', { name: 'Workout' });
    await act(async () => router.navigate(`/profile/workouts/${session.id}`));
    await screen.findByRole('header', { name: 'Heavy pulls' });

    await fireEvent.press(screen.getByRole('button', { name: 'Edit workout' }));
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Something else');
    await fireEvent.changeText(screen.getByLabelText('Caption'), 'Never saved');
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('header', { name: 'Heavy pulls' })).toBeVisible();
    expect(fakeApi.sessionName(session.id)).toBe('Heavy pulls');
    expect(fakeApi.post(session.id).caption).toBe('');

    await fireEvent.press(screen.getByRole('button', { name: 'Edit workout' }));
    // A name is at most 60 characters, counted as people count them: an emoji is one.
    await fireEvent.changeText(await screen.findByLabelText('Name'), '💪'.repeat(61));
    expect(screen.getByLabelText('Name')).toHaveDisplayValue('💪'.repeat(60));
    await fireEvent.changeText(screen.getByLabelText('Name'), '');
    await pressAndSave(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('header', { name: 'Pull day' })).toBeVisible();
  });

  it('writes every Set into the Session summary, in the User unit, with its RPE and note', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id, new Date(2026, 10, 5, 9, 0));
    const squat = fakeApi.addSessionExercise(session, 'Back Squat');
    fakeApi.addSet(squat, 225, 'lb', 3, 'Belt on', 8.5);
    fakeApi.addSet(squat, 100, 'kg', 3);
    squat.note = 'Knees out';
    fakeApi.addSessionExercise(session, 'Plank');
    fakeApi.finishSession(session, new Date(2026, 10, 5, 10, 5));
    secureStore.set('auth-token', fakeApi.issueToken(account.id));
    await renderRouter('./src/app', { initialUrl: '/' });
    await screen.findByRole('header', { name: 'Workout' });
    await act(async () => router.navigate(`/profile/workouts/${session.id}`));
    await screen.findByLabelText('Carousel');

    await pressAndSave(screen.getByRole('button', { name: 'Copy session summary' }));

    await waitFor(() =>
      expect(sharing.clipboard).toBe(
        [
          "# Thursday's Morning Workout",
          '',
          '- Date: Thursday, November 5, 2026',
          '- Duration: 1 h 5 min',
          '- Volume: 606 kg', // 225 lb × 3 is 306.2 kg, then 300 kg.
          '- Sets: 2',
          '',
          '## Back Squat',
          '',
          '1. 102.06 kg × 3 @ RPE 8.5, note: Belt on',
          '2. 100 kg × 3',
          '',
          'Note: Knees out',
          '',
          '## Plank',
          '',
          'No sets logged.',
          '',
        ].join('\n'),
      ),
    );
  });

  it('without access to Photos, says so and saves nothing', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id);
    fakeApi.addSet(fakeApi.addSessionExercise(session, 'Deadlift'), 140, 'kg', 3);
    fakeApi.finishSession(session);
    secureStore.set('auth-token', fakeApi.issueToken(account.id));
    sharing.grantPhotos = false;
    await renderRouter('./src/app', { initialUrl: '/' });
    await screen.findByRole('header', { name: 'Workout' });
    await act(async () => router.navigate(`/profile/workouts/${session.id}`));
    await screen.findByLabelText('Carousel');

    await pressAndSave(screen.getByRole('button', { name: 'Save to Photos' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Allow access to Photos in Settings to save the images.',
    );
    expect(sharing.savedToPhotos).toEqual([]);
  });
});
