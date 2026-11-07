import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { getPost, PostPhoto, type Post } from '@/entities/post';
import { formatSessionDate, PersonalRecordList, SessionStatsLine, workoutName } from '@/entities/workout';
import { PostEditor } from '@/features/edit-post';
import { PostCarousel } from '@/widgets/post-carousel';
import { errorMessage } from '@/shared/api';
import { makeStyles, Screen, spacing, Spinner } from '@/shared/ui';

/**
 * A finished Session's Post: its Progress photo, caption, stats and Personal
 * records as they are now, with the caption and photo editable, then its
 * Carousel to save for Instagram.
 */
export function PostScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let current = true;
    getPost(token, id)
      .then((found) => current && setPost(found))
      .catch((e) => current && setError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [token, id]);

  if (!post || !token) {
    return (
      <Screen>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : (
          <Spinner />
        )}
      </Screen>
    );
  }

  const { session } = post;
  return (
    <Screen title={workoutName(session)}>
      <View accessibilityLabel="Post" style={styles.post}>
        {post.photoUrl ? <PostPhoto path={post.photoUrl} token={token} style={styles.photo} /> : null}
        {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
        <Text style={styles.muted}>{formatSessionDate(session.finishedAt ?? session.startedAt)}</Text>
        {session.stats ? <SessionStatsLine stats={session.stats} /> : null}
        <PersonalRecordList records={session.personalRecords} />
      </View>
      <PostEditor post={post} onChange={setPost} />
      <Text accessibilityRole="header" style={styles.heading}>
        Instagram carousel
      </Text>
      <PostCarousel post={post} />
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  error: { color: colors.danger, fontSize: 15 },
  post: { gap: spacing.sm },
  photo: { width: '100%', aspectRatio: 4 / 5, borderRadius: 12, backgroundColor: colors.card },
  caption: { fontSize: 17, color: colors.text },
  heading: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  muted: { fontSize: 15, color: colors.muted },
}));
