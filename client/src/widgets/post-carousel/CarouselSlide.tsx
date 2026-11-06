import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PostPhoto, type Post } from '@/entities/post';
import {
  countOf,
  formatDuration,
  formatPersonalRecord,
  formatSessionDate,
  formatSet,
  formatVolume,
  workoutName,
} from '@/entities/workout';
import { darkColors, spacing } from '@/shared/ui';
import { listNames } from '@/shared/utils';

import { MAX_SETS_SHOWN, type CarouselPage } from './model';

/** A slide's size on screen. Saved, it's scaled to 1080 × 1350, Instagram's 4:5. */
export const SLIDE_WIDTH = 300;
export const SLIDE_HEIGHT = (SLIDE_WIDTH * 5) / 4;

/**
 * Saved images look the same whatever the phone's theme: always the dark
 * palette, charcoal with gold.
 */
const colors = darkColors;

type CarouselSlideProps = {
  post: Post;
  page: CarouselPage;
  token: string;
  /** "Carousel image 2 of 5" */
  label: string;
};

/** One 4:5 image of a Carousel, with the app mark in its corner. */
export const CarouselSlide = forwardRef<View, CarouselSlideProps>(function CarouselSlide(
  { post, page, token, label },
  ref,
) {
  return (
    // collapsable={false} keeps the view on Android, so it can be captured.
    <View ref={ref} collapsable={false} accessible accessibilityLabel={label} style={styles.slide}>
      <PageContent post={post} page={page} token={token} />
      <Text style={styles.mark}>FITNESS</Text>
    </View>
  );
});

function PageContent({ post, page, token }: { post: Post; page: CarouselPage; token: string }) {
  const { session } = post;
  const date = formatSessionDate(session.finishedAt ?? session.startedAt);
  const title = workoutName(session);

  switch (page.kind) {
    case 'cover':
      if (post.photoUrl) {
        return (
          <>
            <PostPhoto path={post.photoUrl} token={token} accessible={false} style={StyleSheet.absoluteFill} />
            <View style={styles.coverBand}>
              <Text style={styles.muted}>{date}</Text>
              <Text style={styles.title}>{title}</Text>
            </View>
          </>
        );
      }
      return (
        <View style={styles.body}>
          <Text style={styles.muted}>{date}</Text>
          <Text style={styles.title}>{title}</Text>
          {session.stats ? (
            <Text style={styles.big}>{formatVolume(session.stats.volume, session.stats.volumeUnit)}</Text>
          ) : null}
          <Text style={styles.text}>{listNames(exerciseNames(post))}</Text>
        </View>
      );

    case 'stats': {
      const stats = session.stats;
      if (!stats) return null;
      const rows: [string, string][] = [
        ['Duration', formatDuration(stats.durationSeconds)],
        ['Volume', formatVolume(stats.volume, stats.volumeUnit)],
        ['Exercises', String(stats.exerciseCount)],
        ['Sets', String(stats.setCount)],
      ];
      return (
        <View style={styles.body}>
          <Text style={styles.heading}>{title}</Text>
          {rows.map(([name, value]) => (
            <View key={name} style={styles.stat}>
              <Text style={styles.muted}>{name}</Text>
              <Text style={styles.big}>{value}</Text>
            </View>
          ))}
        </View>
      );
    }

    case 'records':
      return (
        <View style={styles.body}>
          <Text style={styles.heading}>{countOf(session.personalRecords.length, 'personal record')}</Text>
          {session.personalRecords.map((record) => (
            <Text key={`${record.setId}/${record.kind}`} style={styles.text}>
              {formatPersonalRecord(record)}
            </Text>
          ))}
        </View>
      );

    case 'exercises':
      return (
        <View style={styles.body}>
          {page.runs.map((run) => {
            const hidden = run.sets.length - MAX_SETS_SHOWN;
            return (
              <View key={run.sets[0].set.id} style={styles.run}>
                <Text style={styles.name}>{run.name}</Text>
                {run.sets.slice(0, MAX_SETS_SHOWN).map(({ set }) => (
                  <Text key={set.id} style={styles.set}>
                    {formatSet(set)}
                  </Text>
                ))}
                {hidden > 0 ? <Text style={styles.muted}>and {countOf(hidden, 'more set')}</Text> : null}
              </View>
            );
          })}
        </View>
      );
  }
}

/** The names of the Exercises done in post's Session, in order, each once. */
function exerciseNames(post: Post): string[] {
  const names = post.session.exercises.flatMap((e) => e.sets.map((s) => s.name));
  return [...new Set(names)];
}

const styles = StyleSheet.create({
  slide: {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    backgroundColor: colors.background,
    borderRadius: 4,
    overflow: 'hidden',
  },
  body: { flex: 1, padding: spacing.lg, gap: spacing.sm, justifyContent: 'center' },
  coverBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: 'rgba(28, 28, 28, 0.7)',
    gap: 2,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  heading: { fontSize: 20, fontWeight: '800', color: colors.primary, marginBottom: spacing.xs },
  big: { fontSize: 28, fontWeight: '800', color: colors.primary },
  stat: { gap: 0 },
  run: { gap: 1 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  set: { fontSize: 13, color: colors.text },
  text: { fontSize: 14, color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  mark: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: colors.primary,
  },
});
