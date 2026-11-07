import { useState } from 'react';
import { Text } from 'react-native';

import { useAuth } from '@/entities/auth';
import type { UnitPreference } from '@/shared/model';
import { ChipGroup, makeStyles } from '@/shared/ui';

const OPTIONS: { value: UnitPreference; label: string }[] = [
  { value: 'kg', label: 'Kilograms' },
  { value: 'lb', label: 'Pounds' },
];

/** The Unit preference in settings, saved as soon as it's tapped. Every weight, Volume and record follows it. */
export function UnitSetting() {
  const styles = useStyles();
  const { state, setUnitPreference } = useAuth();
  const [error, setError] = useState<string | null>(null);
  if (state.status !== 'signedIn') return null;

  async function choose(unit: UnitPreference | null) {
    if (!unit) return;
    setError(null);
    try {
      await setUnitPreference(unit);
    } catch {
      setError("Couldn't save your choice. Please try again.");
    }
  }

  return (
    <>
      <ChipGroup label="Units" options={OPTIONS} value={state.me.unitPreference} onChange={choose} />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  error: { color: colors.danger, fontSize: 15 },
}));
