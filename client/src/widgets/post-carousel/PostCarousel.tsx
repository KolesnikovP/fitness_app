import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library';
import { useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  PixelRatio,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { useAuth } from '@/entities/auth';
import type { Post } from '@/entities/post';
import { countOf } from '@/entities/workout';
import { Button, makeStyles, spacing, useTheme } from '@/shared/ui';

import { CarouselImageView, IMAGE_WIDTH, SAVED_HEIGHT, SAVED_WIDTH } from './CarouselImageView';
import { carouselImages } from './model';

type PostCarouselProps = {
  post: Post;
  /** How wide it is on screen: the screen's width, as an Instagram post is. */
  width?: number;
  /** Opens Edit workout. */
  onEdit: () => void;
  /** Copies the Session summary. */
  onCopy: () => void;
};

/**
 * A Post's Carousel, as the Post itself: its 4:5 images full width, one per
 * swipe, then an action row: Edit on the left, dots for the image shown in
 * the middle, Copy and Save to Photos on the right. Saving puts the images in
 * Photos in order at 1080 × 1350, copies the caption, then offers to open
 * Instagram. Images already saved don't change when the Post does.
 */
export function PostCarousel({ post, width: givenWidth, onEdit, onCopy }: PostCarouselProps) {
  const styles = useStyles();
  const { state } = useAuth();
  const window = useWindowDimensions();
  const width = givenWidth ?? window.width;
  const views = useRef<(View | null)[]>([]);
  const [index, setIndex] = useState(0);
  // The photo URL whose cover has loaded; a new photo has a new URL, so it's waited for again.
  const [settledPhoto, setSettledPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (state.status !== 'signedIn') return null;
  const images = carouselImages(post);
  const shown = Math.min(index, images.length - 1);
  const coverReady = post.photoUrl === null || settledPhoto === post.photoUrl;

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.max(0, Math.round(event.nativeEvent.contentOffset.x / width)));
  }

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

  // Each image is drawn at IMAGE_WIDTH and scaled to fill the width, so it
  // looks the same on every phone and when saved.
  const scale = width / IMAGE_WIDTH;
  return (
    <View style={styles.carousel}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        accessibilityLabel="Carousel"
      >
        {images.map((image, i) => (
          <View
            key={i}
            // collapsable={false} keeps the view on Android, so it can be captured.
            collapsable={false}
            ref={(view) => {
              views.current[i] = view;
            }}
            style={{ width, height: (width * 5) / 4, overflow: 'hidden' }}
          >
            <View style={{ transformOrigin: 'top left', transform: [{ scale }] }}>
              <CarouselImageView
                post={post}
                image={image}
                token={state.token}
                label={`Carousel image ${i + 1} of ${images.length}`}
                onPhotoSettled={() => setSettledPhoto(post.photoUrl)}
              />
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.row}>
        <View style={styles.side}>
          <RowButton label="Edit workout" onPress={onEdit}>
            ✏️ Edit
          </RowButton>
        </View>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Image ${shown + 1} of ${images.length}`}
          style={styles.dots}
        >
          {images.map((_, i) => (
            <View key={i} style={[styles.dot, i === shown && styles.dotOn]} />
          ))}
        </View>
        <View style={[styles.side, styles.end]}>
          <RowButton label="Copy session summary" onPress={onCopy}>
            Copy
          </RowButton>
          <RowButton label="Save to Photos" onPress={save} busy={saving} disabled={!coverReady}>
            Save
          </RowButton>
        </View>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, styles.padded]}>
          {error}
        </Text>
      ) : null}
      {saved ? (
        <View style={styles.panel}>
          <Text style={styles.text}>{saved}</Text>
          <View style={styles.panelButtons}>
            <View style={styles.grow}>
              <Button label="Open Instagram" onPress={openInstagram} />
            </View>
            <Button label="Not now" variant="secondary" onPress={() => setSaved(null)} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

type RowButtonProps = {
  /** What a screen reader says it does. */
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  children: ReactNode;
};

/** A compact action of the action row, at least 44 points tall. */
function RowButton({ label, onPress, busy, disabled, children }: RowButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.rowButton, (pressed || inactive) && styles.dimmed]}
    >
      {busy ? <ActivityIndicator color={colors.text} /> : <Text style={styles.rowLabel}>{children}</Text>}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  carousel: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm },
  side: { flex: 1, flexDirection: 'row' },
  end: { justifyContent: 'flex-end' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.fieldBorder },
  dotOn: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  rowButton: { minHeight: 44, minWidth: 44, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  rowLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  dimmed: { opacity: 0.5 },
  padded: { paddingHorizontal: spacing.lg },
  panel: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.sm,
  },
  panelButtons: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
  error: { color: colors.danger, fontSize: 15 },
  text: { fontSize: 15, color: colors.text },
}));
