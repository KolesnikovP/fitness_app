import type { ExerciseRef, UnitPreference } from '@/shared/model';

/**
 * A logged Set. exerciseId and name are the Exercise actually done, which
 * differs from its Session exercise's once that's swapped. weight is in
 * weightUnit, the unit it was logged in. rpe is null when left blank.
 * supersetId is the Superset it was logged in, if any. recordTier is its
 * Record tier, null for none; a warm-up never has one. type is its Set type.
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
  type: SetType;
};

/** What kind of round a Set was. Every Set but a warm-up is a working Set. */
export type SetType = 'normal' | 'warmup' | 'failure' | 'drop';

/**
 * The Set types a User picks from, in order: what each is called, the letter
 * that marks it in place of the Set number (none for normal), and what it
 * means.
 */
export const SET_TYPES: readonly { type: SetType; label: string; letter: string | null; meaning: string }[] = [
  { type: 'normal', label: 'Normal', letter: null, meaning: 'A working set' },
  {
    type: 'warmup',
    label: 'Warm-up',
    letter: 'W',
    meaning: 'Lighter, to get ready. Counts toward no stats or records',
  },
  { type: 'failure', label: 'Failure', letter: 'F', meaning: 'Taken until no more reps were possible' },
  { type: 'drop', label: 'Drop', letter: 'D', meaning: 'Straight after the set before, lighter, without rest' },
];

/**
 * What marks each of a Session exercise's Sets, given each one's type and
 * Exercise in order: the letter of a warm-up, failure or drop Set, or a
 * normal Set's number. Only normal and failure Sets are numbered, so warm-ups
 * and drops take none: W, 1, D, F, 3. Each Exercise is numbered on its own,
 * as Last time's places are (see lastTimeAtPlaces), so after a Swap the
 * Exercise swapped to starts at 1 and a Swap back carries on.
 */
export function setMarks(sets: { type: SetType; exerciseId: string }[]): string[] {
  const numbers = new Map<string, number>();
  return sets.map(({ type, exerciseId }) => {
    const number = (numbers.get(exerciseId) ?? 0) + (isNumbered(type) ? 1 : 0);
    numbers.set(exerciseId, number);
    return SET_TYPES.find((t) => t.type === type)?.letter ?? String(number);
  });
}

/** Whether a Set of this type takes a number: normal and failure Sets do, warm-ups and drop Sets don't. */
function isNumbered(type: SetType): boolean {
  return type === 'normal' || type === 'failure';
}

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
 * substitutes. lastTime is Last time's Sets of the Exercise being done now,
 * while the Session is in progress; none once it's finished.
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
  lastTime: LastTimeSet[];
};

/**
 * One of an Exercise's Sets the last time the User did it, in their most
 * recent finished Session with a Set of it, warm-ups included. weight is in
 * weightUnit, the User's Unit preference. rpe is null when none was entered.
 * type is its Set type.
 */
export type LastTimeSet = {
  weight: number;
  weightUnit: UnitPreference;
  reps: number;
  rpe: number | null;
  type: SetType;
};

/**
 * Last time's Set at the place of each of a Session exercise's Sets, its
 * logged ones then the rows still to do, given those rows' types in order.
 * Warm-ups and numbered Sets are placed apart: warm-up 1 with last time's
 * warm-up 1, set 1 with its set 1. A drop Set has no place, so lines up with
 * none. Places count only the Sets of the Exercise being done now, as Last
 * time is its Sets: a logged Set of another, from before a Swap, takes no
 * place and lines up with none. Last time's Sets whose rows the User
 * removed take no place either, so the Sets after keep theirs.
 */
