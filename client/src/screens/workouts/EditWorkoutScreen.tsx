import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { getPost, type Post } from '@/entities/post';
import { useWorkoutDraft, WorkoutFields } from '@/features/edit-workout';
import { errorMessage } from '@/shared/api';
import { makeStyles, Screen, spacing, Spinner } from '@/shared/ui';

/**
 * Edit workout, full screen over the tab it's opened from: the Session name,
 * Progress photo and caption, all saved by the one Save in the top right.
 * Cancel throws the changes away.
 */
export function EditWorkoutScreen() {
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

  if (!post) {
    return (
      <Screen>
        <TopBar />
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
  return <EditWorkoutForm post={post} />;
}

function EditWorkoutForm({ post }: { post: Post }) {
  const draft = useWorkoutDraft(post);

  async function save() {
    if (await draft.save()) router.back();
  }

  return (
    <Screen>
      <TopBar onSave={save} saving={draft.saving} canSave={draft.changed && !draft.captionTooLong} />
      <WorkoutFields draft={draft} />
    </Screen>
  );
}

type TopBarProps = { onSave?: () => void; saving?: boolean; canSave?: boolean };

/** Cancel, the title, and Save in the top right. */
function TopBar({ onSave, saving = false, canSave = false }: TopBarProps) {
  const styles = useStyles();
  const saveDisabled = !onSave || !canSave || saving;
  return (
    <View style={styles.bar}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.barButton}>
        <Text style={styles.cancel}>Cancel</Text>
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>
        Edit workout
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: saveDisabled, busy: saving }}
        disabled={saveDisabled}
        onPress={onSave}
        style={[styles.barButton, styles.end, saveDisabled && styles.dimmed]}
      >
        <Text style={styles.save}>{saving ? 'Saving…' : 'Save'}</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  error: { color: colors.danger, fontSize: 15 },
  bar: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  barButton: { minHeight: 44, minWidth: 72, justifyContent: 'center' },
  end: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: colors.text },
  cancel: { fontSize: 17, color: colors.link },
  save: { fontSize: 17, fontWeight: '700', color: colors.link },
  dimmed: { opacity: 0.4 },
}));
