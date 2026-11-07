import type { UnitPreference } from '@/shared/model';

/**
 * The signed-in user. A null unitPreference means onboarding isn't finished.
 * name is the one they chose, or else the part of their email before the @.
 * avatarUrl is the API path of their avatar, null without one.
 */
export type Me = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  unitPreference: UnitPreference | null;
};

/** The counts on a User's Profile: finished workouts, the Personal records they set, and the Streak in weeks. */
export type ProfileCounts = { workouts: number; personalRecords: number; streak: number };

/** The most characters a User's name may have. */
export const MAX_NAME_CHARS = 50;

/** "PK" for "Petr Kolesnikov", "L" for "lifter": the first letters of the first two words. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0].toUpperCase())
    .join('');
}
