import { Image, Text, View } from 'react-native';

import { apiUrl } from '@/shared/api';
import { makeStyles } from '@/shared/ui';

import { initialsOf } from './model';

type AvatarProps = {
  name: string;
  /** The User's avatarUrl, an API path, or a picked file's local URI; null shows their initials. */
  source: { path: string; token: string } | { uri: string } | null;
  size?: number;
};

/** A User's avatar, or their initials in a circle without one. It's only served to its owner, so it loads with the login token. */
export function Avatar({ name, source, size = 88 }: AvatarProps) {
  const styles = useStyles();
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (source) {
    const uri =
      'path' in source
        ? { uri: apiUrl(source.path), headers: { Authorization: `Bearer ${source.token}` } }
        : { uri: source.uri };
    return (
      <Image
        accessible
        accessibilityRole="image"
        accessibilityLabel="Avatar"
        source={uri}
        style={round}
        resizeMode="cover"
      />
    );
  }
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Avatar" style={[styles.initials, round]}>
      <Text style={[styles.initialsText, { fontSize: size * 0.38 }]}>{initialsOf(name)}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  initials: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySubtle },
  initialsText: { fontWeight: '700', color: colors.primary },
}));
