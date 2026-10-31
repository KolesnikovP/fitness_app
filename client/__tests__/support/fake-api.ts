import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/**
 * An in-memory fake of the backend API, served at the network boundary with
 * MSW. It follows the real API's contract (see backend/internal/auth,
 * backend/internal/user, backend/internal/exercise and
 * backend/internal/workout): same paths, bodies, status codes and error shape.
 */
type FakeAccount = {
  id: string;
  email: string;
  password: string;
  unitPreference: 'kg' | 'lb' | null;
};

type FakeExercise = {
  id: string;
  name: string;
  muscleGroup: string;
  equipmentType: string;
  isCustom: boolean;
  imageUrl: string | null;
  animatedDemoUrl: string | null;
  ownerId: string | null;
};

type FakeSet = {
  id: string;
  weight: number;
  weightUnit: 'kg' | 'lb';
  reps: number;
  rpe: number | null;
  note: string;
  supersetId: string | null;
};

type FakeSessionExercise = {
  id: string;
  exerciseId: string;
  note: string;
  supersetId: string | null;
  sets: FakeSet[];
};

type FakeSession = {
  id: string;
  ownerId: string;
  startedAt: string;
  finishedAt: string | null;
  exercises: FakeSessionExercise[];
};

/** A slice of the real seeded library, enough to search and filter. */
const CANONICAL: [name: string, muscleGroup: string, equipmentType: string][] = [
  ['Back Squat', 'quads', 'barbell'],
  ['Bench Press', 'chest', 'barbell'],
  ['Deadlift', 'back', 'barbell'],
  ['Dumbbell Bench Press', 'chest', 'dumbbell'],
  ['Lat Pulldown', 'back', 'cable'],
  ['Overhead Press', 'shoulders', 'barbell'],
  ['Plank', 'abs', 'bodyweight'],
];

const MEDIA_KINDS: Record<string, 'image' | 'animated_demo'> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/gif': 'animated_demo',
};

let accounts: FakeAccount[] = [];
let tokens = new Map<string, string>(); // token -> account id
let exercises: FakeExercise[] = [];
let sessions: FakeSession[] = [];
let nextId = 1;

function seedExercises() {
  exercises = CANONICAL.map(([name, muscleGroup, equipmentType], i) => ({
    id: `canonical-${i + 1}`,
    name,
    muscleGroup,
    equipmentType,
    isCustom: false,
    imageUrl: null,
    animatedDemoUrl: null,
    ownerId: null,
  }));
}
seedExercises();

export const fakeApi = {
  /** Every Authorization header the API received, in order. */
  authHeaders: [] as (string | null)[],
  /** Every media upload the API accepted, in order. */
  uploads: [] as { exerciseId: string; fileName: string; type: string }[],

  reset() {
    accounts = [];
    tokens = new Map();
    seedExercises();
    sessions = [];
    nextId = 1;
    this.authHeaders = [];
    this.uploads = [];
  },

  addAccount(email: string, password: string, unitPreference: FakeAccount['unitPreference']) {
    const account = { id: `account-${nextId++}`, email, password, unitPreference };
    accounts.push(account);
    return account;
  },

  issueToken(accountId: string) {
    const token = `token-${accountId}-${tokens.size + 1}`;
    tokens.set(token, accountId);
    return token;
  },

  findAccount(email: string) {
    return accounts.find((a) => a.email.toLowerCase() === email.toLowerCase());
  },

  addCustomExercise(ownerId: string, name: string, muscleGroup: string, equipmentType: string) {
    const exercise: FakeExercise = {
      id: `exercise-${nextId++}`,
      name,
      muscleGroup,
      equipmentType,
      isCustom: true,
      imageUrl: null,
      animatedDemoUrl: null,
      ownerId,
    };
    exercises.push(exercise);
    return exercise;
  },

  customExercises(ownerId: string) {
    return exercises.filter((e) => e.ownerId === ownerId);
  },

  exerciseNamed(name: string) {
    const exercise = exercises.find((e) => e.name === name);
    if (!exercise) throw new Error(`No fake exercise named ${name}`);
    return exercise;
  },

  /** Starts a session for ownerId, as if from an earlier run of the app. */
  addSession(ownerId: string, startedAt = new Date()) {
    const session: FakeSession = {
      id: `session-${nextId++}`,
      ownerId,
      startedAt: startedAt.toISOString(),
      finishedAt: null,
      exercises: [],
    };
    sessions.push(session);
    return session;
  },

  /** Adds a library exercise, by name, to a session. */
  addSessionExercise(session: FakeSession, name: string) {
    const sessionExercise: FakeSessionExercise = {
      id: `session-exercise-${nextId++}`,
      exerciseId: this.exerciseNamed(name).id,
      note: '',
      supersetId: null,
      sets: [],
    };
    session.exercises.push(sessionExercise);
    return sessionExercise;
  },

  addSet(
    sessionExercise: FakeSessionExercise,
    weight: number,
    weightUnit: 'kg' | 'lb',
    reps: number,
    note = '',
    rpe: number | null = null,
  ) {
    sessionExercise.sets.push({
      id: `set-${nextId++}`,
      weight,
      weightUnit,
      reps,
      rpe,
      note,
      supersetId: sessionExercise.supersetId,
    });
  },

  finishSession(session: FakeSession, finishedAt = new Date()) {
    session.finishedAt = finishedAt.toISOString();
  },

  sessions(ownerId: string) {
    return sessions.filter((s) => s.ownerId === ownerId);
  },
};

