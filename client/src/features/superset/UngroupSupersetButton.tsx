import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useAuth } from '@/entities/auth';
import { ungroupSuperset, type Session } from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { Button, colors } from '@/shared/ui';

type UngroupSupersetButtonProps = {
  sessionId: string;
  supersetId: string;
  onUngrouped: (session: Session) => void;
};

/** Takes a Superset's exercises out of it. Sets already logged keep the Superset. */
export function UngroupSupersetButton({ sessionId, supersetId, onUngrouped }: UngroupSupersetButtonProps) {
  const { state } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (state.status !== 'signedIn') return null;
  const { token } = state;

  async function ungroup() {
    setError(null);
    setSaving(true);
    try {
      onUngrouped(await ungroupSuperset(token, sessionId, supersetId));
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Ungroup" variant="secondary" onPress={ungroup} loading={saving} />
    </>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 15 },
});