export function lastTimeAtPlaces(
  exercise: SessionExercise,
  pendingTypes: SetType[],
  rows: RowsToDo,
): (LastTimeSet | undefined)[] {
  const removed = lastTimePlaces(rows.removedFromLastTime, exercise);
  const warmups = exercise.lastTime.filter((s, place) => s.type === 'warmup' && !removed.includes(place));
  const numbered = exercise.lastTime.filter((s, place) => isNumbered(s.type) && !removed.includes(place));
  const sets = [...exercise.sets, ...pendingTypes.map((type) => ({ type, exerciseId: exercise.exerciseId }))];
  let warmup = 0;
  let number = 0;
  return sets.map(({ type, exerciseId }) => {
    if (exerciseId !== exercise.exerciseId) return undefined;
    if (type === 'warmup') return warmups[warmup++];
    return isNumbered(type) ? numbered[number++] : undefined;
  });
}

/**
 * The Sets of Last time a Session exercise still has rows for, as their
 * places among Last time's Sets, in order. With no Target, every one of them
 * (see lastTimePlacesLeft). With a Target, which plans the numbered rows,
 * only the warm-ups before Last time's first numbered Set, less those whose
 * rows the User removed and those already logged, and only while it has
 * logged nothing but warm-ups of the Exercise being done now, so a working
 * Set, or a Swap after a Set is logged, leaves none.
 */
function lastTimePlacesToDo(exercise: SessionExercise, rows: RowsToDo): number[] {
  if (!exercise.target) return lastTimePlacesLeft(exercise, rows);
  if (exercise.sets.some((s) => s.type !== 'warmup' || s.exerciseId !== exercise.exerciseId)) return [];
  const firstNumbered = exercise.lastTime.findIndex((s) => isNumbered(s.type));
  const removed = lastTimePlaces(rows.removedFromLastTime, exercise);
  return exercise.lastTime
    .map((set, place) => ({ set, place }))
    .filter(({ set, place }) => set.type === 'warmup' && (firstNumbered === -1 || place < firstNumbered))
    .filter(({ place }) => !removed.includes(place))
    .map(({ place }) => place)
    .slice(exercise.sets.length);
}

/** The Sets of Last time a Session exercise still has rows for (see lastTimePlacesToDo). */
function lastTimeSetsToDo(exercise: SessionExercise, rows: RowsToDo): LastTimeSet[] {
  return lastTimePlacesToDo(exercise, rows).map((place) => exercise.lastTime[place]);
}

/**
 * The places among Last time's Sets with a row still to do, for a Session
 * exercise with no Target: those whose rows weren't removed or logged (see
 * lastTimePlacesUnused), less one from the top for each logged Set of the
 * Exercise being done now that no row was seen logged for, as on resuming a
 * Session with Sets already logged.
 */
function lastTimePlacesLeft(exercise: SessionExercise, rows: RowsToDo): number[] {
  return lastTimePlacesUnused(exercise, rows).slice(setsLoggedUnseen(exercise, rows));
}

/** The places among Last time's Sets whose rows weren't removed or logged. */
function lastTimePlacesUnused(exercise: SessionExercise, rows: RowsToDo): number[] {
  const gone = lastTimePlaces([...rows.removedFromLastTime, ...rows.logged], exercise);
  return exercise.lastTime.map((_, place) => place).filter((place) => !gone.includes(place));
}

/**
 * How many logged Sets of the Exercise being done now no row was seen logged
 * for (see logged in RowsToDo): those logged before the app restarted, or
 * before a Swap back. None once Sets are deleted.
 */
function setsLoggedUnseen(exercise: SessionExercise, rows: RowsToDo): number {
  const sets = exercise.sets.filter((s) => s.exerciseId === exercise.exerciseId).length;
  const seen = rows.logged.filter((r) => r.exerciseId === exercise.exerciseId).length;
  return Math.max(sets - seen, 0);
}

/** The places among Last time's Sets of the Exercise being done now, of those rows that stood for one. */
function lastTimePlaces(entries: RowTakenOut[], exercise: SessionExercise): number[] {
  return entries.flatMap((r) => (r.exerciseId === exercise.exerciseId && r.place !== null ? [r.place] : []));
}

/** "60 × 10": last time's Set as its cell in the set table shows it, under the table's unit. */
export function formatLastTimeSet(set: LastTimeSet): string {
  return `${set.weight} × ${set.reps}`;
}

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

