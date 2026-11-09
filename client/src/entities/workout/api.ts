import { apiRequest } from '@/shared/api';
import type { UnitPreference } from '@/shared/model';

import type { ExerciseBest, ExerciseProgress, ExerciseRecords, Session, SetType } from './model';

const base = '/workouts/sessions';
const path = (sessionId: string, ...rest: string[]) =>
  [base, sessionId, ...rest].map((part, i) => (i === 0 ? part : encodeURIComponent(part))).join('/');

/**
 * Starts a Session: a Freeform session, or one pre-populated from routineId.
 * A Freeform session is named for when it starts in the device's time zone.
 * Fails with session_in_progress if one already is.
 */
export function startSession(token: string, routineId?: string): Promise<Session> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return apiRequest<Session>(base, { method: 'POST', token, body: routineId ? { routineId, timeZone } : { timeZone } });
}

/**
 * Renames one of the user's Sessions. A blank name clears it, so it's called
 * the name it was given again. Its Routine keeps its own name.
 */
export function renameSession(token: string, sessionId: string, name: string): Promise<Session> {
  return apiRequest<Session>(path(sessionId), { method: 'PATCH', token, body: { name } });
}

/** The Session in progress, or null. */
export async function getCurrentSession(token: string): Promise<Session | null> {
  const { session } = await apiRequest<{ session: Session | null }>(`${base}/current`, { token });
  return session;
}

/** One of the user's Sessions, with its stats once finished. */
export function getSession(token: string, sessionId: string): Promise<Session> {
  return apiRequest<Session>(path(sessionId), { token });
}

/** The user's current records for an Exercise, from their finished Sessions. */
export function getExerciseRecords(token: string, exerciseId: string): Promise<ExerciseRecords> {
  return apiRequest<ExerciseRecords>(`/workouts/exercises/${encodeURIComponent(exerciseId)}/records`, { token });
}

/** The user's progress at an Exercise: a point per finished Session of it, oldest first. */
export function getExerciseProgress(token: string, exerciseId: string): Promise<ExerciseProgress> {
  return apiRequest<ExerciseProgress>(`/workouts/exercises/${encodeURIComponent(exerciseId)}/progress`, { token });
}

/** The best Estimated 1RM of every Exercise the User has done with weight, by name: their bests on Progress. */
export async function getExerciseBests(token: string): Promise<ExerciseBest[]> {
  const { exercises } = await apiRequest<{ exercises: ExerciseBest[] }>('/workouts/records', { token });
  return exercises;
}

export function addExerciseToSession(token: string, sessionId: string, exerciseId: string): Promise<Session> {
  return apiRequest<Session>(path(sessionId, 'exercises'), { method: 'POST', token, body: { exerciseId } });
}

/** Sets a Session exercise's note; an empty note clears it. */
export function setExerciseNote(token: string, sessionId: string, sessionExerciseId: string, note: string) {
  return apiRequest<Session>(path(sessionId, 'exercises', sessionExerciseId), {
    method: 'PATCH',
    token,
    body: { note },
  });
}

/**
 * Swaps a Session exercise to its planned Exercise or one of its Substitutes,
 * for this Session only. Sets logged after record the Exercise swapped to.
 */
export function swapSessionExercise(token: string, sessionId: string, sessionExerciseId: string, exerciseId: string) {
  return apiRequest<Session>(path(sessionId, 'exercises', sessionExerciseId), {
    method: 'PATCH',
    token,
    body: { exerciseId },
  });
}

/** A Set to log. rpe is null when left blank. */
export type NewSet = {
  weight: number;
  weightUnit: UnitPreference;
  reps: number;
  rpe: number | null;
  note: string;
  type: SetType;
};

export function logSet(token: string, sessionId: string, sessionExerciseId: string, set: NewSet): Promise<Session> {
  return apiRequest<Session>(path(sessionId, 'exercises', sessionExerciseId, 'sets'), {
    method: 'POST',
    token,
    body: set,
  });
}

/** Corrects a logged Set. It keeps its place and the Superset it was logged in. */
export function editSet(token: string, sessionId: string, setId: string, set: NewSet): Promise<Session> {
  return apiRequest<Session>(path(sessionId, 'sets', setId), { method: 'PATCH', token, body: set });
}

/** Deletes a logged Set. */
export function deleteSet(token: string, sessionId: string, setId: string): Promise<Session> {
  return apiRequest<Session>(path(sessionId, 'sets', setId), { method: 'DELETE', token });
}

/** Groups two or more Session exercises, none already in one, into a new Superset. */
export function createSuperset(token: string, sessionId: string, sessionExerciseIds: string[]): Promise<Session> {
  return apiRequest<Session>(path(sessionId, 'supersets'), {
    method: 'POST',
    token,
    body: { sessionExerciseIds },
  });
}

/** Takes a Superset's exercises out of it. Their logged Sets keep the Superset. */
export function ungroupSuperset(token: string, sessionId: string, supersetId: string): Promise<Session> {
  return apiRequest<Session>(path(sessionId, 'supersets', supersetId), { method: 'DELETE', token });
}

/** Finishes and saves a Session. It needs at least one Set. */
export function finishSession(token: string, sessionId: string): Promise<Session> {
  return apiRequest<Session>(path(sessionId, 'finish'), { method: 'POST', token });
}

/** Saves a finished Session's logged exercises as a new Routine, and returns its id. */
export async function saveSessionAsRoutine(token: string, sessionId: string, name: string): Promise<string> {
  const { id } = await apiRequest<{ id: string }>(path(sessionId, 'routine'), {
    method: 'POST',
    token,
    body: { name },
  });
  return id;
}

/** Deletes a Session in progress. */
export async function discardSession(token: string, sessionId: string): Promise<void> {
  await apiRequest<null>(path(sessionId), { method: 'DELETE', token });
}
