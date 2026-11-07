import { useState } from 'react';

import { useAuth } from '@/entities/auth';
import { removeAvatar, setAvatar, setName as saveName, type ImageFile, type Me } from '@/entities/user';
import { errorMessage } from '@/shared/api';

/** What happens to the avatar on Save: kept as it is, replaced by a picked one, or removed. */
export type AvatarChange = { kind: 'keep' } | { kind: 'replace'; file: ImageFile } | { kind: 'remove' };

/**
 * The User's name and avatar as they edit them, saved together by one Save;
 * nothing is saved before. A cleared name names them after their email again.
 */
export type ProfileDraft = {
  me: Me;
  name: string;
  setName: (name: string) => void;
  avatar: AvatarChange;
  setAvatar: (avatar: AvatarChange) => void;
  /** Whether there's something to save and it can be saved. */
  canSave: boolean;
  saving: boolean;
  error: string | null;
  /** Saves what changed and shows it as the signed-in User; false if it failed, with error set. */
  save: () => Promise<boolean>;
};

export function useProfileDraft(me: Me): ProfileDraft {
  const { state, setMe } = useAuth();
  const [name, setName] = useState(me.name);
  const [avatar, setAvatarChange] = useState<AvatarChange>({ kind: 'keep' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameChanged = name.trim() !== me.name;
  const changed = nameChanged || avatar.kind !== 'keep';

  async function save(): Promise<boolean> {
    if (state.status !== 'signedIn') return false;
    const token = state.token;
    setError(null);
    setSaving(true);
    try {
      let saved = me;
      if (nameChanged) saved = await saveName(token, name);
      if (avatar.kind === 'replace') saved = await setAvatar(token, avatar.file);
      if (avatar.kind === 'remove' && me.avatarUrl) saved = await removeAvatar(token);
      setMe(saved);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  }

  return {
    me,
    name,
    setName,
    avatar,
    setAvatar: setAvatarChange,
    canSave: changed && !saving,
    saving,
    error,
    save,
  };
}