/** The Session exercises in a block, in order. */
export function blockExercises(block: SessionBlock): SessionExercise[] {
  return block.kind === 'superset' ? block.exercises : [block.exercise];
}

/** A Session's exercises in block order: a Superset's members together, where its first one is. */
export function inBlockOrder(exercises: SessionExercise[]): SessionExercise[] {
  return sessionBlocks(exercises).flatMap(blockExercises);
}

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

/**
 * The session as it looks once sessionExerciseId is removed, with its Sets.
 * One left alone in its Superset is out of it too, since a Superset needs two
 * or more; its Sets keep the Superset they were logged in.
 */
export function withoutExercise(session: Session, sessionExerciseId: string): Session {
  const remaining = session.exercises.filter((e) => e.id !== sessionExerciseId);
  const aloneInSuperset = (e: SessionExercise) =>
    e.supersetId !== null && !remaining.some((o) => o !== e && o.supersetId === e.supersetId);
  return {
    ...session,
    exercises: remaining.map((e) => (aloneInSuperset(e) ? { ...e, supersetId: null } : e)),
  };
}

/** The session as it looks once setId is deleted. */
export function withoutSet(session: Session, setId: string): Session {
  return {
    ...session,
    exercises: session.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.id !== setId) })),
  };
}

/** A Set as the User is typing it, to log or to correct. */
export type SetDraft = { weight: string; reps: string; rpe: number | null; note: string; type: SetType };

export const emptySetDraft: SetDraft = { weight: '', reps: '', rpe: null, note: '', type: 'normal' };

/** A draft holding a logged Set, to correct it. */
export function setDraftOf(set: SessionSet): SetDraft {
  return { weight: String(set.weight), reps: String(set.reps), rpe: set.rpe, note: set.note, type: set.type };
}

/** The Set a draft describes, in weightUnit, or null while it's incomplete. */
export function parseSetDraft(
  draft: SetDraft,
  weightUnit: UnitPreference,
): {
  weight: number;
  weightUnit: UnitPreference;
  reps: number;
  rpe: number | null;
  note: string;
  type: SetType;
} | null {
  const weight = parseWeight(draft.weight);
  const reps = parseReps(draft.reps);
  if (weight === null || reps === null) return null;
  return { weight, weightUnit, reps, rpe: draft.rpe, note: draft.note.trim(), type: draft.type };
}

/** "32.5 kg × 10", or "32.5 kg × 10 @ RPE 8.5" */
export function formatSet(set: Pick<SessionSet, 'weight' | 'weightUnit' | 'reps' | 'rpe'>): string {
  const base = `${set.weight} ${set.weightUnit} × ${set.reps}`;
  return set.rpe === null ? base : `${base} @ RPE ${set.rpe}`;
}

/** What a Set type is called: "Warm-up". */
export function setTypeLabel(type: SetType): string {
  return SET_TYPES.find((t) => t.type === type)?.label ?? 'Normal';
}

/**
 * A logged Set as a screen reader says it: its values, then its Set type
 * unless normal, then its Record tier if it has one. "60 kg × 10, Warm-up",
 * "100 kg × 5, Silver".
 */
export function formatSetWithTier(set: SessionSet): string {
  const parts = [formatSet(set)];
  if (set.type !== 'normal') parts.push(setTypeLabel(set.type));
  if (set.recordTier) parts.push(recordTierLabels[set.recordTier]);
  return parts.join(', ');
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
 * How many numbered Sets a Session exercise plans rows for: those its
 * Target plans. With no Target, its rows are Last time's Sets (see
 * lastTimePlacesToDo), so none; with no Last time either, one, the first,
 * until a numbered Set of it is logged (see firstRowUsed in RowsToDo).
 */
function plannedNumberedSets(exercise: SessionExercise, rows: RowsToDo): number {
  if (exercise.target) return exercise.target.sets;
  if (exercise.lastTime.length > 0) return 0;
  return rows.firstRowUsed ? 0 : 1;
}

