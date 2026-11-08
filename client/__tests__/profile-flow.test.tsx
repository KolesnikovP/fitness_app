import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { fakeApi } from './support/fake-api';
import { imagePicker } from './support/image-picker';
import { secureStore } from './support/secure-store';
import { readouts } from './support/set-table';

const DAY = 86_400_000;

/**
 * Launches the app signed in as account, and waits for the tab it opens on:
 * Workout. render() is async, so the pathname helpers are on the promise
 * renderRouter returns, wrapped here so awaiting launch doesn't unwrap it.
 */
async function launch(account: { id: string }) {
  secureStore.set('auth-token', fakeApi.issueToken(account.id));
  const app = renderRouter('./src/app', { initialUrl: '/' });
  await app;
  await screen.findByRole('header', { name: 'Workout' });
  return { app };
}

/**
 * Presses a control whose handler saves (and may then navigate): the save is still
 * settling after the press's own act() closes, so press inside an outer act()
 * that stays open until then.
 */
async function pressAndSettle(button: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    await fireEvent.press(button);
  });
}

async function openProfile() {
  await act(async () => router.navigate('/profile'));
  await screen.findByRole('header', { name: 'Profile' });
}

/** Logs a finished Session of one Exercise daysAgo, an hour long, with sets of [weight kg, reps]. */
function logWorkout(ownerId: string, daysAgo: number, exercise: string, ...sets: [number, number][]) {
  const started = new Date(Date.now() - daysAgo * DAY - 3_600_000);
  const session = fakeApi.addSession(ownerId, started);
  const sessionExercise = fakeApi.addSessionExercise(session, exercise);
  for (const [weight, reps] of sets) fakeApi.addSet(sessionExercise, weight, 'kg', reps);
  fakeApi.finishSession(session, new Date(started.getTime() + 3_600_000));
  return session;
}

