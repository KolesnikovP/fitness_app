import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { makeStyles, spacing } from '@/shared/ui';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** "2026-11-2": a day in the device's time zone. */
function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** The month's days in weeks from Monday, with null for the days of the months around it. */
function monthWeeks(year: number, month: number): (Date | null)[][] {
  const leading = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: days }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/**
 * A month of days, marking those the User finished a Session on (each of
 * finishedAt, in the device's time zone). Opens on this month; pages back,
 * and forward again up to this month.
 */
export function TrainingCalendar({ finishedAt, now = new Date() }: { finishedAt: string[]; now?: Date }) {
  const styles = useStyles();
  const [monthsBack, setMonthsBack] = useState(0);
  const shown = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const trained = new Set(finishedAt.map((iso) => dayKey(new Date(iso))));
  const today = dayKey(now);

  return (
    <View accessibilityLabel="Training calendar" style={styles.calendar}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={spacing.sm}
          onPress={() => setMonthsBack((n) => n + 1)}
        >
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Text style={styles.month}>
          {shown.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: monthsBack === 0 }}
          disabled={monthsBack === 0}
          hitSlop={spacing.sm}
          onPress={() => setMonthsBack((n) => n - 1)}
        >
          <Text style={[styles.arrow, monthsBack === 0 && styles.hidden]}>›</Text>
        </Pressable>
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={[styles.cell, styles.weekday]}>
            {d}
          </Text>
        ))}
      </View>
      {monthWeeks(shown.getFullYear(), shown.getMonth()).map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((day, i) => {
            if (!day) return <View key={i} style={styles.cell} />;
            const key = dayKey(day);
            const done = trained.has(key);
            const label = day.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
            return (
              <View
                key={i}
                accessibilityLabel={done ? `${label}, trained` : label}
                style={[styles.cell, done && styles.trained, key === today && !done && styles.today]}
              >
                <Text style={[styles.day, done && styles.trainedText]}>{day.getDate()}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  calendar: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.md, gap: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  arrow: { fontSize: 28, lineHeight: 30, color: colors.text, paddingHorizontal: spacing.sm },
  hidden: { opacity: 0 },
  month: { fontSize: 17, fontWeight: '700', color: colors.text },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  weekday: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 36 },
  day: { fontSize: 15, color: colors.text },
  trained: { backgroundColor: colors.primary },
  trainedText: { color: colors.primaryText, fontWeight: '700' },
  today: { borderWidth: 1, borderColor: colors.fieldBorder },
}));
