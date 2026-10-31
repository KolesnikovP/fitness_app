import { apiRequest } from '@/shared/api';

import type { Session, SessionSummary, WeightUnit } from './model';

const base = '/workouts/sessions';
const path = (sessionId: string, ...rest: string[]) =>
  [base, sessionId, ...rest].map((part, i) => (i === 0 ? part : encodeURIComponent(part))).join('/');

/** Starts an empty, freeform Session. Fails with session_in_progress if one already is. */
export function startSession(token: string): Promise<Session> {
  return apiRequest<Session>(base, { method: 'POST', token });
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

export type NewSet = { weight: number; weightUnit: WeightUnit; reps: number; note: string };

export function logSet(token: string, sessionId: string, sessionExerciseId: string, set: NewSet): Promise<Session> {
  return apiRequest<Session>(path(sessionId, 'exercises', sessionExerciseId, 'sets'), {
    method: 'POST',
    token,
    body: set,
  });
}

/** Finishes and saves a Session. It needs at least one Set. */
export function finishSession(token: string, sessionId: string): Promise<Session> {
  return apiRequest<Session>(path(sessionId, 'finish'), { method: 'POST', token });
}

/** Deletes a Session in progress. */
export async function discardSession(token: string, sessionId: string): Promise<void> {
  await apiRequest<null>(path(sessionId), { method: 'DELETE', token });
}