describe('profile', () => {
  it('opens on Workout; a finished workout shows on Profile, opens, follows the Unit preference, and its record opens its chart', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const { app } = await launch(account);
    expect(app.getPathname()).toBe('/workout');

    await fireEvent.press(await screen.findByRole('button', { name: 'Start Workout' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Add exercise' }));
    const picker = within(await screen.findByLabelText('Exercise picker'));
    await fireEvent.changeText(picker.getByLabelText('Search exercises'), 'bench');
    await fireEvent.press(await picker.findByRole('button', { name: 'Dumbbell Bench Press' }));
    const card = within(await screen.findByLabelText('Dumbbell Bench Press card'));
    await fireEvent.changeText(card.getByLabelText('Set 1 weight (kg)'), '32,5');
    await fireEvent.changeText(card.getByLabelText('Set 1 reps'), '10');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Finish workout' })).toBeEnabled());
    await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Done' }));
    await screen.findByRole('header', { name: 'Workout' });

    await openProfile();
    expect(await screen.findByLabelText('1 workout')).toBeVisible();
    expect(screen.getByLabelText('0 personal records')).toBeVisible();
    expect(screen.getByLabelText('1 week streak')).toBeVisible();
    const workouts = within(screen.getByLabelText('Workouts'));
    const post = workouts.getByRole('button', { name: /Dumbbell Bench Press/ });
    expect(within(post).getByLabelText('Stats cover')).toBeVisible();
    expect(within(post).getByText('< 1 min · 325 kg')).toBeVisible();

    // The workout screen, on top of Profile.
    await fireEvent.press(post);
    const detail = within(await screen.findByLabelText('Workout detail'));
    expect(detail.getByText('32.5 kg × 10')).toBeVisible();
    expect(app.getPathname()).toMatch(/^\/profile\/workouts\//);
    await act(async () => router.back());

    await fireEvent.press(await screen.findByRole('button', { name: 'Settings' }));
    await pressAndSettle(await screen.findByRole('radio', { name: 'Pounds' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Pounds' })).toBeChecked());
    await act(async () => router.back());
    // 325 kg is 716.5 lb.
    expect(await within(screen.getByLabelText('Workouts')).findByText('< 1 min · 717 lb')).toBeVisible();

    await fireEvent.press(screen.getByRole('tab', { name: 'Progress' }));
    const bests = within(screen.getByLabelText('Bests by exercise'));
    // 32.5 kg × 10 is an Estimated 1RM of 43.3 kg, or 95.5 lb.
    expect(bests.getByText('95.5 lb')).toBeVisible();
    await fireEvent.press(bests.getByRole('button', { name: /^Dumbbell Bench Press: Estimated 1RM 95.5 lb/ }));
    const progress = within(await screen.findByLabelText('Progress'));
    expect(await progress.findByRole('image')).toHaveAccessibleName(/^Best 1RM, .*95\.5 lb$/);
    expect(app.getPathname()).toMatch(/^\/profile\/exercises\//);

    // And on the Workout tab, a new Set is logged in pounds.
    await act(async () => router.navigate('/workout'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Start Workout' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Add exercise' }));
    const next = within(await screen.findByLabelText('Exercise picker'));
    await fireEvent.changeText(next.getByLabelText('Search exercises'), 'bench');
    await fireEvent.press(await next.findByRole('button', { name: 'Dumbbell Bench Press' }));
    const nextCard = within(await screen.findByLabelText('Dumbbell Bench Press card'));
    expect(nextCard.getByLabelText('Set 1 weight (lb)')).toBeVisible();
  });

  it('counts Personal records and the Streak, which an empty week breaks', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    logWorkout(account.id, 28, 'Bench Press', [100, 5]);
    logWorkout(account.id, 21, 'Bench Press', [105, 5]); // An Estimated 1RM record and a rep record.
    logWorkout(account.id, 7, 'Bench Press', [100, 5]);
    logWorkout(account.id, 0, 'Bench Press', [90, 5]);
    await launch(account);

    await openProfile();
    expect(await screen.findByLabelText('4 workouts')).toBeVisible();
    expect(screen.getByLabelText('2 personal records')).toBeVisible();
    // This week and last; the week before that had none.
    expect(screen.getByLabelText('2 weeks streak')).toBeVisible();
    const workouts = within(screen.getByLabelText('Workouts'));
    expect(workouts.getByText('🏆 2 personal records')).toBeVisible();
  });

  it("shows a workout's Progress photo as its cover, and lists only its first three exercises", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const session = fakeApi.addSession(account.id, new Date(Date.now() - 45 * 60_000));
    for (const name of ['Bench Press', 'Back Squat', 'Deadlift', 'Lat Pulldown', 'Plank']) {
      fakeApi.addSet(fakeApi.addSessionExercise(session, name), 0, 'kg', 5);
    }
    fakeApi.finishSession(session);
    fakeApi.setPost(session.id, { caption: '', photoUrl: `/posts/${session.id}/photo?v=1` });
    await launch(account);

    await openProfile();
    const post = await within(screen.getByLabelText('Workouts')).findByRole('button', { name: /Bench Press/ });
    expect(within(post).getByLabelText('Progress photo')).toBeVisible();
    expect(within(post).queryByLabelText('Stats cover')).toBeNull();
    expect(within(post).getByText('Bench Press, Back Squat, Deadlift and 2 more')).toBeVisible();
  });

  it("colours a past workout's sets by how close they came to the best before it, even after a later record", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const workout = (daysAgo: number, sets: [number, number, string?][]) => {
      const session = fakeApi.addSession(account.id, new Date(Date.now() - daysAgo * DAY));
      const exercise = fakeApi.addSessionExercise(session, 'Bench Press');
      for (const [weight, reps, note] of sets) fakeApi.addSet(exercise, weight, 'kg', reps, note);
      fakeApi.finishSession(session, new Date(Date.now() - daysAgo * DAY + 3_600_000));
    };
    workout(3, [[100, 5]]);
    workout(2, [
      [105, 5],
      [100, 5, 'Paused at the chest'],
      [100, 4],
      [95, 5],
      [100, 3],
    ]);
    workout(1, [[120, 5]]); // A later record.
    await launch(account);

    await openProfile();
    const workouts = within(screen.getByLabelText('Workouts'));
    await fireEvent.press((await workouts.findAllByRole('button', { name: /Bench Press/ }))[1]);
    const detail = within(await screen.findByLabelText('Workout detail'));
    const line = (n: number) => detail.getByLabelText(`Set ${n}`);
    expect(readouts([1, 2, 3, 4, 5].map(line))).toEqual([
      '105 kg × 5, Personal record',
      '100 kg × 5, Silver', // A tie with the best.
      '100 kg × 4, Bronze',
      '95 kg × 5, Bronze',
      '100 kg × 3',
    ]);
    expect(within(line(1)).getByText('🏆')).toBeVisible();
    expect(within(line(2)).getByText('🥈')).toBeVisible();
    expect(within(line(5)).queryByText(/🏆|🥈|🥉/)).toBeNull();
    expect(detail.getByText('Paused at the chest')).toBeVisible();
    expect(within(line(2)).queryByText('Paused at the chest')).toBeNull();
  });

  it('names a workout after its routine, or else the day and the part of it it started in', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    // Monday, October 26 2026, and the Wednesday and Thursday after, in the device's time zone.
    const workoutAt = (day: number, hour: number, minute = 0) => {
      const session = fakeApi.addSession(account.id, new Date(2026, 9, day, hour, minute));
      fakeApi.addSet(fakeApi.addSessionExercise(session, 'Deadlift'), 140, 'kg', 5);
      fakeApi.finishSession(session, new Date(2026, 9, day, hour + 1, minute));
      return session;
    };
    workoutAt(26, 8);
    workoutAt(28, 12, 30);
    workoutAt(28, 19);
    workoutAt(29, 23);
    const fromRoutine = workoutAt(30, 7);
    fromRoutine.routineId = fakeApi.addRoutine(account.id, 'Pull day', ['Deadlift']).id;
    await launch(account);

    await openProfile();
    const workouts = within(await screen.findByLabelText('Workouts'));
    expect(await workouts.findByText('Pull day')).toBeVisible();
    expect(workouts.getByText("Thursday's Night Workout")).toBeVisible();
    expect(workouts.getByText("Wednesday's Evening Workout")).toBeVisible();
    expect(workouts.getByText("Wednesday's Afternoon Workout")).toBeVisible();
    expect(workouts.getByText("Monday's Morning Workout")).toBeVisible();

    await fireEvent.press(workouts.getByRole('button', { name: /Monday's Morning Workout/ }));
    expect(await screen.findByRole('header', { name: "Monday's Morning Workout" })).toBeVisible();
  });

  it("totals a workout's Volume in the user's unit, counting a set at 0 but adding nothing for it", async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'lb');
    const session = fakeApi.addSession(account.id, new Date(Date.now() - 45 * 60_000));
    fakeApi.addSet(fakeApi.addSessionExercise(session, 'Bench Press'), 100, 'kg', 5);
    fakeApi.addSet(fakeApi.addSessionExercise(session, 'Back Squat'), 100, 'lb', 10);
    fakeApi.addSet(fakeApi.addSessionExercise(session, 'Plank'), 0, 'lb', 1);
    fakeApi.finishSession(session);
    await launch(account);

    await openProfile();
    const post = await within(screen.getByLabelText('Workouts')).findByRole('button', { name: /Bench Press/ });
    // 100 kg × 5 is 1,102.3 lb.
    expect(within(post).getByText('45 min · 2,102 lb')).toBeVisible();
    expect(within(post).getByText('3 sets')).toBeVisible();
  });

  it('starts with no workouts and no records', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    await launch(account);

    await openProfile();
    expect(await screen.findByText('No finished workouts yet.')).toBeVisible();
    expect(screen.getByLabelText('0 workouts')).toBeVisible();
    expect(screen.getByLabelText('0 weeks streak')).toBeVisible();
    await fireEvent.press(screen.getByRole('tab', { name: 'Progress' }));
    expect(screen.getByText('Log a set with weight to see your bests here.')).toBeVisible();
  });

  it('names a new User after their email with their initials as avatar, until they edit their name and avatar', async () => {
    const account = fakeApi.addAccount('petr.k@example.com', 'correct-horse-battery', 'kg');
    await launch(account);
    await openProfile();
    expect(await screen.findByText('petr.k')).toBeVisible();
    expect(within(screen.getByLabelText('Avatar')).getByText('P')).toBeVisible();

    await fireEvent.press(screen.getByRole('button', { name: 'Edit profile' }));
    await screen.findByRole('header', { name: 'Edit profile' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Petr Kolesnikov');
    imagePicker.nextPick = { uri: 'file:///me.jpg', mimeType: 'image/jpeg', fileName: 'me.jpg' };
    await fireEvent.press(screen.getByRole('button', { name: 'Add avatar' }));
    await pressAndSettle(await screen.findByRole('button', { name: 'Save' }));

    await screen.findByRole('header', { name: 'Profile' });
    expect(await screen.findByText('Petr Kolesnikov')).toBeVisible();
    expect(fakeApi.avatarUploads).toEqual([{ accountId: account.id, fileName: 'me.jpg', type: 'image/jpeg' }]);
    expect(within(screen.getByLabelText('Avatar')).queryByText('PK')).toBeNull();

    // Cleared, the name and avatar go back to the email's and the initials.
    await fireEvent.press(screen.getByRole('button', { name: 'Edit profile' }));
    await fireEvent.changeText(await screen.findByLabelText('Name'), '');
    await fireEvent.press(screen.getByRole('button', { name: 'Remove avatar' }));
    await pressAndSettle(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('header', { name: 'Profile' });
    expect(await screen.findByText('petr.k')).toBeVisible();
    expect(within(screen.getByLabelText('Avatar')).getByText('P')).toBeVisible();
  });

  it('Cancel throws away an edit to the profile', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    await launch(account);
    await openProfile();

    await fireEvent.press(await screen.findByRole('button', { name: 'Edit profile' }));
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Someone else');
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    await screen.findByRole('header', { name: 'Profile' });
    expect(screen.getByText('lifter')).toBeVisible();
    expect(fakeApi.findAccount('lifter@example.com')!.name).toBeNull();
  });

  it('logs out from Settings', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    await launch(account);
    await openProfile();

    await fireEvent.press(await screen.findByRole('button', { name: 'Settings' }));
    expect(await screen.findByText('lifter@example.com')).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeVisible();
  });
});
