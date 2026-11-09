import { Image } from 'react-native';

import { apiUrl } from '@/shared/api';
import { makeStyles } from '@/shared/ui';

type ExerciseMediaProps = {
  /** An API path, such as an exercise's imageUrl. */
  path: string;
  token: string;
  accessibilityLabel: string;
  /** Fill the container, such as a slot kept for media, instead of a rounded square. */
  fill?: boolean;
};

/** An exercise image or GIF. Media is only served to signed-in users. */
export function ExerciseMedia({ path, token, accessibilityLabel, fill }: ExerciseMediaProps) {
  const styles = useStyles();
  return (
    <Image
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      source={{ uri: apiUrl(path), headers: { Authorization: `Bearer ${token}` } }}
      style={fill ? styles.fill : styles.media}
      resizeMode="contain"
    />
  );
}

const useStyles = makeStyles((colors) => ({
  media: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: colors.card },
  fill: { width: '100%', height: '100%' },
}));
