import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { fakeApi } from './support/fake-api';
import { secureStore } from './support/secure-store';

/** Launches the app signed in as a user with unit, on the first tab. */
async function openApp(unit: 'kg' | 'lb') {
  const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', unit);
  secureStore.set('auth-token', fakeApi.issueToken(account.id));
  await renderRouter('./src/app', { initialUrl: '/' });
  await screen.findByRole('header', { name: 'History' });
  return account;
}

/** "November 2", as the calendar labels a day. */
function dayLabel(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

/** "November 2026", as the calendar labels a month. */
function monthLabel(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

describe('history', () => {
  it('shows a workout once finished: in the list with its stats, in this week, and on the calendar', async () => {
    await openApp('kg');
    expect(await screen.findByText('No finished workouts yet.')).toBeVisible();
    const week = within(screen.getByLabelText('This week'));
    expect(await week.findByText('0 workouts')).toBeVisible();

    await act(async () => router.navigate('/workout'));
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

    await act(async () => router.navigate('/'));
    await screen.findByRole('header', { name: 'History' });
    const history = within(screen.getByLabelText('Past workouts'));
    expect(await history.findByText('Dumbbell Bench Press')).toBeVisible();
    expect(history.getByText('< 1 min · 325 kg · 1 exercise')).toBeVisible();
    const thisWeek = within(screen.getByLabelText('This week'));
    expect(await thisWeek.findByText('1 workout')).toBeVisible();
    expect(thisWeek.getByText('325 kg')).toBeVisible();
    expect(within(thisWeek.getByLabelText('Chest')).getByText('1 set')).toBeVisible();
    const calendar = within(screen.getByLabelText('Training calendar'));
    expect(calendar.getByText(monthLabel(new Date()))).toBeVisible();
    expect(calendar.getByLabelText(`${dayLabel(new Date())}, trained`)).toBeVisible();

    // Its detail, read-only.
    await fireEvent.press(history.getByRole('button', { name: /Dumbbell Bench Press/ }));
    const detail = within(await screen.findByLabelText('Workout detail'));
    expect(detail.getByText('< 1 min · 325 kg · 1 exercise')).toBeVisible();
    expect(detail.getByText('Dumbbell Bench Press')).toBeVisible();
    expect(detail.getByText('32.5 kg × 10')).toBeVisible();
    expect(detail.queryByRole('button', { name: /Log set|Edit set/ })).toBeNull();
  });

  it('marks the personal records of a workout that beats an earlier one, once finished and in History', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
    const earlier = fakeApi.addSession(account.id, new Date(Date.now() - 2 * 86_400_000));
    fakeApi.addSet(fakeApi.addSessionExercise(earlier, 'Bench Press'), 100, 'kg', 5);
    fakeApi.finishSession(earlier, new Date(Date.now() - 2 * 86_400_000 + 3_600_000));
    secureStore.set('auth-token', fakeApi.issueToken(account.id));
    await renderRouter('./src/app', { initialUrl: '/' });
    const past = within(await screen.findByLabelText('Past workouts'));
    await past.findByText('Bench Press');
    expect(past.queryByText(/personal record/)).toBeNull(); // The first-ever bench sets none.

    await act(async () => router.navigate('/workout'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Start Workout' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Add exercise' }));
    const picker = within(await screen.findByLabelText('Exercise picker'));
    await fireEvent.changeText(picker.getByLabelText('Search exercises'), 'bench');
    await fireEvent.press(await picker.findByRole('button', { name: 'Bench Press' }));
    const card = within(await screen.findByLabelText('Bench Press card'));
    await fireEvent.changeText(card.getByLabelText('Set 1 weight (kg)'), '105');
    await fireEvent.changeText(card.getByLabelText('Set 1 reps'), '5');
    await fireEvent.press(card.getByRole('button', { name: 'Log set 1' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Finish workout' })).toBeEnabled());
    await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));

    const finished = within(await screen.findByLabelText('Personal records'));
    expect(await finished.findByText('Bench Press: Estimated 1RM 122.5 kg, from 105 kg × 5')).toBeVisible();
    expect(finished.getByText('Bench Press: 105 kg × 5, best at 5 reps')).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    await screen.findByRole('header', { name: 'Workout' });

    await act(async () => router.navigate('/'));
    const history = within(await screen.findByLabelText('Past workouts'));
    expect(await history.findByText('2 personal records')).toBeVisible();
    await fireEvent.press(history.getAllByRole('button', { name: /Bench Press/ })[0]);
    const records = within(await screen.findByLabelText('Personal records'));
    expect(records.getByText('Bench Press: Estimated 1RM 122.5 kg, from 105 kg × 5')).toBeVisible();
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
    secureStore.set('auth-token', fakeApi.issueToken(account.id));
    await renderRouter('./src/app', { initialUrl: '/' });

    const history = within(await screen.findByLabelText('Past workouts'));
    expect(await history.findByText('Pull day')).toBeVisible();
    expect(history.getByText("Thursday's Night Workout")).toBeVisible();
    expect(history.getByText("Wednesday's Evening Workout")).toBeVisible();
    expect(history.getByText("Wednesday's Afternoon Workout")).toBeVisible();
    expect(history.getByText("Monday's Morning Workout")).toBeVisible();

    await fireEvent.press(history.getByRole('button', { name: /Monday's Morning Workout/ }));
    expect(await screen.findByRole('header', { name: "Monday's Morning Workout" })).toBeVisible();
  });

  it('totals only this week, in the user unit, and pages the calendar back by month', async () => {
    const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'lb');
    const now = new Date();
    const thisWeek = fakeApi.addSession(account.id, new Date(now.getTime() - 45 * 60_000));
    fakeApi.addSet(fakeApi.addSessionExercise(thisWeek, 'Bench Press'), 100, 'kg', 5);
    fakeApi.addSet(fakeApi.addSessionExercise(thisWeek, 'Back Squat'), 100, 'lb', 10);
    fakeApi.addSet(fakeApi.addSessionExercise(thisWeek, 'Plank'), 0, 'lb', 1);
    fakeApi.finishSession(thisWeek, now);
    const lastMonthDay = new Date(now.getFullYear(), now.getMonth() - 1, 15, 18);
    const lastMonth = fakeApi.addSession(account.id, new Date(lastMonthDay.getTime() - 60 * 60_000));
    fakeApi.addSet(fakeApi.addSessionExercise(lastMonth, 'Deadlift'), 200, 'kg', 3);
    fakeApi.finishSession(lastMonth, lastMonthDay);
    secureStore.set('auth-token', fakeApi.issueToken(account.id));
    await renderRouter('./src/app', { initialUrl: '/' });

    const history = within(await screen.findByLabelText('Past workouts'));
    // 100 kg × 5 is 1,102.3 lb; the plank at 0 adds nothing.
    expect(await history.findByText('45 min · 2,102 lb · 3 exercises')).toBeVisible();
    expect(history.getByText('1 h 0 min · 1,323 lb · 1 exercise')).toBeVisible();
    const week = within(screen.getByLabelText('This week'));
    expect(await week.findByText('1 workout')).toBeVisible();
    expect(week.getByText('2,102 lb')).toBeVisible();
    expect(week.queryByLabelText('Back')).toBeNull(); // Last month's deadlifts.

    const calendar = within(screen.getByLabelText('Training calendar'));
    expect(calendar.getByRole('button', { name: 'Next month' })).toBeDisabled();
    expect(calendar.queryByLabelText(`${dayLabel(lastMonthDay)}, trained`)).toBeNull();
    await fireEvent.press(calendar.getByRole('button', { name: 'Previous month' }));
    expect(calendar.getByText(monthLabel(lastMonthDay))).toBeVisible();
    expect(calendar.getByLabelText(`${dayLabel(lastMonthDay)}, trained`)).toBeVisible();
    expect(calendar.queryByLabelText(`${dayLabel(now)}, trained`)).toBeNull();
    await fireEvent.press(calendar.getByRole('button', { name: 'Next month' }));
    expect(calendar.getByText(monthLabel(now))).toBeVisible();
  });
});
