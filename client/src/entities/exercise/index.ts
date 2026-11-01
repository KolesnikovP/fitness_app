// Exercise entity: library types, API bindings and display components
export {
  EQUIPMENT_TYPES,
  MUSCLE_GROUPS,
  equipmentLabel,
  muscleGroupLabel,
  type EquipmentType,
  type Exercise,
  type ExerciseRef,
  type MuscleGroup,
} from './model';
export {
  createExercise,
  getExercise,
  listExercises,
  listSubstituteSuggestions,
  uploadExerciseMedia,
  type ExerciseFilters,
  type MediaFile,
  type NewExercise,
} from './api';
export { EQUIPMENT_ART, MUSCLE_GROUP_ART } from './filterArt';
export { ExerciseListItem } from './ExerciseListItem';
export { ExerciseMedia } from './ExerciseMedia';
