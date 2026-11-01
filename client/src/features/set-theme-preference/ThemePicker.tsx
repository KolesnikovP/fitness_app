import { ChipGroup, useTheme, type ThemePreference } from '@/shared/ui';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Light, dark, or whatever the phone is set to. Takes effect, and is saved on the device, as soon as it's tapped. */
export function ThemePicker() {
  const { preference, setPreference } = useTheme();
  return (
    <ChipGroup label="Theme" options={OPTIONS} value={preference} onChange={(next) => next && setPreference(next)} />
  );
}