function error(status: number, code: string, message: string) {
  return HttpResponse.json({ error: { code, message } }, { status });
}

function caller(request: Request) {
  const header = request.headers.get('Authorization');
  fakeApi.authHeaders.push(header);
  const accountId = header?.startsWith('Bearer ') ? tokens.get(header.slice(7)) : undefined;
  return accounts.find((a) => a.id === accountId);
}

function unauthorized() {
  return error(401, 'unauthorized', 'Log in to continue.');
}

function visibleExercise(account: FakeAccount, id: string | readonly string[] | undefined) {
  return exercises.find((e) => e.id === id && (e.ownerId === null || e.ownerId === account.id));
}

function exerciseJson({ ownerId: _ownerId, ...exercise }: FakeExercise) {
  return exercise;
}

function sessionJson({ ownerId: _ownerId, exercises: sessionExercises, ...session }: FakeSession) {
  return {
    ...session,
    exercises: sessionExercises.map((sessionExercise) => ({
      ...sessionExercise,
      name: exercises.find((e) => e.id === sessionExercise.exerciseId)?.name ?? '',
    })),
  };
}

/**
 * The caller's {id} session if it's still in progress, or the error
 * response the real API sends instead.
 */
function sessionInProgress(account: FakeAccount, id: string | readonly string[] | undefined) {
  const session = sessions.find((s) => s.id === id && s.ownerId === account.id);
  if (!session) return { response: error(404, 'session_not_found', 'Workout not found.') };
  if (session.finishedAt) return { response: error(409, 'session_finished', 'This workout is already finished.') };
  return { session };
}

function sessionExerciseNotFound() {
  return error(404, 'session_exercise_not_found', "That exercise isn't in this workout.");
}

function me(account: FakeAccount) {
  return { id: account.id, email: account.email, unitPreference: account.unitPreference };
}

