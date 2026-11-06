import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { getPost, PostPhoto, type Post } from '@/entities/post';
import { PersonalRecordList, saveSessionAsRoutine } from '@/entities/workout';
import { PostEditor } from '@/features/edit-post';
import { errorMessage } from '@/shared/api';
import { Button, makeStyles, Screen, spacing, TextField } from '@/shared/ui';

/**
 * Shown after finishing a Session: the Personal records it set, its Post's
 * caption and Progress photo to set, and for a Freeform session an offer to
 * save it as a Routine to repeat.
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
      {post ? (
        <View style={styles.post}>
          <PersonalRecordList records={post.session.personalRecords} />
          {post.photoUrl ? <PostPhoto path={post.photoUrl} token={signedInToken} style={styles.photo} /> : null}
          <PostEditor post={post} onChange={setPost} />
          <Button
            label="View post"
            variant="secondary"
            onPress={() => router.push({ pathname: '/posts/[id]', params: { id: sessionId } })}
          />
        </View>
      ) : null}
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

const useStyles = makeStyles((colors) => ({
  post: { gap: spacing.md },
  photo: { width: '100%', aspectRatio: 4 / 5, borderRadius: 12, backgroundColor: colors.card },
  error: { color: colors.danger, fontSize: 15 },
  muted: { fontSize: 17, color: colors.muted },
}));
