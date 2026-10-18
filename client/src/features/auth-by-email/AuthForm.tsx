import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ApiError, NetworkError } from '@/shared/api';
import { Button, colors, TextField } from '@/shared/ui';

type AuthFormProps = {
  submitLabel: string;
  onSubmit: (email: string, password: string) => Promise<void>;
  /** "new-password" lets password managers suggest a strong password on sign-up. */
  passwordAutoComplete: 'password' | 'new-password';
};

/** Email + password form shared by sign-up and log-in. */
export function AuthForm({ submitLabel, onSubmit, passwordAutoComplete }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(email.trim(), password);
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(false);
    }
    // On success the session changes and this screen unmounts, so
    // `submitting` is intentionally left on.
  }

  return (
    <>
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete={passwordAutoComplete}
        textContentType={passwordAutoComplete === 'new-password' ? 'newPassword' : 'password'}
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button label={submitLabel} onPress={handleSubmit} loading={submitting} />
    </>
  );
}

function errorMessage(e: unknown): string {
  // The API's messages are written for people ("Email or password is incorrect.").
  if (e instanceof ApiError || e instanceof NetworkError) return e.message;
  return 'Something went wrong. Please try again.';
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 15 },
});
