import type { UnitPreference } from '@/shared/model';

/** The signed-in user. A null unitPreference means onboarding isn't finished. */
export type Me = {
  id: string;
  email: string;
  unitPreference: UnitPreference | null;
};
