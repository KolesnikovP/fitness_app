import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useAuth } from '@/entities/auth';
import { uploadExerciseMedia, type Exercise } from '@/entities/exercise';
import { errorMessage } from '@/shared/api';
import { Button, colors } from '@/shared/ui';

type UploadMediaButtonProps = {
  exercise: Exercise;
  onUploaded: (exercise: Exercise) => void;
};

/**
 * Picks a photo or GIF from the library and uploads it to a custom exercise.
 * A GIF becomes the animated demo; any other image, the static image.
 */
export function UploadMediaButton({ exercise, onUploaded }: UploadMediaButtonProps) {
  const { state } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickAndUpload() {
    if (state.status !== 'signedIn') return;
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
    if (result.canceled) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const updated = await uploadExerciseMedia(state.token, exercise.id, {
        uri: asset.uri,
        name: asset.fileName ?? 'upload',
        type: asset.mimeType ?? 'application/octet-stream',
      });
      onUploaded(updated);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Add image or GIF" variant="secondary" onPress={pickAndUpload} loading={uploading} />
    </>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 15 },
});
