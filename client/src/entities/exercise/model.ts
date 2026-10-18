import type { ChipOption } from '@/shared/ui';

/** Must match the values the API accepts (backend/internal/exercise). */
export const MUSCLE_GROUPS = [
  { value: 'chest', label: 'Chest' },
  { value: 'back', label: 'Back' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'biceps', label: 'Biceps' },
  { value: 'triceps', label: 'Triceps' },
  { value: 'forearms', label: 'Forearms' },
  { value: 'abs', label: 'Abs' },
  { value: 'quads', label: 'Quads' },
  { value: 'hamstrings', label: 'Hamstrings' },
  { value: 'glutes', label: 'Glutes' },
  { value: 'calves', label: 'Calves' },
  { value: 'full_body', label: 'Full body' },
] as const satisfies readonly ChipOption<string>[];

export const EQUIPMENT_TYPES = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'machine', label: 'Machine' },
  { value: 'cable', label: 'Cable' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'band', label: 'Band' },
  { value: 'other', label: 'Other' },
] as const satisfies readonly ChipOption<string>[];

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]['value'];
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number]['value'];

/**
 * An exercise in the library: canonical, or one of the user's own custom
 * ones. imageUrl and animationUrl are API paths, null when there's no media.
 */
export type Exercise = {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: EquipmentType;
  isCustom: boolean;
  imageUrl: string | null;
  animationUrl: string | null;
};

export function muscleGroupLabel(value: MuscleGroup): string {
  return MUSCLE_GROUPS.find((g) => g.value === value)?.label ?? value;
}

export function equipmentLabel(value: EquipmentType): string {
  return EQUIPMENT_TYPES.find((e) => e.value === value)?.label ?? value;
}
