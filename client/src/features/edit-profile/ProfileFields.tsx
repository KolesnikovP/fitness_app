import * as ImagePicker from 'expo-image-picker';
import { Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { Avatar, MAX_NAME_CHARS } from '@/entities/user';
import { Button, makeStyles, spacing, TextField } from '@/shared/ui';

import type { ProfileDraft } from './useProfileDraft';

/**
 * The fields of Edit profile: the avatar (add, change or remove) and the
 * name. They change only the draft; the screen holding them has the Save.
 */
export function ProfileFields({ draft }: { draft: ProfileDraft }) {
  const styles = useStyles();
  const { state } = useAuth();
  if (state.status !== 'signedIn') return null;
  const { me, avatar } = draft;
  const shown =
    avatar.kind === 'replace'
      ? { uri: avatar.file.uri }
      : avatar.kind === 'keep' && me.avatarUrl
        ? { path: me.avatarUrl, token: state.token }
        : null;

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      // Re-encodes to JPEG, so a HEIC photo uploads as one the API accepts,
      // and keeps it well under the 10 MB limit.
      quality: 0.8,
      exif: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    draft.setAvatar({
      kind: 'replace',
      file: { uri: asset.uri, name: asset.fileName ?? 'avatar.jpg', type: asset.mimeType ?? 'image/jpeg' },
    });
  }

  return (
    <View style={styles.fields}>
      <View style={styles.avatar}>
        <Avatar name={draft.name.trim() || me.name} source={shown} />
      </View>
      <View style={styles.buttons}>
        <View style={styles.grow}>
          <Button
            label={shown ? 'Change avatar' : 'Add avatar'}
            variant="secondary"
            onPress={pickAvatar}
            disabled={draft.saving}
          />
        </View>
        {shown ? (
          <View style={styles.grow}>
            <Button
              label="Remove avatar"
              variant="secondary"
              tone="danger"
              onPress={() => draft.setAvatar({ kind: 'remove' })}
              disabled={draft.saving}
            />
          </View>
        ) : null}
      </View>
      <TextField
        label="Name"
        value={draft.name}
        placeholder={me.email.split('@')[0]}
        // Kept to the limit in characters, as the API counts, so an emoji is one.
        onChangeText={(name) => draft.setName([...name].slice(0, MAX_NAME_CHARS).join(''))}
        returnKeyType="done"
      />
      {draft.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {draft.error}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  fields: { gap: spacing.md },
  avatar: { alignItems: 'center' },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
  error: { color: colors.danger, fontSize: 15 },
}));
