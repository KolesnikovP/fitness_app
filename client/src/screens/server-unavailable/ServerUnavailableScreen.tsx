import { useState } from 'react';
import { Text } from 'react-native';

import { useAuth } from '@/entities/auth';
import { Button, makeStyles, Screen } from '@/shared/ui';

/** Shown on launch when a login is stored but the server can't be reached. */
export function ServerUnavailableScreen() {
  const styles = useStyles();
  const { retry } = useAuth();
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    await retry();
    setRetrying(false);
  }

  return (
    <Screen title="Can't connect" centered>
      <Text style={styles.body}>Check your internet connection and try again.</Text>
      <Button label="Try again" onPress={handleRetry} loading={retrying} />
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  body: { fontSize: 17, color: colors.muted },
}));
