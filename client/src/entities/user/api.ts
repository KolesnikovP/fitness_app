import { apiRequest } from '@/shared/api';
import type { UnitPreference } from '@/shared/model';

import type { Me, ProfileCounts } from './model';

/** A picked image, as React Native uploads it. */
export type ImageFile = { uri: string; name: string; type: string };

export function getMe(token: string): Promise<Me> {
  return apiRequest<Me>('/users/me', { token });
}

export function setUnitPreference(token: string, unitPreference: UnitPreference): Promise<Me> {
  return apiRequest<Me>('/users/me', { method: 'PATCH', token, body: { unitPreference } });
}

/** Sets the User's name; an empty one clears it, so they're named after their email again. */
export function setName(token: string, name: string): Promise<Me> {
  return apiRequest<Me>('/users/me', { method: 'PATCH', token, body: { name } });
}

/** Sets the User's avatar, replacing any earlier one. */
export function setAvatar(token: string, file: ImageFile): Promise<Me> {
  const form = new FormData();
  // React Native uploads a { uri, name, type } entry as the file at that URI.
  form.append('file', file as unknown as Blob);
  return apiRequest<Me>('/users/me/avatar', { method: 'PUT', token, body: form });
}

export function removeAvatar(token: string): Promise<Me> {
  return apiRequest<Me>('/users/me/avatar', { method: 'DELETE', token });
}

/** The User's Profile counts, with weeks starting on Monday in the device's time zone. */
export function getProfileCounts(token: string): Promise<ProfileCounts> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return apiRequest<ProfileCounts>(`/users/me/counts?timeZone=${encodeURIComponent(timeZone)}`, { token });
}