// The workout handlers come first: '*/exercises' would also match
// '/workouts/sessions/:id/exercises'.
const handlers = [
  http.get('*/workouts/sessions', ({ request }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const finished = sessions
      .filter((s) => s.ownerId === account.id && s.finishedAt)
      .sort((a, b) => b.finishedAt!.localeCompare(a.finishedAt!));
    return HttpResponse.json({
      sessions: finished.map((s) => {
        const { id, startedAt, finishedAt, exercises: sessionExercises } = sessionJson(s);
        return { id, startedAt, finishedAt, exerciseNames: sessionExercises.map((e) => e.name) };
      }),
    });
  }),

  http.post('*/workouts/sessions', ({ request }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    if (sessions.some((s) => s.ownerId === account.id && !s.finishedAt)) {
      return error(409, 'session_in_progress', 'Finish or discard your current workout before starting another.');
    }
    return HttpResponse.json(sessionJson(fakeApi.addSession(account.id)), { status: 201 });
  }),

  http.get('*/workouts/sessions/current', ({ request }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const session = sessions.find((s) => s.ownerId === account.id && !s.finishedAt);
    return HttpResponse.json({ session: session ? sessionJson(session) : null });
  }),

  http.post('*/workouts/sessions/:id/exercises', async ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const { exerciseId } = (await request.json()) as { exerciseId: string };
    if (!visibleExercise(account, exerciseId)) return error(404, 'exercise_not_found', 'Exercise not found.');
    const { session, response } = sessionInProgress(account, params.id);
    if (!session) return response;
    session.exercises.push({ id: `session-exercise-${nextId++}`, exerciseId, note: '', supersetId: null, sets: [] });
    return HttpResponse.json(sessionJson(session), { status: 201 });
  }),

  http.patch('*/workouts/sessions/:id/exercises/:sessionExerciseId', async ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const { note } = (await request.json()) as { note?: string };
    if (typeof note !== 'string') return error(400, 'invalid_note', 'Send the note, or an empty one to clear it.');
    if (note.trim().length > 500) return error(400, 'invalid_note', 'Notes can be at most 500 characters.');
    const { session, response } = sessionInProgress(account, params.id);
    if (!session) return response;
    const sessionExercise = session.exercises.find((e) => e.id === params.sessionExerciseId);
    if (!sessionExercise) return sessionExerciseNotFound();
    sessionExercise.note = note.trim();
    return HttpResponse.json(sessionJson(session));
  }),

  http.post('*/workouts/sessions/:id/exercises/:sessionExerciseId/sets', async ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const {
      weight,
      weightUnit,
      reps,
      rpe = null,
      note = '',
    } = (await request.json()) as Omit<FakeSet, 'id' | 'supersetId'>;
    if (typeof weight !== 'number' || weight < 0 || weight > 9999.99) {
      return error(400, 'invalid_weight', 'Weight must be from 0 to 9999.99.');
    }
    if (weightUnit !== 'kg' && weightUnit !== 'lb') {
      return error(400, 'invalid_weight_unit', 'weightUnit must be "kg" or "lb".');
    }
    if (!Number.isInteger(reps) || reps < 1 || reps > 1000) {
      return error(400, 'invalid_reps', 'Reps must be from 1 to 1000.');
    }
    if (rpe !== null && (typeof rpe !== 'number' || rpe < 1 || rpe > 10 || !Number.isInteger(rpe * 2))) {
      return error(400, 'invalid_rpe', 'RPE must be from 1 to 10 in half steps, or left blank.');
    }
    if (note.trim().length > 500) return error(400, 'invalid_note', 'Notes can be at most 500 characters.');
    const { session, response } = sessionInProgress(account, params.id);
    if (!session) return response;
    const sessionExercise = session.exercises.find((e) => e.id === params.sessionExerciseId);
    if (!sessionExercise) return sessionExerciseNotFound();
    fakeApi.addSet(sessionExercise, weight, weightUnit, reps, note.trim(), rpe);
    return HttpResponse.json(sessionJson(session), { status: 201 });
  }),

  http.post('*/workouts/sessions/:id/supersets', async ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const { sessionExerciseIds } = (await request.json()) as { sessionExerciseIds?: string[] };
    const ids = [...new Set(sessionExerciseIds ?? [])];
    if (ids.length < 2) {
      return error(400, 'invalid_superset', 'A superset needs at least two different exercises.');
    }
    const { session, response } = sessionInProgress(account, params.id);
    if (!session) return response;
    const members = session.exercises.filter((e) => ids.includes(e.id));
    if (members.length !== ids.length) return sessionExerciseNotFound();
    if (members.some((e) => e.supersetId !== null)) {
      return error(409, 'already_in_superset', 'One of those exercises is already in a superset. Ungroup it first.');
    }
    const supersetId = `superset-${nextId++}`;
    members.forEach((e) => (e.supersetId = supersetId));
    return HttpResponse.json(sessionJson(session), { status: 201 });
  }),

  http.delete('*/workouts/sessions/:id/supersets/:supersetId', ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const { session, response } = sessionInProgress(account, params.id);
    if (!session) return response;
    const members = session.exercises.filter((e) => e.supersetId === params.supersetId);
    if (members.length === 0) return error(404, 'superset_not_found', "That superset isn't in this workout.");
    members.forEach((e) => (e.supersetId = null));
    return HttpResponse.json(sessionJson(session));
  }),

  http.post('*/workouts/sessions/:id/finish', ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const { session, response } = sessionInProgress(account, params.id);
    if (!session) return response;
    if (!session.exercises.some((e) => e.sets.length > 0)) {
      return error(400, 'session_empty', 'Log at least one set before finishing.');
    }
    fakeApi.finishSession(session);
    return HttpResponse.json(sessionJson(session));
  }),

  http.delete('*/workouts/sessions/:id', ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const { session, response } = sessionInProgress(account, params.id);
    if (!session) return response;
    sessions = sessions.filter((s) => s !== session);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post('*/auth/signup', async ({ request }) => {
    const { email, password } = (await request.json()) as { email: string; password: string };
    if (!email.includes('@')) return error(400, 'invalid_email', 'Enter a valid email address.');
    if (password.length < 8) return error(400, 'invalid_password', 'Password must be 8 to 72 characters.');
    if (fakeApi.findAccount(email)) return error(409, 'email_taken', 'An account with this email already exists.');

    const account = fakeApi.addAccount(email, password, null);
    return HttpResponse.json(
      { token: fakeApi.issueToken(account.id), account: { id: account.id, email } },
      { status: 201 },
    );
  }),

  http.post('*/auth/login', async ({ request }) => {
    const { email, password } = (await request.json()) as { email: string; password: string };
    const account = fakeApi.findAccount(email);
    if (!account || account.password !== password) {
      return error(401, 'invalid_credentials', 'Email or password is incorrect.');
    }
    return HttpResponse.json({ token: fakeApi.issueToken(account.id), account: { id: account.id, email } });
  }),

  http.get('*/users/me', ({ request }) => {
    const account = caller(request);
    if (!account) return error(401, 'unauthorized', 'Log in to continue.');
    return HttpResponse.json(me(account));
  }),

  http.patch('*/users/me', async ({ request }) => {
    const account = caller(request);
    if (!account) return error(401, 'unauthorized', 'Log in to continue.');
    const { unitPreference } = (await request.json()) as { unitPreference: unknown };
    if (unitPreference !== 'kg' && unitPreference !== 'lb') {
      return error(400, 'invalid_unit_preference', 'unitPreference must be "kg" or "lb".');
    }
    account.unitPreference = unitPreference;
    return HttpResponse.json(me(account));
  }),

  http.get('*/exercises', ({ request }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const params = new URL(request.url).searchParams;
    const q = params.get('q')?.trim().toLowerCase();
    const muscleGroup = params.get('muscleGroup');
    const equipmentType = params.get('equipmentType');
    const found = exercises
      .filter((e) => e.ownerId === null || e.ownerId === account.id)
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .filter((e) => !muscleGroup || e.muscleGroup === muscleGroup)
      .filter((e) => !equipmentType || e.equipmentType === equipmentType)
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    return HttpResponse.json({ exercises: found.map(exerciseJson) });
  }),

  http.post('*/exercises', async ({ request }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const { name, muscleGroup, equipmentType } = (await request.json()) as Record<string, string>;
    if (!name?.trim()) return error(400, 'invalid_name', 'Name must be 1 to 100 characters.');
    const exercise = fakeApi.addCustomExercise(account.id, name.trim(), muscleGroup, equipmentType);
    return HttpResponse.json(exerciseJson(exercise), { status: 201 });
  }),

  http.get('*/exercises/:id', ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const exercise = visibleExercise(account, params.id);
    if (!exercise) return error(404, 'exercise_not_found', 'Exercise not found.');
    return HttpResponse.json(exerciseJson(exercise));
  }),

  http.post('*/exercises/:id/media', async ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const exercise = visibleExercise(account, params.id);
    if (!exercise) return error(404, 'exercise_not_found', 'Exercise not found.');
    if (!exercise.isCustom) {
      return error(403, 'exercise_not_editable', 'Only your own custom exercises can be changed.');
    }
    // MSW parses the body with Node's FormData; the global type is React Native's.
    const form = (await request.formData()) as unknown as { get(name: string): unknown };
    const file = form.get('file');
    if (!(file instanceof File)) {
      return error(400, 'missing_file', 'Send the file as the "file" field of a multipart form.');
    }
    // The real API sniffs the bytes; a fake file only has its declared type.
    const kind = MEDIA_KINDS[file.type];
    if (!kind) return error(415, 'unsupported_media_type', 'Upload a PNG, JPEG, WebP or GIF image.');

    fakeApi.uploads.push({ exerciseId: exercise.id, fileName: file.name, type: file.type });
    const url = `/exercises/${exercise.id}/${kind}?v=${fakeApi.uploads.length}`;
    if (kind === 'image') exercise.imageUrl = url;
    else exercise.animatedDemoUrl = url;
    return HttpResponse.json(exerciseJson(exercise));
  }),
];

export const server = setupServer(...handlers);
