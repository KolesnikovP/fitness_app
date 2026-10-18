import { apiRequest } from '@/shared/api';

import type { Me, UnitPreference } from './model';

export function getMe(token: string): Promise<Me> {
  return apiRequest<Me>('/users/me', { token });
}

export function setUnitPreference(token: string, unitPreference: UnitPreference): Promise<Me> {
  return apiRequest<Me>('/users/me', { method: 'PATCH', token, body: { unitPreference } });
}
