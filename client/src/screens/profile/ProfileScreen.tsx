import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { listPosts, PostCard, type PostSummary } from '@/entities/post';
import { Avatar, getProfileCounts, type ProfileCounts } from '@/entities/user';
import { countOf, formatSessionDate, getExerciseBests, type ExerciseBest } from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { Button, makeStyles, Screen, spacing, Spinner } from '@/shared/ui';

type Loaded = { counts: ProfileCounts; posts: PostSummary[]; bests: ExerciseBest[] };
type Section = 'workouts' | 'progress';

/**
 * The Profile tab: the User's avatar, name and counts, then their Posts
 * (Workouts) or their all-time Personal records (Progress).
 */
export function ProfileScreen() {
  const styles = useStyles();
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('workouts');

  // Reload on focus, so a workout finished on the Workout tab shows here.
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let current = true;
      Promise.all([getProfileCounts(token), listPosts(token), getExerciseBests(token)])
        .then(([counts, posts, bests]) => {
          if (!current) return;
          setLoaded({ counts, posts, bests });
          setError(null);
        })
        .catch((e) => current && setError(errorMessage(e)));
      return () => {
        current = false;
      };
    }, [token]),
  );

  if (state.status !== 'signedIn') return null;
  const { me } = state;

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text accessibilityRole="header" style={styles.title}>
          Profile
        </Text>
        <Button label="Settings" variant="link" onPress={() => router.push('/profile/settings')} />
      </View>
      <View style={styles.header}>
        <Avatar name={me.name} source={me.avatarUrl ? { path: me.avatarUrl, token: state.token } : null} />
        <View style={styles.identity}>
          <Text style={styles.name}>{me.name}</Text>
          {loaded ? <Counts counts={loaded.counts} /> : null}
        </View>
      </View>
      <Button label="Edit profile" variant="secondary" onPress={() => router.push('/profile/edit')} />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <View accessibilityRole="tablist" style={styles.tabs}>
        {(['workouts', 'progress'] as const).map((s) => (
          <Pressable
            key={s}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === s }}
            onPress={() => setSection(s)}
            style={[styles.tab, section === s && styles.tabSelected]}
          >
            <Text style={[styles.tabLabel, section === s && styles.tabLabelSelected]}>
              {s === 'workouts' ? 'Workouts' : 'Progress'}
            </Text>
          </Pressable>
        ))}
      </View>
      {loaded === null ? (
        error ? null : (
          <Spinner />
        )
      ) : section === 'workouts' ? (
        <View accessibilityLabel="Workouts">
          {loaded.posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              token={state.token}
              onPress={() => router.push({ pathname: '/profile/workouts/[id]', params: { id: post.id } })}
            />
          ))}
          {loaded.posts.length === 0 ? <Text style={styles.muted}>No finished workouts yet.</Text> : null}
        </View>
      ) : (
        <View accessibilityLabel="Records by exercise">
          {loaded.bests.map((exercise) => (
            <ExerciseBestRow key={exercise.exerciseId} exercise={exercise} />
          ))}
          {loaded.bests.length === 0 ? (
            <Text style={styles.muted}>Log a set with weight to see your records here.</Text>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

/** Finished workouts, Personal records and the Streak, side by side. */
function Counts({ counts }: { counts: ProfileCounts }) {
  const styles = useStyles();
  const items = [
    { value: counts.workouts, label: 'Workouts', spoken: countOf(counts.workouts, 'workout') },
    { value: counts.personalRecords, label: 'Records', spoken: countOf(counts.personalRecords, 'personal record') },
    { value: counts.streak, label: 'Week streak', spoken: `${countOf(counts.streak, 'week')} streak` },
  ];
  return (
    <View style={styles.counts}>
      {items.map((item) => (
        <View key={item.label} accessible accessibilityLabel={item.spoken} style={styles.count}>
          <Text style={styles.countValue}>{item.value}</Text>
          <Text style={styles.countLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** One Exercise's best Estimated 1RM and when it was set; opens its progress chart. */
function ExerciseBestRow({ exercise }: { exercise: ExerciseBest }) {
  const styles = useStyles();
  const { best } = exercise;
  const value = `${best.estimated1RM} ${best.estimated1RMUnit}`;
  const date = formatSessionDate(best.achievedAt);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${exercise.name}: Estimated 1RM ${value}, ${date}`}
      onPress={() => router.push({ pathname: '/profile/exercises/[id]', params: { id: exercise.exerciseId } })}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.grow}>
        <Text style={styles.rowName}>{exercise.name}</Text>
        <Text style={styles.muted}>{`${best.weight} ${best.weightUnit} × ${best.reps} · ${date}`}</Text>
      </View>
      <Text style={styles.rowValue}>{value}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 32, fontWeight: '700', color: colors.text },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  identity: { flex: 1, gap: spacing.sm },
  name: { fontSize: 22, fontWeight: '700', color: colors.text },
  counts: { flexDirection: 'row', gap: spacing.lg },
  count: { alignItems: 'flex-start' },
  countValue: { fontSize: 19, fontWeight: '700', color: colors.text },
  countLabel: { fontSize: 13, color: colors.muted },
  error: { color: colors.danger, fontSize: 15 },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabSelected: { borderBottomColor: colors.text },
  tabLabel: { fontSize: 17, color: colors.muted },
  tabLabelSelected: { fontWeight: '600', color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.6 },
  grow: { flex: 1 },
  rowName: { fontSize: 17, fontWeight: '600', color: colors.text },
  rowValue: { fontSize: 17, fontWeight: '700', color: colors.text },
}));
