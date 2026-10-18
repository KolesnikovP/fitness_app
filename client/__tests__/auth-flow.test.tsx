import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { fakeApi } from './support/fake-api';
import { secureStore } from './support/secure-store';

const TOKEN_KEY = 'auth-token';
const PASSWORD = 'correct-horse-battery';

/** Renders the real app (every route in src/app), as on a cold launch. */
function launchApp() {
  return renderRouter('./src/app', { initialUrl: '/' });
}

async function fillCredentials(email: string, password: string) {
  await fireEvent.changeText(await screen.findByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
}

describe('auth flow', () => {
  it('signs up, picks a unit, and lands on the tab shell', async () => {
    await launchApp();

    await fireEvent.press(await screen.findByRole('button', { name: 'Create an account' }));
    expect(await screen.findByRole('header', { name: 'Create account' })).toBeVisible();

    await fillCredentials('new@example.com', PASSWORD);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign up' }));

    expect(await screen.findByRole('header', { name: 'Pick your units' })).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Kilograms' }));

    expect(await screen.findByRole('header', { name: 'Feed' })).toBeVisible();
    expect(fakeApi.findAccount('new@example.com')?.unitPreference).toBe('kg');
    expect(secureStore.get(TOKEN_KEY)).toBeTruthy();
    // Authenticated requests carry the stored token.
    expect(fakeApi.authHeaders).toContain(`Bearer ${secureStore.get(TOKEN_KEY)}`);
  });

  it('logs in an onboarded user straight to the tab shell', async () => {
    fakeApi.addAccount('lifter@example.com', PASSWORD, 'lb');
    await launchApp();

    await fillCredentials('lifter@example.com', PASSWORD);
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('header', { name: 'Feed' })).toBeVisible();
    expect(screen.queryByRole('header', { name: 'Pick your units' })).toBeNull();
  });

  it('sends a user who never picked a unit to onboarding after logging in', async () => {
    fakeApi.addAccount('halfway@example.com', PASSWORD, null);
    await launchApp();

    await fillCredentials('halfway@example.com', PASSWORD);
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('header', { name: 'Pick your units' })).toBeVisible();
  });

  it('shows the API error for a wrong password and stays on log in', async () => {
    fakeApi.addAccount('lifter@example.com', PASSWORD, 'kg');
    await launchApp();

    await fillCredentials('lifter@example.com', 'wrong-password');
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    expect(screen.getByRole('header', { name: 'Log in' })).toBeVisible();
    expect(secureStore.has(TOKEN_KEY)).toBe(false);
  });

  it('shows the API error when the email is already taken', async () => {
    fakeApi.addAccount('taken@example.com', PASSWORD, 'kg');
    await launchApp();

    await fireEvent.press(await screen.findByRole('button', { name: 'Create an account' }));
    await fillCredentials('taken@example.com', PASSWORD);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign up' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists.');
  });
});

describe('stored login', () => {
  it('restores a stored login on launch without asking to log in', async () => {
    const account = fakeApi.addAccount('lifter@example.com', PASSWORD, 'kg');
    secureStore.set(TOKEN_KEY, fakeApi.issueToken(account.id));

    await launchApp();

    expect(await screen.findByRole('header', { name: 'Feed' })).toBeVisible();
    expect(screen.queryByRole('header', { name: 'Log in' })).toBeNull();
  });

  it('drops a token the API rejects and shows log in', async () => {
    secureStore.set(TOKEN_KEY, 'expired-token');

    await launchApp();

    expect(await screen.findByRole('header', { name: 'Log in' })).toBeVisible();
    expect(secureStore.has(TOKEN_KEY)).toBe(false);
  });

  it('logs out from the profile tab, clearing the token', async () => {
    const account = fakeApi.addAccount('lifter@example.com', PASSWORD, 'kg');
    secureStore.set(TOKEN_KEY, fakeApi.issueToken(account.id));
    await launchApp();
    await screen.findByRole('header', { name: 'Feed' });

    // The native tab bar isn't rendered in Jest, so switch tabs the way a
    // tab press does: by navigating.
    await act(async () => router.navigate('/profile'));
    expect(await screen.findByText('lifter@example.com')).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('header', { name: 'Log in' })).toBeVisible();
    expect(secureStore.has(TOKEN_KEY)).toBe(false);
  });
});
