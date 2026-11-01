import { Text } from 'react-native';

import { makeStyles, Screen } from '@/shared/ui';

function PlaceholderTabScreen({ title, comingIn }: { title: string; comingIn: string }) {
  const styles = useStyles();
  return (
    <Screen title={title}>
      <Text style={styles.body}>Coming in {comingIn}.</Text>
    </Screen>
  );
}

export const FeedScreen = () => <PlaceholderTabScreen title="Feed" comingIn="#9" />;

const useStyles = makeStyles((colors) => ({
  body: { fontSize: 17, color: colors.muted },
}));
