import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Appearance, useColorScheme } from 'react-native';

import { darkColors, lightColors } from '@/shared/ui';

import { phone, useFakeColorScheme } from './support/appearance';
import { fakeApi } from './support/fake-api';
import { findHeaderTitle, queryHeaderTitle } from './support/native-header';
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
  await screen.findByRole('header', { name: 'Workout' });
}

async function openSettings() {
  await act(async () => router.navigate('/profile/settings'));
  return findHeaderTitle('Settings');
}

describe('theme', () => {
  it("follows the phone's light or dark mode until the user picks one", async () => {
    phone.setScheme('dark');
    await launchSignedIn();
    expect(screen.getByRole('header', { name: 'Workout' })).toHaveStyle({ color: darkColors.text });

    await setPhoneScheme('light');
    expect(screen.getByRole('header', { name: 'Workout' })).toHaveStyle({ color: lightColors.text });

    await openSettings();
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
  });

  it("keeps the user's pick over the phone's mode, and saves it on the device", async () => {
    phone.setScheme('dark');
    await launchSignedIn();

    await openSettings();
    await fireEvent.press(screen.getByRole('radio', { name: 'Light' }));
    expect(queryHeaderTitle('Settings')?.titleColor).toBe(lightColors.text);
    expect(secureStore.get(THEME_KEY)).toBe('light');

    await setPhoneScheme('light');
    await setPhoneScheme('dark');
    expect(queryHeaderTitle('Settings')?.titleColor).toBe(lightColors.text);
  });

  it('launches in the theme the user picked, whatever mode the phone is in', async () => {
    phone.setScheme('light');
    secureStore.set(THEME_KEY, 'dark');
    await launchSignedIn();

    expect(screen.getByRole('header', { name: 'Workout' })).toHaveStyle({ color: darkColors.text });
    await openSettings();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });

  it('goes back to following the phone when System is picked', async () => {
    await launchSignedIn();

    await openSettings();
    await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
    expect(queryHeaderTitle('Settings')?.titleColor).toBe(darkColors.text);

    await fireEvent.press(screen.getByRole('radio', { name: 'System' }));
    expect(queryHeaderTitle('Settings')?.titleColor).toBe(lightColors.text);
    expect(secureStore.get(THEME_KEY)).toBe('system');
  });

  it("hands the user's pick to the phone, so its own dialogs match", async () => {
    const setColorScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
    await launchSignedIn();
    expect(setColorScheme).toHaveBeenLastCalledWith('unspecified');

    await openSettings();
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

/** WCAG 2's contrast ratio of two #RRGGBB colours, from 1 to 21. */
function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
])('the %s palette', (_, colors) => {
  // Text reads at 4.5:1 (WCAG AA). The tick on a logged set is an icon, which needs 3:1.
  const ICONS = ['success'];
  const fills = Object.keys(colors).filter((key) => `${key}Text` in colors) as (keyof typeof colors)[];
  const pairs: [string, string, string, number][] = [
    ...fills.map((fill): [string, string, string, number] => [
      `${fill}Text on ${fill}`,
      colors[`${fill}Text` as keyof typeof colors],
      colors[fill],
      ICONS.includes(fill) ? 3 : 4.5,
    ]),
    ['featureMuted on feature', colors.featureMuted, colors.feature, 4.5],
    ...(['text', 'muted', 'link'] as const).flatMap((ink): [string, string, string, number][] => [
      [`${ink} on background`, colors[ink], colors.background, 4.5],
      [`${ink} on card`, colors[ink], colors.card, 4.5],
    ]),
  ];

  it.each(pairs)('keeps %s readable', (_, ink, fill, minimum) => {
    expect(contrast(ink, fill)).toBeGreaterThanOrEqual(minimum);
  });
});
