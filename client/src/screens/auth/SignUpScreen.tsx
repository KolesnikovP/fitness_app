import { router } from 'expo-router';

import { useSession } from '@/entities/session';
import { AuthForm } from '@/features/auth-by-email';
import { Button, Screen } from '@/shared/ui';

export function SignUpScreen() {
  const { signUp } = useSession();

  return (
    <Screen title="Create account">
      <AuthForm submitLabel="Sign up" onSubmit={signUp} passwordAutoComplete="new-password" />
      <Button label="I already have an account" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
