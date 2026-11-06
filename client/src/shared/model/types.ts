/** The unit a User weighs in: their Unit preference, and the unit a weight was logged in. */
export type UnitPreference = 'kg' | 'lb';

/** The unit a weight was logged or planned in. */
export type WeightUnit = UnitPreference;

/** A pointer to an Exercise in the library, by id, with its name to show. */
export type ExerciseRef = { exerciseId: string; name: string };
