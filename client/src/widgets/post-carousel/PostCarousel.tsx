import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library';
import { useRef, useState } from 'react';
import { Linking, PixelRatio, ScrollView, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { useAuth } from '@/entities/auth';
import type { Post } from '@/entities/post';
import { countOf } from '@/entities/workout';
import { Button, makeStyles, spacing } from '@/shared/ui';

import { CarouselSlide } from './CarouselSlide';
import { carouselPages } from './model';

/** The size, in pixels, each image is saved at: Instagram's 4:5 portrait. */
const SAVED_WIDTH = 1080;
const SAVED_HEIGHT = 1350;

/**
 * A Post's Carousel: its 4:5 images side by side, and "Save to Photos", which
 * saves them in order, copies the caption, then offers to open Instagram.
 * Images already saved don't change when the Post does (ADR 0007).
 */
export function PostCarousel({ post }: { post: Post }) {
  const styles = useStyles();
  const { state } = useAuth();
  const slides = useRef<(View | null)[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (state.status !== 'signedIn') return null;
  const pages = carouselPages(post);

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
      for (const slide of slides.current.slice(0, pages.length)) {
        if (!slide) continue;
        const file = await captureRef(slide, { format: 'png', result: 'tmpfile', ...size });
        await MediaLibrary.Asset.create(file);
      }
      const images = `Saved ${countOf(pages.length, 'image')} to Photos.`;
      if (post.caption) {
        await Clipboard.setStringAsync(post.caption);
        setSaved(`${images} The caption is copied.`);
      } else {
        setSaved(images);
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
      <ScrollView horizontal accessibilityLabel="Carousel" contentContainerStyle={styles.slides}>
        {pages.map((page, i) => (
          <CarouselSlide
            key={i}
            ref={(view) => {
              slides.current[i] = view;
            }}
            post={post}
            page={page}
            token={state.token}
            label={`Carousel image ${i + 1} of ${pages.length}`}
          />
        ))}
      </ScrollView>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {saved ? <Text style={styles.muted}>{saved}</Text> : null}
      <Button label="Save to Photos" onPress={save} loading={saving} />
      {saved ? <Button label="Open Instagram" variant="secondary" onPress={openInstagram} /> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  carousel: { gap: spacing.sm },
  slides: { gap: spacing.sm },
  error: { color: colors.danger, fontSize: 15 },
  muted: { fontSize: 15, color: colors.muted },
}));
