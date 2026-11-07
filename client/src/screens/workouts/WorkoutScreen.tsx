import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { getPost, type Post } from '@/entities/post';
import {
  formatSessionDate,
  PersonalRecordList,
  SessionExerciseList,
  SessionStatsLine,
  sessionSummary,
} from '@/entities/workout';
import { PostCarousel } from '@/widgets/post-carousel';
import { errorMessage } from '@/shared/api';
import { makeStyles, Screen, spacing, Spinner } from '@/shared/ui';

/**
 * One finished workout, shaped like an Instagram post: its Carousel full
 * width with the action row under it (Edit, the dots, Copy and Save to
 * Photos), its name and caption (or a muted "Add a caption…" that opens Edit
 * workout), then every Exercise with every Set. It opens on top of whichever
 * tab it was opened from, and loads again on return from Edit workout.
 */
export function WorkoutScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const unit = state.status === 'signedIn' ? (state.me.unitPreference ?? 'kg') : 'kg';
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let current = true;
      getPost(token, id)
        .then((found) => current && setPost(found))
        .catch((e) => current && setError(errorMessage(e)));
      return () => {
        current = false;
      };
    }, [token, id]),
  );

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
  const edit = () => router.push({ pathname: '/edit-workout/[id]', params: { id: post.id } });

  async function copy() {
    await Clipboard.setStringAsync(sessionSummary(session, unit));
    setCopied(true);
  }

  return (
    <Screen>
      {/* Full width, past the screen's padding. */}
      <View style={styles.bleed}>
        <PostCarousel post={post} onEdit={edit} onCopy={copy} />
      </View>
      {copied ? <Text style={styles.muted}>Session summary copied.</Text> : null}
      <View style={styles.caption}>
        <Text accessibilityRole="header" style={styles.name}>
          {session.name}
        </Text>
        {post.caption ? (
          <Text style={styles.text}>{post.caption}</Text>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Add a caption…" onPress={edit}>
            <Text style={styles.muted}>Add a caption…</Text>
          </Pressable>
        )}
        <Text style={styles.muted}>{formatSessionDate(session.finishedAt ?? session.startedAt)}</Text>
      </View>
      <View accessibilityLabel="Workout detail" style={styles.detail}>
        {session.stats ? <SessionStatsLine stats={session.stats} /> : null}
        <PersonalRecordList records={session.personalRecords} />
        <SessionExerciseList exercises={session.exercises} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  error: { color: colors.danger, fontSize: 15 },
  bleed: { marginHorizontal: -spacing.lg, marginTop: -spacing.lg },
  caption: { gap: spacing.xs },
  name: { fontSize: 20, fontWeight: '700', color: colors.text },
  text: { fontSize: 16, lineHeight: 22, color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
  detail: { gap: spacing.md },
}));
