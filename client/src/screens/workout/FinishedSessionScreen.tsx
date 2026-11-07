import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { getPost, type Post } from '@/entities/post';
import { PersonalRecordList, saveSessionAsRoutine } from '@/entities/workout';
import { useWorkoutDraft, WorkoutFields } from '@/features/edit-workout';
import { errorMessage } from '@/shared/api';
import { Button, makeStyles, Screen, spacing, TextField } from '@/shared/ui';

/**
 * Shown after finishing a Session: the Personal records it set, the Edit
 * workout form (name, Progress photo and caption) with its Save, a way to
 * view the workout, and for a Freeform session an offer to save it as a
 * Routine to repeat.
 */
export function FinishedSessionScreen() {
  const styles = useStyles();
  const { sessionId, freeform } = useLocalSearchParams<{ sessionId: string; freeform?: string }>();
  const { state } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [post, setPost] = useState<Post | null>(null);
  const token = state.status === 'signedIn' ? state.token : null;

  useEffect(() => {
    if (!token) return;
    let current = true;
    // The Post is a bonus here: without it the screen still works.
    getPost(token, sessionId)
      .then((found) => current && setPost(found))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [token, sessionId]);

  if (!token) return null;
  const signedInToken = token;

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await saveSessionAsRoutine(signedInToken, sessionId, name);
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <Screen title="Workout finished">
      {post ? <FinishedWorkoutForm post={post} onSaved={setPost} /> : null}
      {freeform !== 'false' ? (
        <>
          <Text style={styles.muted}>
            Save it as a routine to do it again, with the sets, reps and weights you just logged as targets.
          </Text>
          <TextField label="Routine name" placeholder="Push day" value={name} onChangeText={setName} maxLength={100} />
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <Button label="Save as routine" onPress={save} loading={saving} disabled={name.trim() === ''} />
        </>
      ) : null}
      <Button label="Done" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

/** The finished Session's records, then the Edit workout form with its Save, then View workout. */
function FinishedWorkoutForm({ post, onSaved }: { post: Post; onSaved: (post: Post) => void }) {
  const styles = useStyles();
  const draft = useWorkoutDraft(post);

  async function save() {
    const saved = await draft.save();
    if (saved) onSaved(saved);
  }

  return (
    <View style={styles.post}>
      <PersonalRecordList records={post.session.personalRecords} />
      <WorkoutFields draft={draft} />
      <Button label="Save" onPress={save} loading={draft.saving} disabled={!draft.canSave} />
      <Button
        label="View workout"
        variant="secondary"
        onPress={() => router.push({ pathname: '/workout/workouts/[id]', params: { id: post.id } })}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  post: { gap: spacing.md },
  error: { color: colors.danger, fontSize: 15 },
  muted: { fontSize: 17, color: colors.muted },
}));
