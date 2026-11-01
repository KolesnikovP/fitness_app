import { Image, StyleSheet } from 'react-native';

import { apiUrl } from '@/shared/api';
import { makeStyles } from '@/shared/ui';

type ExerciseMediaProps = {
  /** An API path, such as an exercise's imageUrl. */
  path: string;
  token: string;
  accessibilityLabel: string;
};

/** An exercise image or GIF. Media is only served to signed-in users. */
export function ExerciseMedia({ path, token, accessibilityLabel }: ExerciseMediaProps) {
  const styles = useStyles();
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

const useStyles = makeStyles((colors) => ({
  media: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: colors.placeholder },
}));
