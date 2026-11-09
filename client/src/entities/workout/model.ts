import type { ExerciseRef, UnitPreference } from '@/shared/model';

/**
 * A logged Set. exerciseId and name are the Exercise actually done, which
 * differs from its Session exercise's once that's swapped. weight is in
 * weightUnit, the unit it was logged in. rpe is null when left blank.
 * supersetId is the Superset it was logged in, if any. recordTier is its
 * Record tier, null for none.
 */
export type SessionSet = {
  id: string;
  exerciseId: string;
  name: string;
  weight: number;
  weightUnit: UnitPreference;
  reps: number;
  rpe: number | null;
  note: string;
  supersetId: string | null;
  recordTier: RecordTier | null;
};

/**
 * How close a Set came to the User's best Estimated 1RM for its Exercise
 * before its Session: gold holds a Personal record, silver is within 2.5% of
 * that best, bronze within 5%.
 */
export type RecordTier = 'gold' | 'silver' | 'bronze';

/** What a Record tier is called, as the app says it. */
export const recordTierLabels: Record<RecordTier, string> = {
  gold: 'Personal record',
  silver: 'Silver',
  bronze: 'Bronze',
};

/** The medal that marks a Record tier. */
export const recordTierMedals: Record<RecordTier, string> = { gold: '🏆', silver: '🥈', bronze: '🥉' };

/**
 * What a Routine's Exercise slot planned for a Session exercise, copied when
 * the Session started. weight is in weightUnit. restSeconds is null when no
 * rest was planned.
 */
