import type { UnitPreference } from '@/entities/user';

export type WeightUnit = UnitPreference;

/** A logged Set. weight is in weightUnit, the unit it was logged in. */
export type SessionSet = {
  id: string;
  weight: number;
  weightUnit: WeightUnit;
  reps: number;
  note: string;
};

/** An Exercise added to a Session, with its Sets in the order they were logged. */
export type SessionExercise = {
  id: string;
  exerciseId: string;
  name: string;
  note: string;
  sets: SessionSet[];
};

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

/** "32.5 kg × 10" */
export function formatSet(set: Pick<SessionSet, 'weight' | 'weightUnit' | 'reps'>): string {
  return `${set.weight} ${set.weightUnit} × ${set.reps}`;
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

/** A whole number of reps of at least 1; null otherwise. */
export function parseReps(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const reps = Number(trimmed);
  return reps >= 1 ? reps : null;
}
