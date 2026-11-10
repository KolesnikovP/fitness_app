// Puts the booted simulator in a new account with a workout in progress, for
// npm run sim-check to look at without touching anyone's own account. The
// account has finished one Bench Press workout (60 kg × 10 @ RPE 7, then
// 62.5 kg × 8 twice), and has Bench Press in progress with one Set logged,
// so the set table shows logged rows, rows still to do and Last time.
//
//   npm run sim-seed                 # then: npm run sim-check -- /workout/session
//   API_URL=http://localhost:8090 npm run sim-seed
//
// Logs the simulator out of whatever account it was in. Needs the API
// (backend: make dev) and Metro (npm run dev).
import { execFileSync } from 'node:child_process';

const api = process.env.API_URL ?? 'http://localhost:8080';
const metro = `exp://127.0.0.1:${process.env.PORT ?? '8081'}`;

async function call(method, path, token, body) {
  const res = await fetch(api + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {
    console.error(`sim-seed: no API at ${api}; start it with make dev in backend/`);
    process.exit(1);
  });
  const json = res.status === 204 ? null : await res.json();
  if (!res.ok) {
    console.error(`sim-seed: ${method} ${path} failed with ${res.status}: ${JSON.stringify(json)}`);
    process.exit(1);
  }
  return json;
}

const email = `sim-${Date.now()}@example.com`;
const password = 'sim-seed-password';
const { token } = await call('POST', '/auth/signup', null, { email, password });
await call('PATCH', '/users/me', token, { unitPreference: 'kg' });

const { exercises } = await call('GET', `/exercises?q=${encodeURIComponent('Bench Press')}`, token);
const bench = exercises.find((e) => e.name === 'Bench Press').id;

async function benchWorkout(sets) {
  const { id } = await call('POST', '/workouts/sessions', token, {});
  const session = await call('POST', `/workouts/sessions/${id}/exercises`, token, { exerciseId: bench });
  const sessionExercise = session.exercises.at(-1).id;
  for (const [weight, reps, rpe] of sets) {
    await call('POST', `/workouts/sessions/${id}/exercises/${sessionExercise}/sets`, token, {
      weight,
      weightUnit: 'kg',
      reps,
      rpe: rpe ?? null,
    });
  }
  return id;
}

const finished = await benchWorkout([
  [60, 10, 7],
  [62.5, 8],
  [62.5, 8],
]);
await call('POST', `/workouts/sessions/${finished}/finish`, token);
await benchWorkout([[60, 10]]);

const link = `${metro}/--/dev-log-in?token=${encodeURIComponent(token)}&next=${encodeURIComponent('/workout/session')}`;
execFileSync('xcrun', ['simctl', 'openurl', 'booted', link]);
console.log(`sim-seed: simulator logged in as ${email} (password ${password}), on /workout/session`);
