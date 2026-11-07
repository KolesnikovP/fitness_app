import { Pressable, StyleSheet, Text, View } from 'react-native';

import { countOf, formatDuration, formatSessionDate, formatVolume } from '@/entities/workout/@x/post';
import { makeStyles, spacing } from '@/shared/ui';

import type { PostSummary } from './model';
import { PostPhoto } from './PostPhoto';

/** How many of a Session's Exercises a card names before "and N more". */
const EXERCISES_SHOWN = 3;

type PostCardProps = { post: PostSummary; token: string; onPress: () => void };

/**
 * One Post on a Profile, to read at a glance: its cover (the Progress photo,
 * or its Volume without one), the Session name and date, duration, Volume,
 * Personal records and its first few Exercises.
 */
export function PostCard({ post, token, onPress }: PostCardProps) {
  const styles = useStyles();
  const { session } = post;
  const date = formatSessionDate(session.finishedAt);
  const volume = formatVolume(session.stats.volume, session.stats.volumeUnit);
  const shown = session.exerciseNames.slice(0, EXERCISES_SHOWN);
  const more = session.exerciseNames.length - shown.length;
  const records = session.personalRecords.length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${session.name}, ${date}: ${session.exerciseNames.join(', ')}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {post.photoUrl ? (
        <PostPhoto path={post.photoUrl} token={token} style={styles.cover} />
      ) : (
        <View accessibilityLabel="Stats cover" style={[styles.cover, styles.statsCover]}>
          <Text style={styles.coverVolume}>{volume}</Text>
          <Text style={styles.coverCaption}>{countOf(session.stats.setCount, 'set')}</Text>
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.name}>{session.name}</Text>
        <Text style={styles.muted}>{date}</Text>
        <Text style={styles.muted}>{`${formatDuration(session.stats.durationSeconds)} · ${volume}`}</Text>
        {records > 0 ? <Text style={styles.records}>{`🏆 ${countOf(records, 'personal record')}`}</Text> : null}
        <Text style={styles.exercises} numberOfLines={2}>
          {shown.join(', ')}
          {more > 0 ? ` and ${more} more` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const COVER = 96;

const useStyles = makeStyles((colors) => ({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.6 },
  // 4:5, like the Carousel the cover comes from.
  cover: { width: COVER, height: COVER * 1.25, borderRadius: 10 },
  statsCover: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySubtle,
    padding: spacing.xs,
  },
  coverVolume: { fontSize: 15, fontWeight: '700', color: colors.primary, textAlign: 'center' },
  coverCaption: { fontSize: 13, color: colors.muted },
  body: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
  records: { fontSize: 15, fontWeight: '600', color: colors.primary },
  exercises: { fontSize: 15, color: colors.text },
}));