/**
 * How many numbered Sets a Session exercise has rows left for: those it
 * plans (see plannedNumberedSets), less those the User removed and those
 * logged. Warm-ups and drop Sets logged leave it unchanged. Below 0 once
 * more are logged than planned.
 */
function numberedSetsLeft(exercise: SessionExercise, rows: RowsToDo): number {
  return (
    plannedNumberedSets(exercise, rows) - rows.removedPlanned - exercise.sets.filter((s) => isNumbered(s.type)).length
  );
}

/**
 * A row still to do taken out, removed or logged, by the Exercise it was
 * for and its place among that Exercise's Last time's Sets: null for a row
 * that stood for none of them, planned by the Target or added.
 */
export type RowTakenOut = { exerciseId: string; place: number | null };

/**
 * What the User did to a Session exercise's rows still to do, beyond where
 * they start: added is how many rows they added with + Add set and haven't
 * used up, removedPlanned how many of the numbered rows planned they
 * removed, removedFromLastTime the rows from Last time they removed, logged
 * every row logged (see RowTakenOut; by Exercise, so a Swap doesn't carry
 * them to another Exercise's), keys what tells each row from the others as
 * rows above it go (see rowKeys), typed what they typed in each row, by
 * position (a row they haven't touched follows Last time, the row above, or
 * the Target; see pendingSetDrafts), and firstRowUsed whether a numbered Set
 * has been logged, which uses up the one row a Session exercise with no
 * Target and no Last time starts with for good. A row logged stays used up:
 * deleting its Set, or making it a warm-up, doesn't bring it back (see
 * withRowsUsedUp).
 */
export type RowsToDo = {
  added: number;
  firstRowUsed: boolean;
  removedPlanned: number;
  removedFromLastTime: RowTakenOut[];
  logged: RowTakenOut[];
  keys: number[];
  nextKey: number;
  typed: (SetDraft | undefined)[];
};

/** Rows still to do as they start, untouched. */
export const untouchedRows: RowsToDo = {
  added: 0,
  firstRowUsed: false,
  removedPlanned: 0,
  removedFromLastTime: [],
  logged: [],
  keys: [],
  nextKey: 0,
  typed: [],
};

/**
 * A key for each of a Session exercise's rows still to do, in order, that
 * stays with the row as rows above it are logged or removed. Rows that have
 * never moved take the next keys free.
 */
export function rowKeys(exercise: SessionExercise, rows: RowsToDo): number[] {
  const count = pendingSetCount(exercise, rows);
  const kept = rows.keys.slice(0, count);
  return [...kept, ...Array.from({ length: count - kept.length }, (_, i) => rows.nextKey + i)];
}

/**
 * The rows with every row's key written down (see rowKeys), so that taking a
 * row out leaves the others theirs.
 */
function withKeysKept(exercise: SessionExercise, rows: RowsToDo): RowsToDo {
  const keys = rowKeys(exercise, rows);
  return { ...rows, keys, nextKey: Math.max(rows.nextKey, ...keys.map((k) => k + 1)) };
}

/**
 * How many rows a Session exercise shows for Sets still to log: one for each
 * Set of Last time it has left (see lastTimePlacesToDo), then one for each
 * numbered Set it has left (see numberedSetsLeft), plus the ones the User
 * added.
 */
function pendingSetCount(exercise: SessionExercise, rows: RowsToDo): number {
  return lastTimePlacesToDo(exercise, rows).length + Math.max(numberedSetsLeft(exercise, rows), 0) + rows.added;
}

/**
 * Whether a Session exercise has a row still to do as its set table opens,
 * before the User adds or removes any.
 */
export function hasRowsToDo(exercise: SessionExercise): boolean {
  return pendingSetCount(exercise, untouchedRows) > 0;
}

/**
 * The rows of a Session exercise once the row with key (see rowKeys) is
 * removed. A row from Last time takes that Set of Last time with it (a
 * warm-up's place too, so the warm-ups after keep theirs); another row takes
 * an added row if there is one, else a planned one. Either stays gone as
 * later Sets are logged. The rows below move up with their keys and what was
 * typed in them.
 */
