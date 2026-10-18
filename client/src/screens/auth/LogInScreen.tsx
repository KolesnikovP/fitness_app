import { router } from 'expo-router';

import { useSession } from '@/entities/session';
import { AuthForm } from '@/features/auth-by-email';
import { Button, Screen } from '@/shared/ui';

export function LogInScreen() {
  const { logIn } = useSession();

  return (
    <Screen title="Log in">
      <AuthForm submitLabel="Log in" onSubmit={logIn} passwordAutoComplete="password" />
      <Button label="Create an account" variant="secondary" onPress={() => router.push('/sign-up')} />
    </Screen>
  );
}
