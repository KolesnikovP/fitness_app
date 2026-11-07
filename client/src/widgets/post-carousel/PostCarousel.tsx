import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library';
import { useRef, useState } from 'react';
import { Linking, PixelRatio, ScrollView, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { useAuth } from '@/entities/auth';
import type { Post } from '@/entities/post';
import { countOf } from '@/entities/workout';
import { Button, makeStyles, spacing } from '@/shared/ui';

import { CarouselImageView, SAVED_HEIGHT, SAVED_WIDTH } from './CarouselImageView';
import { carouselImages } from './model';

/**
 * A Post's Carousel: its 4:5 images side by side, and "Save to Photos", which
 * saves them in order, copies the caption, then offers to open Instagram.
 * Images already saved don't change when the Post does (ADR 0007).
 */
export function PostCarousel({ post }: { post: Post }) {
  const styles = useStyles();
  const { state } = useAuth();
  const views = useRef<(View | null)[]>([]);
  // The photo URL whose cover has loaded; a new photo has a new URL, so it's waited for again.
  const [settledPhoto, setSettledPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (state.status !== 'signedIn') return null;
  const images = carouselImages(post);
  const coverReady = post.photoUrl === null || settledPhoto === post.photoUrl;

  async function save() {
    setError(null);
    setSaved(null);
    setSaving(true);
    try {
      const { granted } = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
      if (!granted) {
        setError('Allow access to Photos in Settings to save the images.');
        return;
      }
      // captureRef takes the size in points; this makes it exactly 1080 × 1350 pixels.
      const size = { width: SAVED_WIDTH / PixelRatio.get(), height: SAVED_HEIGHT / PixelRatio.get() };
      for (const view of views.current.slice(0, images.length)) {
        if (!view) continue;
        const file = await captureRef(view, { format: 'png', result: 'tmpfile', ...size });
        await MediaLibrary.Asset.create(file);
      }
      const savedAll = `Saved ${countOf(images.length, 'image')} to Photos.`;
      if (post.caption) {
        await Clipboard.setStringAsync(post.caption);
        setSaved(`${savedAll} The caption is copied.`);
      } else {
        setSaved(savedAll);
      }
    } catch {
      setError("Couldn't save the images. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function openInstagram() {
    try {
      await Linking.openURL('instagram://app');
    } catch {
      await Linking.openURL('https://www.instagram.com/');
    }
  }

  return (
    <View style={styles.carousel}>
      <ScrollView horizontal accessibilityLabel="Carousel" contentContainerStyle={styles.images}>
        {images.map((image, i) => (
          <CarouselImageView
            key={i}
            ref={(view) => {
              views.current[i] = view;
            }}
            post={post}
            image={image}
            token={state.token}
            label={`Carousel image ${i + 1} of ${images.length}`}
            onPhotoSettled={() => setSettledPhoto(post.photoUrl)}
          />
        ))}
      </ScrollView>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {saved ? <Text style={styles.muted}>{saved}</Text> : null}
      <Button label="Save to Photos" onPress={save} loading={saving} disabled={!coverReady} />
      {saved ? <Button label="Open Instagram" variant="secondary" onPress={openInstagram} /> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  carousel: { gap: spacing.sm },
  images: { gap: spacing.sm },
  error: { color: colors.danger, fontSize: 15 },
  muted: { fontSize: 15, color: colors.muted },
}));
