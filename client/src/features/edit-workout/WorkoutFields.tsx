import * as ImagePicker from 'expo-image-picker';
import { Image, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { MAX_CAPTION_CHARS, PostPhoto } from '@/entities/post';
import { MAX_SESSION_NAME_CHARS } from '@/entities/workout';
import { Button, makeStyles, spacing, TextField } from '@/shared/ui';

import type { WorkoutDraft } from './useWorkoutDraft';

/**
 * The fields of Edit workout: the Session name, the Progress photo (add,
 * change or remove) and the caption with its 2,200 counter. They change only
 * the draft; the screen holding them has the Save.
 */
export function WorkoutFields({ draft }: { draft: WorkoutDraft }) {
  const styles = useStyles();
  const { state } = useAuth();
  if (state.status !== 'signedIn') return null;
  const { post, photo } = draft;
  const hasPhoto = photo.kind === 'replace' || (photo.kind === 'keep' && post.photoUrl !== null);

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
    draft.setPhoto({
      kind: 'replace',
      file: { uri: asset.uri, name: asset.fileName ?? 'photo.jpg', type: asset.mimeType ?? 'image/jpeg' },
    });
  }

  return (
    <View style={styles.fields}>
      <TextField
        label="Name"
        value={draft.name}
        // Kept to the limit in characters, as the API counts, so an emoji is
        // one; maxLength would count UTF-16 units and allow half as many.
        onChangeText={(name) => draft.setName([...name].slice(0, MAX_SESSION_NAME_CHARS).join(''))}
        returnKeyType="done"
      />
      {photo.kind === 'replace' ? (
        <Image
          accessible
          accessibilityRole="image"
          accessibilityLabel="Progress photo"
          source={{ uri: photo.file.uri }}
          style={styles.photo}
          resizeMode="cover"
        />
      ) : photo.kind === 'keep' && post.photoUrl ? (
        <PostPhoto path={post.photoUrl} token={state.token} style={styles.photo} />
      ) : null}
      <View style={styles.photoButtons}>
        <View style={styles.grow}>
          <Button
            label={hasPhoto ? 'Change photo' : 'Add progress photo'}
            variant="secondary"
            onPress={pickPhoto}
            disabled={draft.saving}
          />
        </View>
        {hasPhoto ? (
          <View style={styles.grow}>
            <Button
              label="Remove photo"
              variant="secondary"
              tone="danger"
              onPress={() => draft.setPhoto({ kind: 'remove' })}
              disabled={draft.saving}
            />
          </View>
        ) : null}
      </View>
      <TextField
        label="Caption"
        placeholder="How did it go?"
        value={draft.caption}
        onChangeText={draft.setCaption}
        multiline
      />
      <Text style={[styles.count, draft.captionTooLong && styles.over]}>
        {`${draft.captionLength.toLocaleString('en-US')} / ${MAX_CAPTION_CHARS.toLocaleString('en-US')}`}
      </Text>
      {draft.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {draft.error}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  fields: { gap: spacing.sm },
  photo: { width: '100%', aspectRatio: 4 / 5, borderRadius: 12, backgroundColor: colors.card },
  photoButtons: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
  error: { color: colors.danger, fontSize: 15 },
  count: { fontSize: 13, color: colors.muted, alignSelf: 'flex-end' },
  over: { color: colors.danger },
}));
