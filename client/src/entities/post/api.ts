import { apiRequest } from '@/shared/api';

import type { Post } from './model';

const path = (postId: string, ...rest: string[]) => ['/posts', encodeURIComponent(postId), ...rest].join('/');

/** A picked photo, as React Native uploads it. */
export type PhotoFile = { uri: string; name: string; type: string };

/** The Post of one of the user's finished Sessions. */
export function getPost(token: string, postId: string): Promise<Post> {
  return apiRequest<Post>(path(postId), { token });
}

/** Sets a Post's caption; an empty caption clears it. */
export function setPostCaption(token: string, postId: string, caption: string): Promise<Post> {
  return apiRequest<Post>(path(postId), { method: 'PATCH', token, body: { caption } });
}

/** Sets a Post's Progress photo, replacing any earlier one. */
export function setPostPhoto(token: string, postId: string, file: PhotoFile): Promise<Post> {
  const form = new FormData();
  // React Native uploads a { uri, name, type } entry as the file at that URI.
  form.append('file', file as unknown as Blob);
  return apiRequest<Post>(path(postId, 'photo'), { method: 'PUT', token, body: form });
}

/** Removes a Post's Progress photo. */
export function removePostPhoto(token: string, postId: string): Promise<Post> {
  return apiRequest<Post>(path(postId, 'photo'), { method: 'DELETE', token });
}
