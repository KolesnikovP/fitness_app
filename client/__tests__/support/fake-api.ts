import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import type { AuthResponse } from '@/entities/auth';
import type { EquipmentType, Exercise, MuscleGroup } from '@/entities/exercise';
import type { Post, PostSummary } from '@/entities/post';
import type { Routine, RoutineSummary } from '@/entities/routine';
import type { Me, ProfileCounts } from '@/entities/user';
import type {
  Bests,
  ExerciseBest,
  ExerciseProgress,
  ExerciseRecords,
  Session,
  SessionSummary,
} from '@/entities/workout';

/**
 * An in-memory fake of the backend API, served at the network boundary with
 * MSW. It follows the real API's contract (see backend/internal/auth,
 * backend/internal/user, backend/internal/exercise, backend/internal/workout,
 * backend/internal/program and backend/internal/feed): same paths, bodies, status codes and error
 * shape.
 */
type FakeAccount = {
  id: string;
  email: string;
  password: string;
  unitPreference: 'kg' | 'lb' | null;
  /** The name they chose, null until they do. */
  name: string | null;
  avatarUrl: string | null;
};

type FakeExercise = {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipmentType: EquipmentType;
  instructions: string[];
  isCustom: boolean;
  imageUrl: string | null;
  animatedDemoUrl: string | null;
  ownerId: string | null;
};

type FakeSet = {
  id: string;
  exerciseId: string;
  weight: number;
  weightUnit: 'kg' | 'lb';
  reps: number;
  rpe: number | null;
  note: string;
  supersetId: string | null;
  type: 'normal' | 'warmup' | 'failure' | 'drop';
};

type FakeTarget = {
  sets: number;
  reps: number;
  weight: number;
  weightUnit: 'kg' | 'lb';
  restSeconds: number | null;
  note: string;
};

type FakeSessionExercise = {
  id: string;
  exerciseId: string;
  plannedExerciseId: string | null;
  substituteIds: string[];
  note: string;
  supersetId: string | null;
  target: FakeTarget | null;
  sets: FakeSet[];
};

type FakeSession = {
  id: string;
  ownerId: string;
  routineId: string | null;
  /**
   * What it was named when it started, or null for one added as if from
   * before Session names were stored, which is named as the app showed it
   * then: its Routine's name, else the day it started, on the device.
   */
  givenName: string | null;
  /** What the User renamed it to, null until they do. */
  name: string | null;
  startedAt: string;
  finishedAt: string | null;
  exercises: FakeSessionExercise[];
};

type FakeSlot = {
  id: string;
  exerciseId: string;
  targetSets: number;
  targetReps: number;
  targetWeight: number;
  weightUnit: 'kg' | 'lb';
  restSeconds: number | null;
  note: string;
  supersetGroup: number | null;
  substituteIds: string[];
};

type FakeRoutine = {
  id: string;
  ownerId: string;
  name: string;
  updatedAt: string;
  slots: FakeSlot[];
};