export type SessionTarget = {
  sets: number;
  reps: number;
  weight: number;
  weightUnit: UnitPreference;
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
 * Every Exercise a Session exercise can be done as: its planned one, then its
 * Substitutes in order. None for an exercise not started from a Routine.
 */
export function swapChoices(exercise: SessionExercise): ExerciseRef[] {
  return exercise.planned ? [exercise.planned, ...exercise.substitutes] : [];
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
 * A finished Session's stats, worked out by the API from its Sets. volume is
 * in volumeUnit, the User's Unit preference. exerciseCount is how many
 * different Exercises it lists, and setCount how many Sets were logged in it.
 */
export type SessionStats = {
  durationSeconds: number;
  volume: number;
  volumeUnit: UnitPreference;
  exerciseCount: number;
  setCount: number;
};

/**
 * A Set of a Session that beat every earlier Set of its Exercise by the User:
 * by Estimated 1RM, or by weight at the same reps (a rep record). While the
 * Session is in progress it's a record so far, which a better Set takes over.
 * weight is in weightUnit, as logged; estimated1RM in estimated1RMUnit, the
 * User's Unit preference.
 */
export type PersonalRecord = {
  kind: 'estimated1RM' | 'reps';
  setId: string;
  exerciseId: string;
  name: string;
  weight: number;
  weightUnit: UnitPreference;
  reps: number;
  estimated1RM: number;
  estimated1RMUnit: UnitPreference;
};

/** A Set holding one of the User's current records for an Exercise. */
export type BestSet = {
  sessionId: string;
  setId: string;
  achievedAt: string;
  weight: number;
  weightUnit: UnitPreference;
  reps: number;
  estimated1RM: number;
  estimated1RMUnit: UnitPreference;
};

/**
 * The User's highest value so far of one measure of an Exercise, first reached
 * in sessionId. value is in unit, the User's Unit preference, or a number of
 * reps with no unit; set is the Set behind a measure of one Set.
 */
export type Best = {
  value: number;
  unit?: UnitPreference;
  sessionId: string;
  achievedAt: string;
  set?: { setId: string; weight: number; weightUnit: UnitPreference; reps: number };
};

/**
 * The User's Bests for an Exercise, each null until there is one; those by
 * weight come only from Sets with weight.
 */
export type Bests = {
  estimated1RM: Best | null;
  heaviestWeight: Best | null;
  setVolume: Best | null;
  exerciseVolume: Best | null;
  mostReps: Best | null;
};

/**
 * The User's Bests for an Exercise, and its current Rep records: the heaviest
 * Set at each rep count, fewest reps first.
 */
export type ExerciseRecords = { bests: Bests; repRecords: BestSet[] };

/**
 * One finished Session's Sets of an Exercise: their best Estimated 1RM,
 * heaviest weight, best Set volume, Exercise volume and total reps, and
 * whether the Session set a Personal record of any kind for the Exercise.
 */
export type ProgressPoint = {
  sessionId: string;
  finishedAt: string;
  estimated1RM: number;
  heaviestWeight: number;
  setVolume: number;
  exerciseVolume: number;
  totalReps: number;
  personalRecord: boolean;
};

/** The User's progress at an Exercise, oldest Session first, weights in unit. */
export type ExerciseProgress = { unit: UnitPreference; sessions: ProgressPoint[] };

/** The records after has that before didn't: those a Set just logged or corrected set. */
export function newRecords(before: Session, after: Session): PersonalRecord[] {
  const had = new Set(before.personalRecords.map((r) => `${r.setId}/${r.kind}`));
  return after.personalRecords.filter((r) => !had.has(`${r.setId}/${r.kind}`));
}

/** "Bench Press: Estimated 1RM 122.5 kg, from 105 kg × 5", or "Bench Press: 105 kg × 5, best at 5 reps" */
export function formatPersonalRecord(record: PersonalRecord): string {
  const set = `${record.weight} ${record.weightUnit} × ${record.reps}`;
  return record.kind === 'estimated1RM'
    ? `${record.name}: Estimated 1RM ${record.estimated1RM} ${record.estimated1RMUnit}, from ${set}`
    : `${record.name}: ${set}, best at ${countOf(record.reps, 'rep')}`;
}

/**
 * One logged workout. name is its Session name. routineId is the Routine it
 * was started from, null for a Freeform session (or once that Routine is
 * deleted), and routineName that Routine's name as it is now. finishedAt and
 * stats are null while it's in progress. personalRecords are the records its
 * Sets set (so far, while in progress), in the order logged.
 */
export type Session = {
  id: string;
  name: string;
  routineId: string | null;
  routineName: string | null;
  startedAt: string;
  finishedAt: string | null;
  exercises: SessionExercise[];
  stats: SessionStats | null;
  personalRecords: PersonalRecord[];
};

/** A finished Session as a list of them shows it: its stats and the names of its Exercises, not every Set. */
export type SessionSummary = {
  id: string;
  name: string;
  routineName: string | null;
  startedAt: string;
  finishedAt: string;
  exerciseNames: string[];
  stats: SessionStats;
  personalRecords: PersonalRecord[];
};

/** An Exercise's best Estimated 1RM ever: its all-time Personal record, as Progress on the Profile shows it. */
export type ExerciseBest = { exerciseId: string; name: string; best: BestSet };

/** The most characters a Session name may have. */
export const MAX_SESSION_NAME_CHARS = 60;

/** "1 workout", "3 sets": count with a noun, plural unless it's 1. */
export function countOf(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** "2,102 lb", to the nearest whole unit. */
export function formatVolume(volume: number, unit: UnitPreference): string {
  return `${Math.round(volume).toLocaleString('en-US')} ${unit}`;
}

/** "45 min · 2,102 lb · 3 exercises · 12 sets" */
export function formatStats(stats: SessionStats): string {
  return [
    formatDuration(stats.durationSeconds),
    formatVolume(stats.volume, stats.volumeUnit),
    countOf(stats.exerciseCount, 'exercise'),
    countOf(stats.setCount, 'set'),
  ].join(' · ');
}

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
  weightUnit: UnitPreference,
): { weight: number; weightUnit: UnitPreference; reps: number; rpe: number | null; note: string } | null {
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

/**
 * A logged Set as a screen reader says it: its values, then its Record tier
 * if it has one. "100 kg × 5, Silver".
 */
export function formatSetWithTier(set: SessionSet): string {
  return set.recordTier ? `${formatSet(set)}, ${recordTierLabels[set.recordTier]}` : formatSet(set);
}

/** "3 × 5 · 100 kg", or "3 × 5" with no weight (0) planned. */
export function formatTarget(target: {
  sets: number;
  reps: number;
  weight: number;
  weightUnit: UnitPreference;
}): string {
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
export function setDraftFromTarget(target: SessionTarget | null, weightUnit: UnitPreference): SetDraft {
  if (!target) return emptySetDraft;
  return {
    ...emptySetDraft,
    weight: target.weight !== 0 && target.weightUnit === weightUnit ? String(target.weight) : '',
    reps: String(target.reps),
  };
}

/**
 * How many rows a Session exercise shows for Sets still to log: one for each
 * Set its Target has left (or one, with no Target), plus the ones the User
 * added.
 */
export function pendingSetCount(exercise: SessionExercise, added: number): number {
  const planned = exercise.target ? Math.max(exercise.target.sets - exercise.sets.length, 0) : 1;
  return planned + added;
}

/**
 * The added rows left once a Set is logged: logging uses up a planned row
 * while the Target has some left, and an added one after.
 */
export function addedAfterLogging(exercise: SessionExercise, added: number): number {
  const plannedLeft = exercise.target ? exercise.target.sets - exercise.sets.length : 0;
  return plannedLeft > 0 ? added : Math.max(added - 1, 0);
}

/**
 * What a row for the next Set starts at: the Target's reps, and the weight of
 * the last Set logged for this Exercise, else the Target's.
 */
export function nextSetDraft(exercise: SessionExercise, weightUnit: UnitPreference): SetDraft {
  const draft = setDraftFromTarget(currentTarget(exercise), weightUnit);
  const last = exercise.sets.findLast((s) => s.exerciseId === exercise.exerciseId && s.weightUnit === weightUnit);
  return last ? { ...draft, weight: String(last.weight) } : draft;
}

/** Logged Sets of a Session exercise in a row done with one Exercise, each with its number in the exercise, from 1. */
export type SetRun = { exerciseId: string; name: string; sets: { set: SessionSet; number: number }[] };

/** A Session exercise's logged Sets, in runs done with the same Exercise, as swaps split them. */
export function setRuns(exercise: SessionExercise): SetRun[] {
  const runs: SetRun[] = [];
  exercise.sets.forEach((set, i) => {
    const last = runs.at(-1);
    const entry = { set, number: i + 1 };
    if (last && last.exerciseId === set.exerciseId) last.sets.push(entry);
    else runs.push({ exerciseId: set.exerciseId, name: set.name, sets: [entry] });
  });
  return runs;
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
export type SupersetProgress = { kind: 'next'; exercise: SessionExercise } | { kind: 'roundDone'; round: number };

export function supersetProgress(exercises: SessionExercise[]): SupersetProgress {
  const fewest = Math.min(...exercises.map((e) => e.sets.length));
  const behind = exercises.find((e) => e.sets.length === fewest)!;
  const roundDone = fewest > 0 && exercises.every((e) => e.sets.length === fewest);
  return roundDone ? { kind: 'roundDone', round: fewest } : { kind: 'next', exercise: behind };
}

/** "< 1 min", "45 min", "1 h 5 min" */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return '< 1 min';
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

/** "Sat, Oct 31" in the device's locale. */
export function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Oct 12" in the device's locale, from an ISO date or a timestamp. */
export function formatShortDate(date: string | number): string {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
  const decimals = kept
    .slice(separator + 1)
    .replace(/[.,]/g, '')
    .slice(0, 2);
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
