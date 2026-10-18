// Exercise entity: library types, API bindings and display components
export {
  EQUIPMENT_TYPES,
  MUSCLE_GROUPS,
  equipmentLabel,
  muscleGroupLabel,
  type EquipmentType,
  type Exercise,
  type MuscleGroup,
} from './model';
export {
  createExercise,
  getExercise,
  listExercises,
  uploadExerciseMedia,
  type ExerciseFilters,
  type MediaFile,
  type NewExercise,
} from './api';
export { ExerciseListItem } from './ExerciseListItem';
export { ExerciseMedia } from './ExerciseMedia';
