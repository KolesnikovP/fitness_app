import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import type { Me } from '@/entities/user';
import { ProfileFields, useProfileDraft } from '@/features/edit-profile';
import { makeStyles, Screen, spacing } from '@/shared/ui';

/** Edit profile: the User's name and avatar, saved by the one Save in the top right. Cancel throws the changes away. */
export function EditProfileScreen() {
  const { state } = useAuth();
  if (state.status !== 'signedIn') return null;
  return <EditProfileForm me={state.me} />;
}

function EditProfileForm({ me }: { me: Me }) {
  const styles = useStyles();
  const draft = useProfileDraft(me);
  const saveDisabled = !draft.canSave;

  async function save() {
    if (await draft.save()) router.back();
  }

  return (
    <Screen>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.barButton}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          Edit profile
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saveDisabled, busy: draft.saving }}
          disabled={saveDisabled}
          onPress={save}
          style={[styles.barButton, styles.end, saveDisabled && styles.dimmed]}
        >
          <Text style={styles.save}>{draft.saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
      <ProfileFields draft={draft} />
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  bar: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  barButton: { minHeight: 44, minWidth: 72, justifyContent: 'center' },
  end: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: colors.text },
  cancel: { fontSize: 17, color: colors.link },
  save: { fontSize: 17, fontWeight: '700', color: colors.link },
  dimmed: { opacity: 0.4 },
}));
