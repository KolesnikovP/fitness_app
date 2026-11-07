import { Image, type ImageStyle, type StyleProp } from 'react-native';

import { apiUrl } from '@/shared/api';

type PostPhotoProps = {
  /** The Post's photoUrl, an API path. */
  path: string;
  token: string;
  style?: StyleProp<ImageStyle>;
  /** Read as "Progress photo"; false for a photo that's only decoration, as on a Carousel cover. */
  accessible?: boolean;
  onLoad?: () => void;
  onError?: () => void;
  testID?: string;
};

/** A Post's Progress photo. It's only served to its owner, so it loads with the login token. */
export function PostPhoto({ path, token, style, accessible = true, onLoad, onError, testID }: PostPhotoProps) {
  return (
    <Image
      accessible={accessible}
      accessibilityRole={accessible ? 'image' : undefined}
      accessibilityLabel={accessible ? 'Progress photo' : undefined}
      source={{ uri: apiUrl(path), headers: { Authorization: `Bearer ${token}` } }}
      style={style}
      resizeMode="cover"
      onLoad={onLoad}
      onError={onError}
      testID={testID}
    />
  );
}