/** A slice of the real seeded library, enough to search and filter. */
const CANONICAL: [name: string, muscleGroup: MuscleGroup, equipmentType: EquipmentType][] = [
  ['Back Squat', 'quads', 'barbell'],
  ['Bench Press', 'chest', 'barbell'],
  ['Deadlift', 'back', 'barbell'],
  ['Dumbbell Bench Press', 'chest', 'dumbbell'],
  ['Incline Bench Press', 'chest', 'barbell'],
  ['Lat Pulldown', 'back', 'cable'],
  ['Overhead Press', 'shoulders', 'barbell'],
  ['Plank', 'abs', 'bodyweight'],
  ['Push-up', 'chest', 'bodyweight'],
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
let routines: FakeRoutine[] = [];
/** What Users added to their Posts, by Session id. A finished Session not here has a Post with neither. */
let posts = new Map<string, { caption: string; photoUrl: string | null }>();
let nextId = 1;

function seedExercises() {
  exercises = CANONICAL.map(([name, muscleGroup, equipmentType], i) => ({
    id: `canonical-${i + 1}`,
    name,
    muscleGroup,
    secondaryMuscles: [],
    equipmentType,
    instructions: [],
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
  /** Every Progress photo upload the API accepted, in order. */
  photoUploads: [] as { postId: string; fileName: string; type: string }[],
  /** Every avatar upload the API accepted, in order. */
  avatarUploads: [] as { accountId: string; fileName: string; type: string }[],

  reset() {
    accounts = [];
    tokens = new Map();
    seedExercises();
    sessions = [];
    routines = [];
    posts = new Map();
    nextId = 1;
    this.authHeaders = [];
    this.uploads = [];
    this.photoUploads = [];
    this.avatarUploads = [];
  },

  addAccount(email: string, password: string, unitPreference: FakeAccount['unitPreference']) {
    const account: FakeAccount = {
      id: `account-${nextId++}`,
      email,
      password,
      unitPreference,
      name: null,
      avatarUrl: null,
    };
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

  addCustomExercise(
    ownerId: string,
    name: string,
    muscleGroup: MuscleGroup,
    equipmentType: EquipmentType,
    { secondaryMuscles = [], instructions = [] }: { secondaryMuscles?: MuscleGroup[]; instructions?: string[] } = {},
  ) {
    const exercise: FakeExercise = {
      id: `exercise-${nextId++}`,
      name,
      muscleGroup,
      secondaryMuscles,
      equipmentType,
      instructions,
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

  /** The name of the library exercise id. */
  exerciseName(id: string) {
    return exerciseName(id);
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
      routineId: null,
      givenName: null,
      name: null,
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
      plannedExerciseId: null,
      substituteIds: [],
      note: '',
      supersetId: null,
      target: null,
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
    type: FakeSet['type'] = 'normal',
  ) {
    sessionExercise.sets.push({
      type,
      id: `set-${nextId++}`,
      exerciseId: sessionExercise.exerciseId,
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

  /** What a session is called now. */
  sessionName(sessionId: string) {
    return nameOf(sessions.find((s) => s.id === sessionId)!);
  },

  /** Renames a session, as if the User had. */
  setSessionName(sessionId: string, name: string) {
    sessions.find((s) => s.id === sessionId)!.name = name;
  },

  /** Sets what the User added to a finished Session's Post, as if from an earlier run of the app. */
  setPost(sessionId: string, post: { caption: string; photoUrl: string | null }) {
    posts.set(sessionId, post);
  },

  /** Saves a routine for ownerId of the named library exercises, each 3 × 10 at 50 kg. */
  addRoutine(ownerId: string, name: string, exerciseNames: string[]) {
    const routine: FakeRoutine = {
      id: `routine-${nextId++}`,
      ownerId,
      name,
      updatedAt: new Date().toISOString(),
      slots: exerciseNames.map((exerciseName) => ({
        id: `slot-${nextId++}`,
        exerciseId: this.exerciseNamed(exerciseName).id,
        targetSets: 3,
        targetReps: 10,
        targetWeight: 50,
        weightUnit: 'kg',
        restSeconds: null,
        note: '',
        supersetGroup: null,
        substituteIds: [],
      })),
    };
    routines.push(routine);
    return routine;
  },

  routines(ownerId: string) {
    return routines.filter((r) => r.ownerId === ownerId);
  },

  /** What the User added to a finished Session's Post. */
  post(sessionId: string) {
    return posts.get(sessionId) ?? { caption: '', photoUrl: null };
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

function exerciseJson({ ownerId: _ownerId, ...exercise }: FakeExercise): Exercise {
  return exercise;
}

function exerciseRef(exerciseId: string) {
  return { exerciseId, name: exerciseName(exerciseId) };
}

const KG_PER_LB = 0.45359237;

/** The user's unit; kg until they choose. */
function unitOf(ownerId: string) {
  return accounts.find((a) => a.id === ownerId)?.unitPreference ?? 'kg';
}

/** Sum of weight × reps in unit, to one decimal, as the real API works it out. */
function volumeOf(sets: FakeSet[], unit: 'kg' | 'lb') {
  const kg = sets.reduce((sum, s) => sum + (s.weightUnit === 'lb' ? s.weight * KG_PER_LB : s.weight) * s.reps, 0);
  return Math.round((unit === 'lb' ? kg / KG_PER_LB : kg) * 10) / 10;
}

/** What was done in a session: each set's exercise, or the exercise's own if it has none, each once. */
function exercisesDone(session: FakeSession) {
  return [
    ...new Set(
      session.exercises.flatMap((e) => (e.sets.length > 0 ? e.sets.map((s) => s.exerciseId) : [e.exerciseId])),
    ),
  ];
}

function statsOf(session: FakeSession) {
  if (!session.finishedAt) return null;
  const unit = unitOf(session.ownerId);
  // Warm-ups count toward no stats, as in the real API.
  const working = session.exercises.flatMap((e) => e.sets).filter((s) => s.type !== 'warmup');
  return {
    durationSeconds: Math.floor((Date.parse(session.finishedAt) - Date.parse(session.startedAt)) / 1000),
    volume: volumeOf(working, unit),
    volumeUnit: unit,
    exerciseCount: exercisesDone(session).length,
    setCount: working.length,
  };
}

const kgOf = (s: FakeSet) => (s.weightUnit === 'lb' ? s.weight * KG_PER_LB : s.weight);
/** Epley's: weight × (1 + reps / 30), or the weight for 1 rep. */
const estimated1RM = (kg: number, reps: number) => (reps === 1 ? kg : kg * (1 + reps / 30));
const toUnit = (kg: number, unit: 'kg' | 'lb') => Math.round((unit === 'lb' ? kg / KG_PER_LB : kg) * 10) / 10;
const BEATS_BY = 1e-6;

/**
 * The Bests of an Exercise over finished, oldest first, as the real API works
 * them out: the first to reach a value keeps it, and those by weight come
 * only from Sets with weight.
 */
function bestsOf(finished: FakeSession[], exerciseId: string, unit: 'kg' | 'lb'): Bests {
  type Top = { session: FakeSession; set?: FakeSet; value: number };
  const tops: Record<'estimated1RM' | 'heaviestWeight' | 'setVolume' | 'exerciseVolume' | 'mostReps', Top | null> = {
    estimated1RM: null,
    heaviestWeight: null,
    setVolume: null,
    exerciseVolume: null,
    mostReps: null,
  };
  const offer = (key: keyof typeof tops, top: Top) => {
    if (!tops[key] || top.value > tops[key]!.value + BEATS_BY) tops[key] = top;
  };
  for (const session of finished) {
    const sets = setsOf(session).filter((set) => set.exerciseId === exerciseId);
    if (sets.length === 0) continue;
    let volumeKg = 0;
    for (const set of sets.filter((s) => s.weight > 0)) {
      const kg = kgOf(set);
      offer('estimated1RM', { session, set, value: estimated1RM(kg, set.reps) });
      offer('heaviestWeight', { session, set, value: kg });
      offer('setVolume', { session, set, value: kg * set.reps });
      volumeKg += kg * set.reps;
    }
    if (volumeKg > 0) offer('exerciseVolume', { session, value: volumeKg });
    offer('mostReps', { session, value: sets.reduce((n, s) => n + s.reps, 0) });
  }
  const json = (top: Top | null, inUnit: boolean) =>
    top && {
      value: inUnit ? toUnit(top.value, unit) : top.value,
      ...(inUnit ? { unit } : {}),
      sessionId: top.session.id,
      achievedAt: top.session.finishedAt!,
      ...(top.set
        ? { set: { setId: top.set.id, weight: top.set.weight, weightUnit: top.set.weightUnit, reps: top.set.reps } }
        : {}),
    };
  return {
    estimated1RM: json(tops.estimated1RM, true),
    heaviestWeight: json(tops.heaviestWeight, true),
    setVolume: json(tops.setVolume, true),
    exerciseVolume: json(tops.exerciseVolume, true),
    mostReps: json(tops.mostReps, false),
  };
}

function setsOf(session: FakeSession) {
  return session.exercises.flatMap((e) => e.sets);
}

/**
 * The sets of the owner's finished sessions before session: every finished
 * one, while it is in progress.
 */
function earlierSetsOf(session: FakeSession) {
  return sessions
    .filter(
      (s) =>
        s !== session &&
        s.ownerId === session.ownerId &&
        s.finishedAt &&
        (!session.finishedAt || s.finishedAt < session.finishedAt),
    )
    .flatMap(setsOf);
}

/**
 * The records a finished session set, as the real API works them out: the
 * session's best set of each kind for an exercise, when it beats every set of
 * the owner's earlier finished sessions (of which there must be one). One in
 * progress has the records its sets set so far, against every finished one.
 */
function recordHitsOf(session: FakeSession) {
  const earlier = earlierSetsOf(session);
  const bestE1RM = new Map<string, { set: FakeSet; kg: number }>();
  const bestReps = new Map<string, { set: FakeSet; kg: number }>();
  for (const set of setsOf(session)) {
    if (set.weight <= 0) continue;
    const e1rm = estimated1RM(kgOf(set), set.reps);
    const top = bestE1RM.get(set.exerciseId);
    if (!top || e1rm > top.kg + BEATS_BY) bestE1RM.set(set.exerciseId, { set, kg: e1rm });
    const key = `${set.exerciseId}/${set.reps}`;
    const heaviest = bestReps.get(key);
    if (!heaviest || kgOf(set) > heaviest.kg + BEATS_BY) bestReps.set(key, { set, kg: kgOf(set) });
  }
  const hits: { set: FakeSet; kind: 'estimated1RM' | 'reps' }[] = [];
  for (const [exerciseId, { set, kg }] of bestE1RM) {
    const prior = earlier.filter((s) => s.exerciseId === exerciseId);
    if (prior.length > 0 && prior.every((s) => kg > estimated1RM(kgOf(s), s.reps) + BEATS_BY)) {
      hits.push({ set, kind: 'estimated1RM' });
    }
  }
  for (const { set, kg } of bestReps.values()) {
    const prior = earlier.filter((s) => s.exerciseId === set.exerciseId && s.reps === set.reps);
    if (prior.length > 0 && prior.every((s) => kg > kgOf(s) + BEATS_BY)) hits.push({ set, kind: 'reps' });
  }
  const order = setsOf(session);
  hits.sort((a, b) => order.indexOf(a.set) - order.indexOf(b.set) || a.kind.localeCompare(b.kind));
  return hits;
}

function personalRecordsOf(session: FakeSession) {
  const unit = unitOf(session.ownerId);
  return recordHitsOf(session).map(({ set, kind }) => ({
    kind,
    setId: set.id,
    exerciseId: set.exerciseId,
    name: exerciseName(set.exerciseId),
    weight: set.weight,
    weightUnit: set.weightUnit,
    reps: set.reps,
    estimated1RM: toUnit(estimated1RM(kgOf(set), set.reps), unit),
    estimated1RMUnit: unit,
  }));
}

/**
 * Each set's Record tier, as the real API works it out: gold for a set
 * holding a record, else silver at 97.5% of the best Estimated 1RM of the
 * exercise's earlier sets with weight, and bronze at 95%; null below that,
 * at weight 0 or with no earlier set to measure against.
 */
function recordTiersOf(session: FakeSession) {
  const gold = new Set(recordHitsOf(session).map((hit) => hit.set.id));
  const earlier = earlierSetsOf(session).filter((s) => s.weight > 0);
  const tiers = new Map<string, 'gold' | 'silver' | 'bronze' | null>();
  for (const set of setsOf(session)) {
    const prior = earlier.filter((s) => s.exerciseId === set.exerciseId);
    const best = Math.max(0, ...prior.map((s) => estimated1RM(kgOf(s), s.reps)));
    const e1rm = estimated1RM(kgOf(set), set.reps);
    if (gold.has(set.id)) tiers.set(set.id, 'gold');
    else if (set.weight <= 0 || best <= 0) tiers.set(set.id, null);
    else if (e1rm >= 0.975 * best - BEATS_BY) tiers.set(set.id, 'silver');
    else if (e1rm >= 0.95 * best - BEATS_BY) tiers.set(set.id, 'bronze');
    else tiers.set(set.id, null);
  }
  return tiers;
}

const PARTS_OF_DAY: [fromHour: number, part: string][] = [
  [21, 'Night'],
  [17, 'Evening'],
  [12, 'Afternoon'],
  [5, 'Morning'],
];

/**
 * What a Session is named when it starts: its Routine's name (its first 60
 * characters), or the weekday and part of the day it started in timeZone
 * (the device's when undefined).
 */
function givenNameOf(routineName: string | null, startedAt: Date, timeZone?: string) {
  if (routineName) return [...routineName].slice(0, 60).join('');
  const parts = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(startedAt);
  const weekday = parts.find((p) => p.type === 'weekday')!.value;
  const hour = Number(parts.find((p) => p.type === 'hour')!.value);
  const part = PARTS_OF_DAY.find(([from]) => hour >= from)?.[1] ?? 'Night';
  return `${weekday}'s ${part} Workout`;
}

/** What a Session is called: the User's name for it, else the one it was given. */
function nameOf(session: FakeSession) {
  if (session.name) return session.name;
  if (session.givenName) return session.givenName;
  const routineName = routines.find((r) => r.id === session.routineId)?.name ?? null;
  return givenNameOf(routineName, new Date(session.startedAt));
}

function sessionJson(fakeSession: FakeSession): Session {
  const tiers = recordTiersOf(fakeSession);
  const { ownerId: _ownerId, exercises: sessionExercises, givenName: _given, name: _name, ...session } = fakeSession;
  return {
    ...session,
    name: nameOf(fakeSession),
    // The routine's name as it is now; null once it's deleted.
    routineName: routines.find((r) => r.id === session.routineId)?.name ?? null,
    stats: statsOf(fakeSession),
    personalRecords: personalRecordsOf(fakeSession),
    exercises: sessionExercises.map(({ plannedExerciseId, substituteIds, sets, ...sessionExercise }) => ({
      ...sessionExercise,
      name: exerciseName(sessionExercise.exerciseId),
      planned: plannedExerciseId === null ? null : exerciseRef(plannedExerciseId),
      substitutes: substituteIds.map(exerciseRef),
      sets: sets.map((set) => ({ ...set, name: exerciseName(set.exerciseId), recordTier: tiers.get(set.id) ?? null })),
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

/**
 * The Post of the caller's finished {id} session, or the error response the
 * real API sends instead.
 */
function ownPost(account: FakeAccount, id: string | readonly string[] | undefined) {
  const session = sessions.find((s) => s.id === id && s.ownerId === account.id && s.finishedAt);
  if (!session) return { response: error(404, 'post_not_found', 'Post not found.') };
  return { session };
}

function postJson(session: FakeSession): Post {
  return { id: session.id, ...fakeApi.post(session.id), session: sessionJson(session) };
}

function sessionExerciseNotFound() {
  return error(404, 'session_exercise_not_found', "That exercise isn't in this workout.");
}

function setNotFound() {
  return error(404, 'set_not_found', "That set isn't in this workout.");
}

/** The 400 the real API sends for a Set it won't log or save, or null if it's valid. */
type SetBody = Partial<Omit<FakeSet, 'id' | 'exerciseId' | 'supersetId'>>;

function invalidSet({ weight, weightUnit, reps, rpe = null, note = '', type = 'normal' }: SetBody) {
  if (!['normal', 'warmup', 'failure', 'drop'].includes(type)) {
    return error(400, 'invalid_set_type', 'type must be "normal", "warmup", "failure" or "drop", or left blank.');
  }
  if (typeof weight !== 'number' || weight < 0 || weight > 9999.99) {
    return error(400, 'invalid_weight', 'Weight must be from 0 to 9999.99.');
  }
  if (weightUnit !== 'kg' && weightUnit !== 'lb') {
    return error(400, 'invalid_weight_unit', 'weightUnit must be "kg" or "lb".');
  }
  if (!Number.isInteger(reps) || reps! < 1 || reps! > 1000) {
    return error(400, 'invalid_reps', 'Reps must be from 1 to 1000.');
  }
  if (rpe !== null && (typeof rpe !== 'number' || rpe < 1 || rpe > 10 || !Number.isInteger(rpe * 2))) {
    return error(400, 'invalid_rpe', 'RPE must be from 1 to 10 in half steps, or left blank.');
  }
  if (note.trim().length > 500) return error(400, 'invalid_note', 'Notes can be at most 500 characters.');
  return null;
}

function exerciseName(id: string) {
  return exercises.find((e) => e.id === id)?.name ?? '';
}

function routineJson({ ownerId: _ownerId, slots, ...routine }: FakeRoutine): Routine {
  return {
    ...routine,
    slots: slots.map(({ substituteIds, ...slot }) => ({
      ...slot,
      name: exerciseName(slot.exerciseId),
      substitutes: substituteIds.map(exerciseRef),
    })),
  };
}

function routineNotFound() {
  return error(404, 'routine_not_found', 'Routine not found.');
}

type SlotBody = Partial<Omit<FakeSlot, 'id'>>;

/**
 * The routine the real API would save from body, tidied as it does, or the
 * error response it sends instead.
 */
function plannedRoutine(account: FakeAccount, body: { name?: string; slots?: SlotBody[] }) {
  const name = (body.name ?? '').trim();
  if (name.length < 1 || name.length > 100) {
    return { response: error(400, 'invalid_name', 'Name must be 1 to 100 characters.') };
  }
  const slots = body.slots ?? [];
  if (slots.length === 0) return { response: error(400, 'invalid_slots', 'Add at least one exercise.') };
  if (slots.length > 50) return { response: error(400, 'invalid_slots', 'A routine can have at most 50 exercises.') };
  const groupOrder: number[] = [];
  const groupSizes = new Map<number, number>();
  for (const slot of slots) {
    const { targetSets, targetReps, targetWeight, weightUnit, restSeconds = null, supersetGroup = null } = slot;
    if (!Number.isInteger(targetSets) || targetSets! < 1 || targetSets! > 20) {
      return { response: error(400, 'invalid_target_sets', 'Target sets must be from 1 to 20.') };
    }
    if (!Number.isInteger(targetReps) || targetReps! < 1 || targetReps! > 1000) {
      return { response: error(400, 'invalid_target_reps', 'Target reps must be from 1 to 1000.') };
    }
    if (typeof targetWeight !== 'number' || targetWeight < 0 || targetWeight > 9999.99) {
      return { response: error(400, 'invalid_target_weight', 'Target weight must be from 0 to 9999.99.') };
    }
    if (weightUnit !== 'kg' && weightUnit !== 'lb') {
      return { response: error(400, 'invalid_weight_unit', 'weightUnit must be "kg" or "lb".') };
    }
    if (restSeconds !== null && (restSeconds < 1 || restSeconds > 3600)) {
      return { response: error(400, 'invalid_rest', 'Rest must be from 1 to 3600 seconds, or left blank.') };
    }
    if ((slot.note ?? '').trim().length > 500) {
      return { response: error(400, 'invalid_note', 'Notes can be at most 500 characters.') };
    }
    const substituteIds = slot.substituteIds ?? [];
    if (substituteIds.length > 10) {
      return { response: error(400, 'invalid_substitutes', 'An exercise can have at most 10 substitutes.') };
    }
    if (substituteIds.includes(slot.exerciseId!)) {
      return { response: error(400, 'invalid_substitutes', "An exercise can't be its own substitute.") };
    }
    if (new Set(substituteIds).size !== substituteIds.length) {
      return { response: error(400, 'invalid_substitutes', 'Each substitute can be added once.') };
    }
    if (supersetGroup !== null) {
      if (supersetGroup < 1) {
        return { response: error(400, 'invalid_superset', 'supersetGroup must be a positive number, or null.') };
      }
      if (!groupSizes.has(supersetGroup)) groupOrder.push(supersetGroup);
      groupSizes.set(supersetGroup, (groupSizes.get(supersetGroup) ?? 0) + 1);
    }
  }
  if ([...groupSizes.values()].some((size) => size < 2)) {
    return { response: error(400, 'invalid_superset', 'A superset needs at least two exercises.') };
  }
  // As the real API does, once everything else is valid.
  if (
    slots.some(
      (slot) =>
        !visibleExercise(account, slot.exerciseId) ||
        (slot.substituteIds ?? []).some((id) => !visibleExercise(account, id)),
    )
  ) {
    return { response: error(404, 'exercise_not_found', 'Exercise not found.') };
  }
  return {
    name,
    slots: slots.map((slot): FakeSlot => ({
      id: `slot-${nextId++}`,
      exerciseId: slot.exerciseId!,
      targetSets: slot.targetSets!,
      targetReps: slot.targetReps!,
      targetWeight: slot.targetWeight!,
      weightUnit: slot.weightUnit!,
      restSeconds: slot.restSeconds ?? null,
      note: (slot.note ?? '').trim(),
      supersetGroup: slot.supersetGroup == null ? null : groupOrder.indexOf(slot.supersetGroup) + 1,
      substituteIds: [...(slot.substituteIds ?? [])],
    })),
  };
}

function me(account: FakeAccount): Me {
  return {
    id: account.id,
    email: account.email,
    name: account.name ?? account.email.split('@')[0],
    avatarUrl: account.avatarUrl,
    unitPreference: account.unitPreference,
  };
}

/** The Monday of when's week, in the device's time zone, which the app sends as the User's. */
function weekOf(when: Date) {
  return new Date(when.getFullYear(), when.getMonth(), when.getDate() - ((when.getDay() + 6) % 7)).getTime();
}

/** Weeks in a row with a finished Session, up to this one; this week doesn't break it before it's over. */
function streakOf(finished: Date[], now = new Date()) {
  const weeks = new Set(finished.map(weekOf));
  const back = (week: number) => {
    const d = new Date(week);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7).getTime();
  };
  let week = weekOf(now);
  if (!weeks.has(week)) week = back(week);
  let n = 0;
  for (; weeks.has(week); week = back(week)) n++;
  return n;
}

function finishedSessionsOf(account: FakeAccount) {
  return sessions
    .filter((s) => s.ownerId === account.id && s.finishedAt)
    .sort((a, b) => b.finishedAt!.localeCompare(a.finishedAt!));
}

function sessionSummaryJson(s: FakeSession): SessionSummary {
  const { id, name, routineName, startedAt, finishedAt, stats, personalRecords } = sessionJson(s);
  const exerciseNames = [...new Set(exercisesDone(s).map(exerciseName))];
  // Only finished Sessions are summarised, so both are set.
  return { id, name, routineName, startedAt, finishedAt: finishedAt!, stats: stats!, personalRecords, exerciseNames };
}

// The workout handlers come first: '*/exercises' would also match
// '/workouts/sessions/:id/exercises'.
const handlers = [
  http.get('*/workouts/sessions', ({ request }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    return HttpResponse.json<{ sessions: SessionSummary[] }>({
      sessions: finishedSessionsOf(account).map(sessionSummaryJson),
    });
  }),

  http.get('*/workouts/records', ({ request }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const unit = unitOf(account.id);
    const best = new Map<string, { session: FakeSession; set: FakeSet; kg: number }>();
    for (const session of finishedSessionsOf(account).reverse()) {
      for (const set of setsOf(session)) {
        if (set.weight <= 0) continue;
        const kg = estimated1RM(kgOf(set), set.reps);
        const top = best.get(set.exerciseId);
        if (!top || kg > top.kg + BEATS_BY) best.set(set.exerciseId, { session, set, kg });
      }
    }
    return HttpResponse.json<{ exercises: ExerciseBest[] }>({
      exercises: [...best.entries()]
        .map(([exerciseId, { session, set, kg }]) => ({
          exerciseId,
          name: exerciseName(exerciseId),
          best: {
            sessionId: session.id,
            setId: set.id,
            achievedAt: session.finishedAt!,
            weight: set.weight,
            weightUnit: set.weightUnit,
            reps: set.reps,
            estimated1RM: toUnit(kg, unit),
            estimated1RMUnit: unit,
          },
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  }),

  http.post('*/workouts/sessions', async ({ request }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const text = await request.text();
    const { routineId, timeZone } = (text ? JSON.parse(text) : {}) as { routineId?: string; timeZone?: string };
    const routine = routineId == null ? null : routines.find((r) => r.id === routineId && r.ownerId === account.id);
    if (routine === undefined) return routineNotFound();
    if (sessions.some((s) => s.ownerId === account.id && !s.finishedAt)) {
      return error(409, 'session_in_progress', 'Finish or discard your current workout before starting another.');
    }
    const session = fakeApi.addSession(account.id);
    let zone: string | undefined = 'UTC';
    try {
      zone = new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone;
    } catch {
      // An unknown time zone: named in UTC, as the real API does.
    }
    session.givenName = givenNameOf(routine?.name ?? null, new Date(session.startedAt), timeZone ? zone : 'UTC');
    if (routine) {
      session.routineId = routine.id;
      const supersets = new Map<number, string>();
      for (const slot of routine.slots) {
        if (slot.supersetGroup !== null && !supersets.has(slot.supersetGroup)) {
          supersets.set(slot.supersetGroup, `superset-${nextId++}`);
        }
        session.exercises.push({
          id: `session-exercise-${nextId++}`,
          exerciseId: slot.exerciseId,
          plannedExerciseId: slot.exerciseId,
          substituteIds: [...slot.substituteIds],
          note: '',
          supersetId: slot.supersetGroup === null ? null : supersets.get(slot.supersetGroup)!,
          target: {
            sets: slot.targetSets,
            reps: slot.targetReps,
            weight: slot.targetWeight,
            weightUnit: slot.weightUnit,
            restSeconds: slot.restSeconds,
            note: slot.note,
          },
          sets: [],
        });
      }
    }
    return HttpResponse.json(sessionJson(session), { status: 201 });
  }),

  http.get('*/workouts/sessions/current', ({ request }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const session = sessions.find((s) => s.ownerId === account.id && !s.finishedAt);
    return HttpResponse.json<{ session: Session | null }>({ session: session ? sessionJson(session) : null });
  }),

  http.get('*/workouts/sessions/:id', ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const session = sessions.find((s) => s.id === params.id && s.ownerId === account.id);
    if (!session) return error(404, 'session_not_found', 'Workout not found.');
    return HttpResponse.json(sessionJson(session));
  }),

  http.patch('*/workouts/sessions/:id', async ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const { name } = (await request.json()) as { name?: string };
    if (name === undefined) return error(400, 'missing_name', 'Send the name as "name"; an empty one clears it.');
    const trimmed = name.trim();
    if ([...trimmed].length > 60) return error(400, 'name_too_long', 'Names can be at most 60 characters.');
    const session = sessions.find((s) => s.id === params.id && s.ownerId === account.id);
    if (!session) return error(404, 'session_not_found', 'Workout not found.');
    session.name = trimmed === '' ? null : trimmed;
    return HttpResponse.json(sessionJson(session));
  }),

  http.get('*/workouts/exercises/:id/records', ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    if (!visibleExercise(account, params.id)) return error(404, 'exercise_not_found', 'Exercise not found.');
    const unit = unitOf(account.id);
    const finished = sessions
      .filter((s) => s.ownerId === account.id && s.finishedAt)
      .sort((a, b) => a.finishedAt!.localeCompare(b.finishedAt!));
    const done = finished.flatMap((session) =>
      setsOf(session)
        .filter((set) => set.exerciseId === params.id && set.weight > 0)
        .map((set) => ({ session, set })),
    );
    const bestSet = ({ session, set }: (typeof done)[number]) => ({
      sessionId: session.id,
      setId: set.id,
      achievedAt: session.finishedAt!,
      weight: set.weight,
      weightUnit: set.weightUnit,
      reps: set.reps,
      estimated1RM: toUnit(estimated1RM(kgOf(set), set.reps), unit),
      estimated1RMUnit: unit,
    });
    const byReps = new Map<number, (typeof done)[number]>();
    for (const entry of done) {
      const heaviest = byReps.get(entry.set.reps);
      if (!heaviest || kgOf(entry.set) > kgOf(heaviest.set) + BEATS_BY) byReps.set(entry.set.reps, entry);
    }
    return HttpResponse.json<ExerciseRecords>({
      bests: bestsOf(finished, String(params.id), unit),
      repRecords: [...byReps.values()].sort((a, b) => a.set.reps - b.set.reps).map(bestSet),
    });
  }),

  http.get('*/workouts/exercises/:id/progress', ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    if (!visibleExercise(account, params.id)) return error(404, 'exercise_not_found', 'Exercise not found.');
    const unit = unitOf(account.id);
    const points = sessions
      .filter((s) => s.ownerId === account.id && s.finishedAt)
      .sort((a, b) => a.finishedAt!.localeCompare(b.finishedAt!))
      .flatMap((session) => {
        const sets = setsOf(session).filter((set) => set.exerciseId === params.id);
        if (sets.length === 0) return [];
        return [
          {
            sessionId: session.id,
            finishedAt: session.finishedAt!,
            estimated1RM: toUnit(Math.max(...sets.map((s) => estimated1RM(kgOf(s), s.reps))), unit),
            heaviestWeight: toUnit(Math.max(...sets.map(kgOf)), unit),
            setVolume: toUnit(Math.max(...sets.map((s) => kgOf(s) * s.reps)), unit),
            exerciseVolume: volumeOf(sets, unit),
            totalReps: sets.reduce((n, s) => n + s.reps, 0),
            personalRecord: recordHitsOf(session).some((hit) => hit.set.exerciseId === params.id),
          },
        ];
      });
    return HttpResponse.json<ExerciseProgress>({ unit, sessions: points });
  }),

  http.get('*/workouts/totals', ({ request }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const url = new URL(request.url);
    const from = Date.parse(url.searchParams.get('from') ?? '');
    const to = Date.parse(url.searchParams.get('to') ?? '');
    if (Number.isNaN(from) || Number.isNaN(to) || from >= to) {
      return error(400, 'invalid_range', 'Send from and to as RFC 3339 times, from before to.');
    }
    const inRange = sessions.filter((s) => {
      const finished = s.finishedAt ? Date.parse(s.finishedAt) : NaN;
      return s.ownerId === account.id && finished >= from && finished < to;
    });
    const sets = inRange.flatMap((s) => s.exercises.flatMap((e) => e.sets));
    const counts = new Map<string, number>();
    for (const set of sets) {
      const group = exercises.find((e) => e.id === set.exerciseId)!.muscleGroup;
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    return HttpResponse.json({
      sessionCount: inRange.length,
      volume: volumeOf(sets, unitOf(account.id)),
      volumeUnit: unitOf(account.id),
      setsPerMuscleGroup: [...counts]
        .map(([muscleGroup, n]) => ({ muscleGroup, sets: n }))
        .sort((a, b) => b.sets - a.sets || a.muscleGroup.localeCompare(b.muscleGroup)),
    });
  }),

  http.post('*/workouts/sessions/:id/exercises', async ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const { exerciseId } = (await request.json()) as { exerciseId: string };
    if (!visibleExercise(account, exerciseId)) return error(404, 'exercise_not_found', 'Exercise not found.');
    const { session, response } = sessionInProgress(account, params.id);
    if (!session) return response;
    session.exercises.push({
      id: `session-exercise-${nextId++}`,
      exerciseId,
      plannedExerciseId: null,
      substituteIds: [],
      note: '',
      supersetId: null,
      target: null,
      sets: [],
    });
    return HttpResponse.json(sessionJson(session), { status: 201 });
  }),

  http.patch('*/workouts/sessions/:id/exercises/:sessionExerciseId', async ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const { note, exerciseId } = (await request.json()) as { note?: string; exerciseId?: string };
    if (typeof note !== 'string' && typeof exerciseId !== 'string') {
      return error(400, 'invalid_note', 'Send a note (an empty one clears it), or an exerciseId to swap to.');
    }
    if (typeof note === 'string' && note.trim().length > 500) {
      return error(400, 'invalid_note', 'Notes can be at most 500 characters.');
    }
    const { session, response } = sessionInProgress(account, params.id);
    if (!session) return response;
    const sessionExercise = session.exercises.find((e) => e.id === params.sessionExerciseId);
    if (!sessionExercise) return sessionExerciseNotFound();
    if (typeof exerciseId === 'string') {
      const { plannedExerciseId, substituteIds } = sessionExercise;
      if (plannedExerciseId === null || (exerciseId !== plannedExerciseId && !substituteIds.includes(exerciseId))) {
        return error(400, 'invalid_swap', 'Swap only to the exercise the routine planned, or one of its substitutes.');
      }
      sessionExercise.exerciseId = exerciseId;
    }
    if (typeof note === 'string') sessionExercise.note = note.trim();
    return HttpResponse.json(sessionJson(session));
  }),

  http.post('*/workouts/sessions/:id/exercises/:sessionExerciseId/sets', async ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const body = (await request.json()) as SetBody;
    const invalid = invalidSet(body);
    if (invalid) return invalid;
    const { session, response } = sessionInProgress(account, params.id);
    if (!session) return response;
    const sessionExercise = session.exercises.find((e) => e.id === params.sessionExerciseId);
    if (!sessionExercise) return sessionExerciseNotFound();
    const { weight, weightUnit, reps, rpe = null, note = '', type = 'normal' } = body as Required<SetBody>;
    fakeApi.addSet(sessionExercise, weight, weightUnit, reps, note.trim(), rpe, type);
    return HttpResponse.json(sessionJson(session), { status: 201 });
  }),

  http.patch('*/workouts/sessions/:id/sets/:setId', async ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const body = (await request.json()) as SetBody;
    const invalid = invalidSet(body);
    if (invalid) return invalid;
    const { session, response } = sessionInProgress(account, params.id);
    if (!session) return response;
    const set = session.exercises.flatMap((e) => e.sets).find((s) => s.id === params.setId);
    if (!set) return setNotFound();
    Object.assign(set, {
      weight: body.weight,
      weightUnit: body.weightUnit,
      reps: body.reps,
      rpe: body.rpe ?? null,
      note: (body.note ?? '').trim(),
      type: body.type ?? 'normal',
    });
    return HttpResponse.json(sessionJson(session));
  }),

  http.delete('*/workouts/sessions/:id/sets/:setId', ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const { session, response } = sessionInProgress(account, params.id);
    if (!session) return response;
    const sessionExercise = session.exercises.find((e) => e.sets.some((s) => s.id === params.setId));
    if (!sessionExercise) return setNotFound();
    sessionExercise.sets = sessionExercise.sets.filter((s) => s.id !== params.setId);
    return HttpResponse.json(sessionJson(session));
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

  http.post('*/workouts/sessions/:id/routine', async ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const { name } = (await request.json()) as { name?: string };
    const session = sessions.find((s) => s.id === params.id && s.ownerId === account.id);
    if (!session) return error(404, 'session_not_found', 'Workout not found.');
    if (!session.finishedAt) {
      return error(409, 'session_not_finished', 'Finish the workout before saving it as a routine.');
    }
    const logged = session.exercises.filter((e) => e.sets.length > 0);
    const supersetSizes = new Map<string, number>();
    logged.forEach((e) => e.supersetId && supersetSizes.set(e.supersetId, (supersetSizes.get(e.supersetId) ?? 0) + 1));
    const groups: string[] = [];
    const planned = plannedRoutine(account, {
      name,
      slots: logged.map((e) => {
        const last = e.sets.at(-1)!;
        const grouped = e.supersetId !== null && supersetSizes.get(e.supersetId)! >= 2;
        if (grouped && !groups.includes(e.supersetId!)) groups.push(e.supersetId!);
        return {
          exerciseId: last.exerciseId,
          targetSets: Math.min(e.sets.length, 20),
          targetReps: last.reps,
          targetWeight: last.weight,
          weightUnit: last.weightUnit,
          supersetGroup: grouped ? groups.indexOf(e.supersetId!) + 1 : null,
        };
      }),
    });
    if ('response' in planned) return planned.response;
    const routine = { id: `routine-${nextId++}`, ownerId: account.id, updatedAt: new Date().toISOString(), ...planned };
    routines.push(routine);
    return HttpResponse.json(routineJson(routine), { status: 201 });
  }),

  http.get('*/routines', ({ request }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const own = fakeApi.routines(account.id).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    return HttpResponse.json<{ routines: RoutineSummary[] }>({
      routines: own.map(({ id, name, updatedAt, slots }) => ({
        id,
        name,
        updatedAt,
        exerciseNames: [...new Set(slots.map((slot) => exerciseName(slot.exerciseId)))],
      })),
    });
  }),

  http.post('*/routines', async ({ request }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const planned = plannedRoutine(account, (await request.json()) as { name?: string; slots?: SlotBody[] });
    if ('response' in planned) return planned.response;
    const routine = { id: `routine-${nextId++}`, ownerId: account.id, updatedAt: new Date().toISOString(), ...planned };
    routines.push(routine);
    return HttpResponse.json(routineJson(routine), { status: 201 });
  }),

  http.get('*/routines/:id', ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const routine = routines.find((r) => r.id === params.id && r.ownerId === account.id);
    return routine ? HttpResponse.json(routineJson(routine)) : routineNotFound();
  }),

  http.put('*/routines/:id', async ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const planned = plannedRoutine(account, (await request.json()) as { name?: string; slots?: SlotBody[] });
    if ('response' in planned) return planned.response;
    const routine = routines.find((r) => r.id === params.id && r.ownerId === account.id);
    if (!routine) return routineNotFound();
    Object.assign(routine, planned, { updatedAt: new Date().toISOString() });
    return HttpResponse.json(routineJson(routine));
  }),

  http.delete('*/routines/:id', ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const routine = routines.find((r) => r.id === params.id && r.ownerId === account.id);
    if (!routine) return routineNotFound();
    routines = routines.filter((r) => r !== routine);
    sessions.forEach((s) => s.routineId === routine.id && (s.routineId = null));
    return new HttpResponse(null, { status: 204 });
  }),

  http.post('*/auth/signup', async ({ request }) => {
    const { email, password } = (await request.json()) as { email: string; password: string };
    if (!email.includes('@')) return error(400, 'invalid_email', 'Enter a valid email address.');
    if (password.length < 8) return error(400, 'invalid_password', 'Password must be 8 to 72 characters.');
    if (fakeApi.findAccount(email)) return error(409, 'email_taken', 'An account with this email already exists.');

    const account = fakeApi.addAccount(email, password, null);
    return HttpResponse.json<AuthResponse>(
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
    return HttpResponse.json<AuthResponse>({
      token: fakeApi.issueToken(account.id),
      account: { id: account.id, email },
    });
  }),

  http.get('*/users/me', ({ request }) => {
    const account = caller(request);
    if (!account) return error(401, 'unauthorized', 'Log in to continue.');
    return HttpResponse.json(me(account));
  }),

  http.patch('*/users/me', async ({ request }) => {
    const account = caller(request);
    if (!account) return error(401, 'unauthorized', 'Log in to continue.');
    const { unitPreference, name } = (await request.json()) as { unitPreference?: unknown; name?: string };
    if (name === undefined && unitPreference === undefined) {
      return error(400, 'nothing_to_update', 'Send "name", "unitPreference" or both.');
    }
    if (unitPreference !== undefined && unitPreference !== 'kg' && unitPreference !== 'lb') {
      return error(400, 'invalid_unit_preference', 'unitPreference must be "kg" or "lb".');
    }
    const trimmed = name?.trim();
    if (trimmed !== undefined && [...trimmed].length > 50) {
      return error(400, 'name_too_long', 'Names must be 50 characters or fewer.');
    }
    if (unitPreference !== undefined) account.unitPreference = unitPreference;
    if (trimmed !== undefined) account.name = trimmed || null;
    return HttpResponse.json(me(account));
  }),

  http.put('*/users/me/avatar', async ({ request }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const form = (await request.formData()) as unknown as { get(name: string): unknown };
    const file = form.get('file');
    if (!(file instanceof File)) {
      return error(400, 'missing_file', 'Send the file as the "file" field of a multipart form.');
    }
    if (MEDIA_KINDS[file.type] !== 'image') {
      return error(415, 'unsupported_media_type', 'Upload a PNG, JPEG or WebP image.');
    }
    fakeApi.avatarUploads.push({ accountId: account.id, fileName: file.name, type: file.type });
    account.avatarUrl = `/users/me/avatar?v=${fakeApi.avatarUploads.length}`;
    return HttpResponse.json(me(account));
  }),

  http.delete('*/users/me/avatar', ({ request }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    account.avatarUrl = null;
    return HttpResponse.json(me(account));
  }),

  http.get('*/users/me/counts', ({ request }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    if (!new URL(request.url).searchParams.get('timeZone')) {
      return error(400, 'invalid_time_zone', 'Send timeZone as an IANA time zone, such as Europe/Berlin.');
    }
    const finished = finishedSessionsOf(account);
    return HttpResponse.json<ProfileCounts>({
      workouts: finished.length,
      personalRecords: finished.reduce((n, s) => n + personalRecordsOf(s).length, 0),
      streak: streakOf(finished.map((s) => new Date(s.finishedAt!))),
    });
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
    return HttpResponse.json<{ exercises: Exercise[] }>({ exercises: found.map(exerciseJson) });
  }),

  http.post('*/exercises', async ({ request }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const {
      name,
      muscleGroup,
      equipmentType,
      secondaryMuscles = [],
      instructions = [],
    } = (await request.json()) as {
      name?: string;
      muscleGroup: MuscleGroup;
      equipmentType: EquipmentType;
      secondaryMuscles?: MuscleGroup[];
      instructions?: string[];
    };
    if (!name?.trim()) return error(400, 'invalid_name', 'Name must be 1 to 100 characters.');
    if (secondaryMuscles.includes(muscleGroup) || new Set(secondaryMuscles).size !== secondaryMuscles.length) {
      return error(400, 'invalid_secondary_muscles', 'secondaryMuscles must be distinct, not including muscleGroup.');
    }
    const steps = instructions.map((step) => step.trim());
    if (steps.length > 20 || steps.some((step) => step === '' || step.length > 500)) {
      return error(400, 'invalid_instructions', 'instructions must be at most 20 steps, each 1 to 500 characters.');
    }
    const exercise = fakeApi.addCustomExercise(account.id, name.trim(), muscleGroup, equipmentType, {
      secondaryMuscles,
      instructions: steps,
    });
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

  http.get('*/posts', ({ request }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    return HttpResponse.json<{ posts: PostSummary[] }>({
      posts: finishedSessionsOf(account).map((s) => ({
        id: s.id,
        ...fakeApi.post(s.id),
        session: sessionSummaryJson(s),
      })),
    });
  }),

  http.get('*/posts/:id', ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const { session, response } = ownPost(account, params.id);
    if (!session) return response;
    return HttpResponse.json(postJson(session));
  }),

  http.patch('*/posts/:id', async ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const { caption } = (await request.json()) as { caption?: string };
    if (caption === undefined) {
      return error(400, 'missing_caption', 'Send the caption as "caption"; an empty one clears it.');
    }
    // Counted in characters, as the real API does, not UTF-16 units.
    if ([...caption].length > 2200) {
      return error(400, 'caption_too_long', 'Captions must be 2,200 characters or fewer.');
    }
    const { session, response } = ownPost(account, params.id);
    if (!session) return response;
    posts.set(session.id, { ...fakeApi.post(session.id), caption });
    return HttpResponse.json(postJson(session));
  }),

  http.put('*/posts/:id/photo', async ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const { session, response } = ownPost(account, params.id);
    if (!session) return response;
    const form = (await request.formData()) as unknown as { get(name: string): unknown };
    const file = form.get('file');
    if (!(file instanceof File)) {
      return error(400, 'missing_file', 'Send the file as the "file" field of a multipart form.');
    }
    if (MEDIA_KINDS[file.type] !== 'image') {
      return error(415, 'unsupported_media_type', 'Upload a PNG, JPEG or WebP image.');
    }
    fakeApi.photoUploads.push({ postId: session.id, fileName: file.name, type: file.type });
    const photoUrl = `/posts/${session.id}/photo?v=${fakeApi.photoUploads.length}`;
    posts.set(session.id, { ...fakeApi.post(session.id), photoUrl });
    return HttpResponse.json(postJson(session));
  }),

  http.delete('*/posts/:id/photo', ({ request, params }) => {
    const account = caller(request);
    if (!account) return unauthorized();
    const { session, response } = ownPost(account, params.id);
    if (!session) return response;
    posts.set(session.id, { ...fakeApi.post(session.id), photoUrl: null });
    return HttpResponse.json(postJson(session));
  }),
];

export const server = setupServer(...handlers);
