// Puts the booted simulator in a new account with a workout in progress, for
// npm run sim-check to look at without touching anyone's own account. The
// account has finished one Bench Press workout (60 kg × 10 @ RPE 7, then
// 62.5 kg × 8 twice), and has a Push day Routine in progress:
//   - Bench Press, 3 × 5 at 60 kg with a slot note and Dumbbell Bench Press as
//     a Substitute, one Set logged: the one shown, with logged rows, rows
//     still to do, Last time and "Set 2 of 3"
//   - Overhead Press, 2 × 8 at 40 kg, both logged: its tile's bar filled
//   - Lateral Raise and Triceps Pushdown in a Superset, nothing logged
//
//   npm run sim-seed                 # then: npm run sim-check -- /workout/session
//   API_URL=http://localhost:8090 npm run sim-seed
//
// Logs the simulator out of whatever account it was in. Needs the API
// (backend: make dev), and what scripts/sim-preflight.sh checks: a booted
// simulator with Expo Go, and Metro (npm run dev).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

try {
  execFileSync(fileURLToPath(new URL('./sim-preflight.sh', import.meta.url)), { stdio: 'inherit' });
} catch {
  process.exit(1);
}

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

/** The library Exercise's id by its exact name. */
async function exerciseId(name) {
  const { exercises } = await call('GET', `/exercises?q=${encodeURIComponent(name)}`, token);
  const found = exercises.find((e) => e.name === name);
  if (!found) {
    console.error(`sim-seed: no Exercise named ${name} in the library`);
    process.exit(1);
  }
  return found.id;
}

const bench = await exerciseId('Bench Press');

/** Logs each [weight, reps, rpe?] in kg to a Session exercise. */
async function logSets(sessionId, sessionExerciseId, sets) {
  for (const [weight, reps, rpe] of sets) {
    await call('POST', `/workouts/sessions/${sessionId}/exercises/${sessionExerciseId}/sets`, token, {
      weight,
      weightUnit: 'kg',
      reps,
      rpe: rpe ?? null,
    });
  }
}

// Last time for Bench Press.
const { id: finished } = await call('POST', '/workouts/sessions', token, {});
const before = await call('POST', `/workouts/sessions/${finished}/exercises`, token, { exerciseId: bench });
await logSets(finished, before.exercises.at(-1).id, [
  [60, 10, 7],
  [62.5, 8],
  [62.5, 8],
]);
await call('POST', `/workouts/sessions/${finished}/finish`, token);

/** A Routine slot of name, sets × reps at weight kg, in a Superset group or none. */
async function slot(name, sets, reps, weight, { note = '', supersetGroup = null, substitutes = [] } = {}) {
  return {
    exerciseId: await exerciseId(name),
    targetSets: sets,
    targetReps: reps,
    targetWeight: weight,
    weightUnit: 'kg',
    restSeconds: 90,
    note,
    supersetGroup,
    substituteIds: await Promise.all(substitutes.map(exerciseId)),
  };
}

const routine = await call('POST', '/routines', token, {
  name: 'Push day',
  slots: [
    await slot('Bench Press', 3, 5, 60, { note: 'Pause on the chest', substitutes: ['Dumbbell Bench Press'] }),
    await slot('Overhead Press', 2, 8, 40),
    await slot('Lateral Raise', 3, 12, 10, { supersetGroup: 1 }),
    await slot('Triceps Pushdown', 3, 12, 25, { supersetGroup: 1 }),
  ],
});
const session = await call('POST', '/workouts/sessions', token, {
  routineId: routine.id,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});
const [benchToday, overheadToday] = session.exercises;
await logSets(session.id, benchToday.id, [[60, 5]]);
await logSets(session.id, overheadToday.id, [
  [40, 8],
  [40, 8],
]);

const link = `${metro}/--/dev-log-in?token=${encodeURIComponent(token)}&next=${encodeURIComponent('/workout/session')}`;
execFileSync('xcrun', ['simctl', 'openurl', 'booted', link]);
console.log(`sim-seed: simulator logged in as ${email} (password ${password}), on /workout/session`);
