import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { removePostPhoto, setPostCaption, setPostPhoto, type Post } from '@/entities/post';
import { errorMessage } from '@/shared/api';
import { Button, makeStyles, spacing, TextField } from '@/shared/ui';

type PostEditorProps = {
  post: Post;
  onChange: (post: Post) => void;
};

/**
 * Sets a Post's caption and Progress photo: a caption field with its own save
 * button, and buttons to add, change or remove the photo, which upload at
 * once. It shows neither the photo nor the saved caption; the screen does.
 */
export function PostEditor({ post, onChange }: PostEditorProps) {
  const styles = useStyles();
  const { state } = useAuth();
  const [caption, setCaption] = useState(post.caption);
  const [busy, setBusy] = useState<'caption' | 'photo' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (state.status !== 'signedIn') return null;
  const token = state.token;

  async function run(what: 'caption' | 'photo' | 'remove', change: () => Promise<Post>) {
    setError(null);
    setBusy(what);
    try {
      onChange(await change());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // Re-encodes to JPEG, so a HEIC photo uploads as one the API accepts,
      // and keeps it well under the 10 MB limit.
      quality: 0.8,
      exif: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    await run('photo', () =>
      setPostPhoto(token, post.id, {
        uri: asset.uri,
        name: asset.fileName ?? 'photo.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      }),
    );
  }

  return (
    <View style={styles.editor}>
      <View style={styles.photoButtons}>
        <View style={styles.grow}>
          <Button
            label={post.photoUrl ? 'Change photo' : 'Add progress photo'}
            variant="secondary"
            onPress={pickPhoto}
            loading={busy === 'photo'}
            disabled={busy !== null}
          />
        </View>
        {post.photoUrl ? (
          <View style={styles.grow}>
            <Button
              label="Remove photo"
              variant="secondary"
              tone="danger"
              onPress={() => run('remove', () => removePostPhoto(token, post.id))}
              loading={busy === 'remove'}
              disabled={busy !== null}
            />
          </View>
        ) : null}
      </View>
      <TextField label="Caption" placeholder="How did it go?" value={caption} onChangeText={setCaption} multiline />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button
        label="Save caption"
        variant="secondary"
        onPress={() => run('caption', () => setPostCaption(token, post.id, caption))}
        loading={busy === 'caption'}
        disabled={busy !== null || caption === post.caption}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  editor: { gap: spacing.sm },
  photoButtons: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
  error: { color: colors.danger, fontSize: 15 },
}));