export function rowsAfterRemoving(exercise: SessionExercise, rows: RowsToDo, key: number): RowsToDo {
  const kept = withKeysKept(exercise, rows);
  const row = kept.keys.indexOf(key);
  if (row === -1) return rows;
  const left = { ...kept, keys: without(kept.keys, row), typed: without(rows.typed, row) };
  const places = lastTimePlacesToDo(exercise, rows);
  if (row < places.length) {
    const removed = { exerciseId: exercise.exerciseId, place: places[row] };
    return { ...left, removedFromLastTime: [...rows.removedFromLastTime, removed] };
  }
  return rows.added > 0 ? { ...left, added: rows.added - 1 } : { ...left, removedPlanned: rows.removedPlanned + 1 };
}

/**
 * The list less its item at index. Rows not typed in are holes in typed,
 * which filter would skip, so this slices around it.
 */
function without<T>(items: T[], index: number): T[] {
  return index === -1 ? items : [...items.slice(0, index), ...items.slice(index + 1)];
}

/**
 * The rows with the ones the Session exercise's logged Sets used up written
 * down, so that deleting a Set or changing its type brings none back: the
 * first row of one with no Target or Last time once a numbered Set is logged
 * (see firstRowUsed), and the rows from Last time that Sets logged before
 * resuming used up (see setsLoggedUnseen). Taken before a logged Set is
 * deleted or changed.
 */
export function withRowsUsedUp(exercise: SessionExercise, rows: RowsToDo): RowsToDo {
  const firstRowUsed = rows.firstRowUsed || exercise.sets.some((s) => isNumbered(s.type));
  const unseen = setsLoggedUnseen(exercise, rows);
  if (firstRowUsed === rows.firstRowUsed && unseen === 0) return rows;
  const unused = lastTimePlacesUnused(exercise, rows);
  const unseenRows = Array.from({ length: unseen }, (_, i) => ({
    exerciseId: exercise.exerciseId,
    place: exercise.target ? null : (unused[i] ?? null),
  }));
  return { ...rows, firstRowUsed, logged: [...rows.logged, ...unseenRows] };
}

/** The rows with one more added with + Add set. */
export function withRowAdded(rows: RowsToDo): RowsToDo {
  return { ...rows, added: rows.added + 1 };
}

/** The rows with draft typed into the row at index row. */
export function withRowTyped(rows: RowsToDo, row: number, draft: SetDraft): RowsToDo {
  const typed = [...rows.typed];
  typed[row] = draft;
  return { ...rows, typed };
}

/**
 * The rows once the row with key (see rowKeys) is logged, turning before
 * into after. A row from Last time uses up itself; another uses up a planned
 * row while there are some left, and an added one after. That row goes with
 * its key and what was typed in it. With a Target, so do the warm-up rows
 * from Last time a logged working Set leaves behind.
 */
export function rowsAfterLogging(
  before: SessionExercise,
  after: SessionExercise,
  rows: RowsToDo,
  key: number,
): RowsToDo {
  const kept = withKeysKept(before, rows);
  const row = kept.keys.indexOf(key);
  const placesBefore = lastTimePlacesToDo(before, rows);
  const fromLastTime = row !== -1 && row < placesBefore.length;
  const logged = [...rows.logged, { exerciseId: before.exerciseId, place: fromLastTime ? placesBefore[row] : null }];
  const added = fromLastTime || numberedSetsLeft(before, rows) > 0 ? rows.added : Math.max(rows.added - 1, 0);
  const afterLog = { ...withRowsUsedUp(after, { ...kept, logged }), added };
  // Rows from Last time gone that weren't the row logged: the warm-ups a
  // working Set left behind.
  const leftBehind = Math.max(
    placesBefore.length - (fromLastTime ? 1 : 0) - lastTimePlacesToDo(after, afterLog).length,
    0,
  );
  return {
    ...afterLog,
    keys: without(kept.keys, row).slice(leftBehind),
    typed: without(rows.typed, row).slice(leftBehind),
  };
}

