import type { ExerciseRef } from '@/entities/exercise';
import type { UnitPreference } from '@/entities/user';

export type WeightUnit = UnitPreference;

/**
 * A logged Set. exerciseId and name are the Exercise actually done, which
 * differs from its Session exercise's once that's swapped. weight is in
 * weightUnit, the unit it was logged in. rpe is null when left blank.
 * supersetId is the Superset it was logged in, if any.
 */
export type SessionSet = {
  id: string;
  exerciseId: string;
  name: string;
  weight: number;
  weightUnit: WeightUnit;
  reps: number;
  rpe: number | null;
  note: string;
  supersetId: string | null;
};

/**
 * What a Routine's Exercise slot planned for a Session exercise, copied when
 * the Session started. weight is in weightUnit. restSeconds is null when no
 * rest was planned.
 */
export type SessionTarget = {
  sets: number;
  reps: number;
  weight: number;
  weightUnit: WeightUnit;
  restSeconds: number | null;
  note: string;
};

/**
 * An Exercise added to a Session, with its Sets in the order they were
 * logged. exerciseId and name are the Exercise being done now. Exercises of
 * one Superset share its supersetId. target is what its Routine's slot
 * planned, and planned the slot's own Exercise, both null for an exercise
 * not started from a Routine. It can be swapped to planned or one of its
 * substitutes.
 */
export type SessionExercise = {
  id: string;
  exerciseId: string;
  name: string;
  note: string;
  supersetId: string | null;
  target: SessionTarget | null;
  planned: ExerciseRef | null;
  substitutes: ExerciseRef[];
  sets: SessionSet[];
};

/**
 * What a Session exercise can be swapped to now: its planned Exercise, then
 * its Substitutes in order, leaving out the one being done.
 */
export function swapOptions(exercise: SessionExercise): ExerciseRef[] {
  if (!exercise.planned) return [];
  return [exercise.planned, ...exercise.substitutes].filter((option) => option.exerciseId !== exercise.exerciseId);
}

/** The Exercise its Routine planned, if the Session exercise is swapped away from it; otherwise null. */
export function swappedFrom(exercise: SessionExercise): ExerciseRef | null {
  return exercise.planned !== null && exercise.planned.exerciseId !== exercise.exerciseId ? exercise.planned : null;
}

/**
 * The Target to log a Session exercise against: its own, but without a
 * weight (0) once swapped, since that was planned for another Exercise.
 */
export function currentTarget(exercise: SessionExercise): SessionTarget | null {
  if (!exercise.target || !swappedFrom(exercise)) return exercise.target;
  return { ...exercise.target, weight: 0 };
}

/** How the workout in progress is laid out: single exercises and Supersets. */
export type SessionBlock =
  | { kind: 'exercise'; exercise: SessionExercise }
  | { kind: 'superset'; supersetId: string; exercises: SessionExercise[] };

/**
 * One logged workout. routineId is the Routine it was started from, null for
 * a Freeform session. finishedAt is null while it's in progress.
 */
export type Session = {
  id: string;
  routineId: string | null;
  startedAt: string;
  finishedAt: string | null;
  exercises: SessionExercise[];
};

/** A finished Session as the history list shows it. */
export type SessionSummary = {
  id: string;
  startedAt: string;
  finishedAt: string;
  exerciseNames: string[];
};

export function hasSets(session: Session): boolean {
  return session.exercises.some((e) => e.sets.length > 0);
}

/** The session as it looks once setId is deleted. */
export function withoutSet(session: Session, setId: string): Session {
  return {
    ...session,
    exercises: session.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.id !== setId) })),
  };
}

/** A Set as the User is typing it, to log or to correct. */
export type SetDraft = { weight: string; reps: string; rpe: number | null; note: string };

export const emptySetDraft: SetDraft = { weight: '', reps: '', rpe: null, note: '' };

/** A draft holding a logged Set, to correct it. */
export function setDraftOf(set: SessionSet): SetDraft {
  return { weight: String(set.weight), reps: String(set.reps), rpe: set.rpe, note: set.note };
}

/** The Set a draft describes, in weightUnit, or null while it's incomplete. */
export function parseSetDraft(
  draft: SetDraft,
  weightUnit: WeightUnit,
): { weight: number; weightUnit: WeightUnit; reps: number; rpe: number | null; note: string } | null {
  const weight = parseWeight(draft.weight);
  const reps = parseReps(draft.reps);
  if (weight === null || reps === null) return null;
  return { weight, weightUnit, reps, rpe: draft.rpe, note: draft.note.trim() };
}

