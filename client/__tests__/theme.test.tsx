import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Appearance, useColorScheme } from 'react-native';

import { darkColors, lightColors } from '@/shared/ui';

import { phone, useFakeColorScheme } from './support/appearance';
import { fakeApi } from './support/fake-api';
import { secureStore } from './support/secure-store';

const TOKEN_KEY = 'auth-token';
const THEME_KEY = 'theme-preference';

beforeEach(() => {
  phone.setScheme('light');
  jest.mocked(useColorScheme).mockImplementation(useFakeColorScheme);
});

async function setPhoneScheme(scheme: 'light' | 'dark') {
  await act(async () => phone.setScheme(scheme));
}

async function launchSignedIn() {
  const account = fakeApi.addAccount('lifter@example.com', 'correct-horse-battery', 'kg');
  secureStore.set(TOKEN_KEY, fakeApi.issueToken(account.id));
  await renderRouter('./src/app', { initialUrl: '/' });
  await screen.findByRole('header', { name: 'Feed' });
}

async function openProfile() {
  await act(async () => router.navigate('/profile'));
  return screen.findByRole('header', { name: 'Profile' });
}

describe('theme', () => {
  it("follows the phone's light or dark mode until the user picks one", async () => {
    phone.setScheme('dark');
    await launchSignedIn();
    expect(screen.getByRole('header', { name: 'Feed' })).toHaveStyle({ color: darkColors.text });

    await setPhoneScheme('light');
    expect(screen.getByRole('header', { name: 'Feed' })).toHaveStyle({ color: lightColors.text });

    await openProfile();
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
  });

  it("keeps the user's pick over the phone's mode, and saves it on the device", async () => {
    phone.setScheme('dark');
    await launchSignedIn();

    await openProfile();
    await fireEvent.press(screen.getByRole('radio', { name: 'Light' }));
    expect(screen.getByRole('header', { name: 'Profile' })).toHaveStyle({ color: lightColors.text });
    expect(secureStore.get(THEME_KEY)).toBe('light');

    await setPhoneScheme('light');
    await setPhoneScheme('dark');
    expect(screen.getByRole('header', { name: 'Profile' })).toHaveStyle({ color: lightColors.text });
  });

  it('launches in the theme the user picked, whatever mode the phone is in', async () => {
    phone.setScheme('light');
    secureStore.set(THEME_KEY, 'dark');
    await launchSignedIn();

    expect(screen.getByRole('header', { name: 'Feed' })).toHaveStyle({ color: darkColors.text });
    await openProfile();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });

  it("goes back to following the phone when System is picked", async () => {
    await launchSignedIn();

    await openProfile();
    await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
    expect(screen.getByRole('header', { name: 'Profile' })).toHaveStyle({ color: darkColors.text });

    await fireEvent.press(screen.getByRole('radio', { name: 'System' }));
    expect(screen.getByRole('header', { name: 'Profile' })).toHaveStyle({ color: lightColors.text });
    expect(secureStore.get(THEME_KEY)).toBe('system');
  });

  it("hands the user's pick to the phone, so its own dialogs match", async () => {
    const setColorScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
    await launchSignedIn();
    expect(setColorScheme).toHaveBeenLastCalledWith('unspecified');

    await openProfile();
    await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
    expect(setColorScheme).toHaveBeenLastCalledWith('dark');

    await fireEvent.press(screen.getByRole('radio', { name: 'System' }));
    expect(setColorScheme).toHaveBeenLastCalledWith('unspecified');
    setColorScheme.mockRestore();
  });

  it('themes the log in screen too, before anyone signs in', async () => {
    phone.setScheme('dark');
    await renderRouter('./src/app', { initialUrl: '/' });
    expect(await screen.findByRole('header', { name: 'Log in' })).toHaveStyle({ color: darkColors.text });
  });
});