/**
 * A row's draft with last time's weight and reps put in. It keeps its own
 * RPE, note and Set type: last time's RPE is how that Set felt.
 */
export function withLastTime(draft: SetDraft, set: LastTimeSet): SetDraft {
  return { ...draft, ...weightAndReps(set) };
}

/** A fresh draft's weight and reps, from a Set's. */
function weightAndReps(set: { weight: number; reps: number }): Pick<SetDraft, 'weight' | 'reps'> {
  return { weight: String(set.weight), reps: String(set.reps) };
}

/**
 * What each of a Session exercise's rows still to do holds: what the User
 * typed in it (see RowsToDo), else where it starts. A row from Last time
 * (see lastTimePlacesToDo) starts as its own Set of Last time, of its Set
 * type. The first numbered row after them starts as the last numbered Set
 * logged, else as last time's numbered Set at its place, else at the Target;
 * each later row starts as the nearest working row above it (a warm-up row
 * never sets it), with Last time or without, so the next row repeats the Set
 * just done. A row never starts with an RPE or note, and starts normal
 * unless from Last time.
 */
export function pendingSetDrafts(exercise: SessionExercise, weightUnit: UnitPreference, rows: RowsToDo): SetDraft[] {
  const count = pendingSetCount(exercise, rows);
  const { typed } = rows;
  // Last time is in the User's Unit preference, the table's unit.
  const drafts: SetDraft[] = lastTimeSetsToDo(exercise, rows)
    .slice(0, count)
    .map((set, i) => typed[i] ?? { ...emptySetDraft, ...weightAndReps(set), type: set.type });
  for (let i = drafts.length; i < count; i++) {
    const workingAbove = drafts.findLast((d) => d.type !== 'warmup');
    drafts.push(
      typed[i] ?? (workingAbove ? fromAbove(workingAbove) : firstNumberedDraft(exercise, weightUnit, rows, drafts)),
    );
  }
  return drafts;
}

/** A row's start as a working row above it: its weight and reps. */
function fromAbove(above: SetDraft): SetDraft {
  return { ...emptySetDraft, weight: above.weight, reps: above.reps };
}

/**
 * Where a Session exercise's first numbered row still to do starts, after the
 * rows above it: as the last numbered Set logged, else as last time's
 * numbered Set at its place, else at the Target. A warm-up never sets it.
 */
function firstNumberedDraft(
  exercise: SessionExercise,
  weightUnit: UnitPreference,
  rows: RowsToDo,
  above: SetDraft[],
): SetDraft {
  const logged = lastNumberedSet(exercise, weightUnit);
  const atPlace = lastTimeAtPlaces(exercise, [...above.map((d) => d.type), 'normal'], rows).at(-1);
  const start = logged ?? atPlace;
  return start
    ? { ...emptySetDraft, ...weightAndReps(start) }
    : setDraftFromTarget(currentTarget(exercise), weightUnit);
}

/** The last numbered Set logged of the Exercise being done now, in weightUnit, if any. */
function lastNumberedSet(exercise: SessionExercise, weightUnit: UnitPreference): SessionSet | undefined {
  return exercise.sets.findLast(
    (s) => s.exerciseId === exercise.exerciseId && s.weightUnit === weightUnit && isNumbered(s.type),
  );
}

/**
 * Logged Sets of a Session exercise in a row done with one Exercise, each
 * with its place in the exercise, from 1, and its mark (see setMarks).
 */
export type SetRun = { exerciseId: string; name: string; sets: { set: SessionSet; number: number; mark: string }[] };

/** A Session exercise's logged Sets, in runs done with the same Exercise, as swaps split them. */
export function setRuns(exercise: SessionExercise): SetRun[] {
  const runs: SetRun[] = [];
  const marks = setMarks(exercise.sets);
  exercise.sets.forEach((set, i) => {
    const last = runs.at(-1);
    const entry = { set, number: i + 1, mark: marks[i] };
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
