import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/**
 * An in-memory fake of the backend API, served at the network boundary with
 * MSW. It follows the real API's contract (see backend/internal/auth,
 * backend/internal/user and backend/internal/exercise): same paths, bodies,
 * status codes and error shape.
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
  equipment: string;
  isCustom: boolean;
  imageUrl: string | null;
  animationUrl: string | null;
  ownerId: string | null;
};

/** A slice of the real seeded library, enough to search and filter. */
const CANONICAL: [name: string, muscleGroup: string, equipment: string][] = [
  ['Back Squat', 'quads', 'barbell'],
  ['Bench Press', 'chest', 'barbell'],
  ['Deadlift', 'back', 'barbell'],
  ['Dumbbell Bench Press', 'chest', 'dumbbell'],
  ['Lat Pulldown', 'back', 'cable'],
  ['Overhead Press', 'shoulders', 'barbell'],
  ['Plank', 'abs', 'bodyweight'],
];

const MEDIA_KINDS: Record<string, 'image' | 'animation'> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/gif': 'animation',
};

let accounts: FakeAccount[] = [];
let tokens = new Map<string, string>(); // token -> account id
let exercises: FakeExercise[] = [];
let nextId = 1;

function seedExercises() {
  exercises = CANONICAL.map(([name, muscleGroup, equipment], i) => ({
    id: `canonical-${i + 1}`,
    name,
    muscleGroup,
    equipment,
    isCustom: false,
    imageUrl: null,
    animationUrl: null,
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

  addCustomExercise(ownerId: string, name: string, muscleGroup: string, equipment: string) {
    const exercise: FakeExercise = {
      id: `exercise-${nextId++}`,
      name,
      muscleGroup,
      equipment,
      isCustom: true,
      imageUrl: null,
      animationUrl: null,
      ownerId,
    };
    exercises.push(exercise);
    return exercise;
  },

  customExercises(ownerId: string) {
    return exercises.filter((e) => e.ownerId === ownerId);
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

function me(account: FakeAccount) {
  return { id: account.id, email: account.email, unitPreference: account.unitPreference };
}

const handlers = [
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
    const equipment = params.get('equipment');
    const found = exercises
      .filter((e) => e.ownerId === null || e.ownerId === account.id)
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .filter((e) => !muscleGroup || e.muscleGroup === muscleGroup)
      .filter((e) => !equipment || e.equipment === equipment)
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    return HttpResponse.json({ exercises: found.map(exerciseJson) });
  }),

  http.post('*/exercises', async ({ request }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const { name, muscleGroup, equipment } = (await request.json()) as Record<string, string>;
    if (!name?.trim()) return error(400, 'invalid_name', 'Name must be 1 to 100 characters.');
    const exercise = fakeApi.addCustomExercise(account.id, name.trim(), muscleGroup, equipment);
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
    else exercise.animationUrl = url;
    return HttpResponse.json(exerciseJson(exercise));
  }),
];

export const server = setupServer(...handlers);
