/**
 * A Unit preference: whether a User sees weights in kilograms or pounds. A
 * weight carries the one it was logged or planned in.
 */
export type UnitPreference = 'kg' | 'lb';

/** An Exercise, named: what a Routine or Session refers to one by. */
export type ExerciseRef = { exerciseId: string; name: string };
