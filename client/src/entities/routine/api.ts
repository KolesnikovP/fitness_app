import { apiRequest } from '@/shared/api';

import type { Routine, RoutineInput, RoutineSummary } from './model';

const base = '/routines';
const path = (id: string) => `${base}/${encodeURIComponent(id)}`;

/** The user's Routines, by name. */
export async function listRoutines(token: string): Promise<RoutineSummary[]> {
  const { routines } = await apiRequest<{ routines: RoutineSummary[] }>(base, { token });
  return routines;
}

export function getRoutine(token: string, id: string): Promise<Routine> {
  return apiRequest<Routine>(path(id), { token });
}

export function createRoutine(token: string, routine: RoutineInput): Promise<Routine> {
  return apiRequest<Routine>(base, { method: 'POST', token, body: routine });
}

/** Replaces a Routine's name and slots. */
export function updateRoutine(token: string, id: string, routine: RoutineInput): Promise<Routine> {
  return apiRequest<Routine>(path(id), { method: 'PUT', token, body: routine });
}

/** Deletes a Routine. Workouts started from it are kept. */
export async function deleteRoutine(token: string, id: string): Promise<void> {
  await apiRequest<null>(path(id), { method: 'DELETE', token });
}
