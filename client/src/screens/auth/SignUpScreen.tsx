import { router } from 'expo-router';

import { useAuth } from '@/entities/auth';
import { AuthForm } from '@/features/auth-by-email';
import { Button, Screen } from '@/shared/ui';

export function SignUpScreen() {
  const { signUp } = useAuth();

  return (
    <Screen title="Create account">
      <AuthForm submitLabel="Sign up" onSubmit={signUp} passwordAutoComplete="new-password" />
      <Button label="I already have an account" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