/** "32.5 kg × 10", or "32.5 kg × 10 @ RPE 8.5" */
export function formatSet(set: Pick<SessionSet, 'weight' | 'weightUnit' | 'reps' | 'rpe'>): string {
  const base = `${set.weight} ${set.weightUnit} × ${set.reps}`;
  return set.rpe === null ? base : `${base} @ RPE ${set.rpe}`;
}

/** "3 × 5 · 100 kg", or "3 × 5" with no weight (0) planned. */
export function formatTarget(target: { sets: number; reps: number; weight: number; weightUnit: WeightUnit }): string {
  const base = `${target.sets} × ${target.reps}`;
  return target.weight === 0 ? base : `${base} · ${target.weight} ${target.weightUnit}`;
}

/** "1:30" */
export function formatRest(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * The draft to log the next Set from: the target's reps, and its weight when
 * one is planned (not 0) in the unit the Set is logged in.
 */
export function setDraftFromTarget(target: SessionTarget | null, weightUnit: WeightUnit): SetDraft {
  if (!target) return emptySetDraft;
  return {
    ...emptySetDraft,
    weight: target.weight !== 0 && target.weightUnit === weightUnit ? String(target.weight) : '',
    reps: String(target.reps),
  };
}

/**
 * Groups the exercises of a Session into blocks. A Superset takes the place
 * of its first exercise, with the rest of its exercises right after it.
 */
export function sessionBlocks(exercises: SessionExercise[]): SessionBlock[] {
  const blocks: SessionBlock[] = [];
  const supersets = new Map<string, SessionExercise[]>();
  for (const exercise of exercises) {
    if (exercise.supersetId === null) {
      blocks.push({ kind: 'exercise', exercise });
      continue;
    }
    const members = supersets.get(exercise.supersetId);
    if (members) {
      members.push(exercise);
    } else {
      const started = [exercise];
      supersets.set(exercise.supersetId, started);
      blocks.push({ kind: 'superset', supersetId: exercise.supersetId, exercises: started });
    }
  }
  return blocks;
}

/**
 * Where the User is in a Superset: the next exercise to do, with no rest
 * before it, or a finished round, after which they rest.
 */
export type SupersetProgress =
  | { kind: 'next'; exercise: SessionExercise }
  | { kind: 'roundDone'; round: number };

export function supersetProgress(exercises: SessionExercise[]): SupersetProgress {
  const fewest = Math.min(...exercises.map((e) => e.sets.length));
  const behind = exercises.find((e) => e.sets.length === fewest)!;
  const roundDone = fewest > 0 && exercises.every((e) => e.sets.length === fewest);
  return roundDone ? { kind: 'roundDone', round: fewest } : { kind: 'next', exercise: behind };
}

/** "< 1 min", "45 min", "1 h 5 min" */
export function formatDuration(startedAt: string, finishedAt: string): string {
  const minutes = Math.floor((Date.parse(finishedAt) - Date.parse(startedAt)) / 60_000);
  if (minutes < 1) return '< 1 min';
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

/** "Sat, Oct 31" in the device's locale. */
export function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "10:42" in the device's locale. */
export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** A weight typed by the user, accepting a decimal comma; null if it isn't one. */
export function parseWeight(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

/**
 * The RPE values a User picks from, each with what it means in reps left in
 * the tank. Below 5 is too easy to be worth rating.
 */
export const RPE_SCALE: readonly { rpe: number; meaning: string }[] = [
  { rpe: 5, meaning: 'Could do 5 or more reps' },
  { rpe: 6, meaning: 'Could do 4 more reps' },
  { rpe: 7, meaning: 'Could do 3 more reps' },
  { rpe: 8, meaning: 'Could do 2 more reps' },
  { rpe: 9, meaning: 'Could do 1 more rep' },
  { rpe: 10, meaning: 'Max effort, no reps left' },
];

/**
 * Keeps only what a weight can be made of as the User types it: digits, one
 * decimal point or comma, at most 2 decimals and 4 whole digits (the API
 * takes up to 9999.99).
 */
export function weightInput(text: string): string {
  const kept = text.replace(/[^\d.,]/g, '');
  const separator = kept.search(/[.,]/);
  if (separator === -1) return kept.slice(0, 4);
  const whole = kept.slice(0, separator).slice(0, 4);
  const decimals = kept.slice(separator + 1).replace(/[.,]/g, '').slice(0, 2);
  return `${whole}${kept[separator]}${decimals}`;
}

/** Keeps only digits as the User types reps, at most 4 (the API takes up to 1000). */
export function repsInput(text: string): string {
  return text.replace(/\D/g, '').slice(0, 4);
}

/** A whole number of reps of at least 1; null otherwise. */
export function parseReps(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const reps = Number(trimmed);
  return reps >= 1 ? reps : null;
}
