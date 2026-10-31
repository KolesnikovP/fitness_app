import type { UnitPreference } from '@/entities/user';

export type WeightUnit = UnitPreference;

/**
 * A logged Set. weight is in weightUnit, the unit it was logged in. rpe is
 * null when left blank. supersetId is the Superset it was logged in, if any.
 */
export type SessionSet = {
  id: string;
  weight: number;
  weightUnit: WeightUnit;
  reps: number;
  rpe: number | null;
  note: string;
  supersetId: string | null;
};

/**
 * An Exercise added to a Session, with its Sets in the order they were
 * logged. Exercises of one Superset share its supersetId.
 */
export type SessionExercise = {
  id: string;
  exerciseId: string;
  name: string;
  note: string;
  supersetId: string | null;
  sets: SessionSet[];
};

/** How the workout in progress is laid out: single exercises and Supersets. */
export type SessionBlock =
  | { kind: 'exercise'; exercise: SessionExercise }
  | { kind: 'superset'; supersetId: string; exercises: SessionExercise[] };

/** One logged workout. finishedAt is null while it's in progress. */
export type Session = {
  id: string;
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

/** "32.5 kg × 10", or "32.5 kg × 10 @ RPE 8.5" */
export function formatSet(set: Pick<SessionSet, 'weight' | 'weightUnit' | 'reps' | 'rpe'>): string {
  const base = `${set.weight} ${set.weightUnit} × ${set.reps}`;
  return set.rpe === null ? base : `${base} @ RPE ${set.rpe}`;
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
 * An optional RPE typed by the user: blank is valid with no value, otherwise
 * it must be from 1 to 10 in half steps (a decimal comma is fine).
 */
export function parseOptionalRpe(text: string): { valid: true; rpe: number | null } | { valid: false } {
  if (text.trim() === '') return { valid: true, rpe: null };
  const rpe = parseWeight(text); // Same number format as a weight.
  if (rpe === null || rpe < 1 || rpe > 10 || !Number.isInteger(rpe * 2)) return { valid: false };
  return { valid: true, rpe };
}

/** A whole number of reps of at least 1; null otherwise. */
export function parseReps(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const reps = Number(trimmed);
  return reps >= 1 ? reps : null;
}
