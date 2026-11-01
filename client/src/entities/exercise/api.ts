import { apiRequest } from '@/shared/api';

import type { EquipmentType, Exercise, MuscleGroup } from './model';

export type ExerciseFilters = {
  query: string;
  muscleGroup: MuscleGroup | null;
  equipmentType: EquipmentType | null;
};

export async function listExercises(token: string, filters: ExerciseFilters): Promise<Exercise[]> {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set('q', filters.query.trim());
  if (filters.muscleGroup) params.set('muscleGroup', filters.muscleGroup);
  if (filters.equipmentType) params.set('equipmentType', filters.equipmentType);
  const search = params.toString();
  const { exercises } = await apiRequest<{ exercises: Exercise[] }>(`/exercises${search ? `?${search}` : ''}`, {
    token,
  });
  return exercises;
}

export function getExercise(token: string, id: string): Promise<Exercise> {
  return apiRequest<Exercise>(`/exercises/${encodeURIComponent(id)}`, { token });
}

export type NewExercise = { name: string; muscleGroup: MuscleGroup; equipmentType: EquipmentType };

export function createExercise(token: string, exercise: NewExercise): Promise<Exercise> {
  return apiRequest<Exercise>('/exercises', { method: 'POST', token, body: exercise });
}

/** A file on the device, as returned by the image picker. */
export type MediaFile = { uri: string; name: string; type: string };

/**
 * Sets a custom exercise's image, or its animated demo when the file is a
 * GIF. Returns the updated exercise.
 */
export function uploadExerciseMedia(token: string, id: string, file: MediaFile): Promise<Exercise> {
  const form = new FormData();
  // React Native uploads a { uri, name, type } entry as the file at that URI.
  form.append('file', file as unknown as Blob);
  return apiRequest<Exercise>(`/exercises/${encodeURIComponent(id)}/media`, { method: 'POST', token, body: form });
}
