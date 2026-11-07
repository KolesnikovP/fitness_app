import { useState } from 'react';

import { useAuth } from '@/entities/auth';
import {
  MAX_CAPTION_CHARS,
  removePostPhoto,
  setPostCaption,
  setPostPhoto,
  type PhotoFile,
  type Post,
} from '@/entities/post';
import { renameSession } from '@/entities/workout';
import { errorMessage } from '@/shared/api';

/** What happens to the Progress photo on Save: kept as it is, replaced by a picked one, or removed. */
export type PhotoChange = { kind: 'keep' } | { kind: 'replace'; file: PhotoFile } | { kind: 'remove' };

/**
 * A finished Session's name, Progress photo and caption as the User edits
 * them, saved together by one Save; nothing is saved before. Throwing the
 * draft away (Cancel) leaves the Post as it was.
 */
export type WorkoutDraft = {
  post: Post;
  name: string;
  setName: (name: string) => void;
  caption: string;
  setCaption: (caption: string) => void;
  photo: PhotoChange;
  setPhoto: (photo: PhotoChange) => void;
  /** Characters in the caption, counted by code point as the API counts, so an emoji is one. */
  captionLength: number;
  captionTooLong: boolean;
  changed: boolean;
  saving: boolean;
  error: string | null;
  /** Saves what changed, and returns the Post as it is then; null if it failed, with error set. */
  save: () => Promise<Post | null>;
};

export function useWorkoutDraft(post: Post): WorkoutDraft {
  const { state } = useAuth();
  const [name, setName] = useState(post.session.name);
  const [caption, setCaption] = useState(post.caption);
  const [photo, setPhoto] = useState<PhotoChange>({ kind: 'keep' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captionLength = [...caption].length;
  const captionTooLong = captionLength > MAX_CAPTION_CHARS;
  const nameChanged = name.trim() !== post.session.name;
  const captionChanged = caption !== post.caption;
  const changed = nameChanged || captionChanged || photo.kind !== 'keep';

  async function save(): Promise<Post | null> {
    if (state.status !== 'signedIn') return null;
    const token = state.token;
    setError(null);
    setSaving(true);
    try {
      let saved = post;
      if (nameChanged) saved = { ...saved, session: await renameSession(token, post.id, name) };
      if (captionChanged) saved = await setPostCaption(token, post.id, caption);
      if (photo.kind === 'replace') saved = await setPostPhoto(token, post.id, photo.file);
      if (photo.kind === 'remove' && post.photoUrl) saved = await removePostPhoto(token, post.id);
      // What's saved is no longer a change.
      setName(saved.session.name);
      setPhoto({ kind: 'keep' });
      return saved;
    } catch (e) {
      setError(errorMessage(e));
      return null;
    } finally {
      setSaving(false);
    }
  }

  return {
    post,
    name,
    setName,
    caption,
    setCaption,
    photo,
    setPhoto,
    captionLength,
    captionTooLong,
    changed,
    saving,
    error,
    save,
  };
}
