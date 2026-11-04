import { apiRequest } from '@/shared/api';

import type { ExerciseRecords, Session, SessionSummary, Totals, WeightUnit } from './model';

const base = '/workouts/sessions';
const path = (sessionId: string, ...rest: string[]) =>
  [base, sessionId, ...rest].map((part, i) => (i === 0 ? part : encodeURIComponent(part))).join('/');

/**
 * Starts a Session: a Freeform session, or one pre-populated from routineId.
 * Fails with session_in_progress if one already is.
 */
export function startSession(token: string, routineId?: string): Promise<Session> {
  return apiRequest<Session>(base, { method: 'POST', token, body: routineId ? { routineId } : undefined });
}

/** The Session in progress, or null. */
export async function getCurrentSession(token: string): Promise<Session | null> {
  const { session } = await apiRequest<{ session: Session | null }>(`${base}/current`, { token });
  return session;
}

/** The user's finished Sessions, newest first. */
export async function listSessionHistory(token: string): Promise<SessionSummary[]> {
  const { sessions } = await apiRequest<{ sessions: SessionSummary[] }>(base, { token });
  return sessions;
}

/** One of the user's Sessions, with its stats once finished. */
export function getSession(token: string, sessionId: string): Promise<Session> {
  return apiRequest<Session>(path(sessionId), { token });
}

/** The user's current records for an Exercise, from their finished Sessions. */
export function getExerciseRecords(token: string, exerciseId: string): Promise<ExerciseRecords> {
  return apiRequest<ExerciseRecords>(`/workouts/exercises/${encodeURIComponent(exerciseId)}/records`, { token });
}

/** The totals of the user's Sessions finished from `from` up to, not including, `to`. */
export function getTotals(token: string, from: Date, to: Date): Promise<Totals> {
  const query = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  return apiRequest<Totals>(`/workouts/totals?${query}`, { token });
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
export type NewSet = { weight: number; weightUnit: WeightUnit; reps: number; rpe: number | null; note: string };

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
  const { id } = await apiRequest<{ id: string }>(path(sessionId, 'routine'), { method: 'POST', token, body: { name } });
  return id;
}

/** Deletes a Session in progress. */
export async function discardSession(token: string, sessionId: string): Promise<void> {
  await apiRequest<null>(path(sessionId), { method: 'DELETE', token });
}
