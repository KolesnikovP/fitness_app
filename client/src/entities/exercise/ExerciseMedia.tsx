import { Image, StyleSheet } from 'react-native';

import { apiUrl } from '@/shared/api';

type ExerciseMediaProps = {
  /** An API path, such as an exercise's imageUrl. */
  path: string;
  token: string;
  accessibilityLabel: string;
};

/** An exercise image or GIF. Media is only served to signed-in users. */
export function ExerciseMedia({ path, token, accessibilityLabel }: ExerciseMediaProps) {
  return (
    <Image
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      source={{ uri: apiUrl(path), headers: { Authorization: `Bearer ${token}` } }}
      style={styles.media}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  media: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: '#F2F2F2' },
});
