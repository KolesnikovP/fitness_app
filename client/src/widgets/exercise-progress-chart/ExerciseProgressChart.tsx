import { matchFont } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { CartesianChart, Line, Scatter } from 'victory-native';

import {
  countOf,
  formatSessionDate,
  formatShortDate,
  formatVolume,
  getExerciseProgress,
  type ExerciseProgress,
  type ProgressPoint,
} from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import type { UnitPreference } from '@/shared/model';
import { ChipGroup, makeStyles, spacing, Spinner, useTheme, type ChipOption } from '@/shared/ui';

type MetricKey = 'estimated1RM' | 'heaviestWeight' | 'setVolume' | 'exerciseVolume' | 'totalReps';
type RangeKey = '3m' | '1y' | 'all';

type Metric = ChipOption<MetricKey> & {
  /** What each point is, under the chart. */
  caption: (unit: UnitPreference) => string;
  format: (value: number, unit: UnitPreference) => string;
};

type Range = ChipOption<RangeKey> & { months: number | null; phrase: string };

const asWeight = (value: number, unit: UnitPreference) => `${value} ${unit}`;
const inUnit = (what: string) => (unit: UnitPreference) => `${what} per workout, in ${unit}`;

// On screen these are Best 1RM and Session volume; the glossary's terms are
// Estimated 1RM and Exercise volume.
const METRICS: readonly Metric[] = [
  { value: 'estimated1RM', label: 'Best 1RM', caption: inUnit('Best Estimated 1RM'), format: asWeight },
  { value: 'heaviestWeight', label: 'Heaviest weight', caption: inUnit('Heaviest weight'), format: asWeight },
  { value: 'setVolume', label: 'Best set volume', caption: inUnit('Best Set volume'), format: formatVolume },
  {
    value: 'exerciseVolume',
    label: 'Session volume',
    caption: inUnit('Volume of this exercise'),
    format: formatVolume,
  },
  { value: 'totalReps', label: 'Total reps', caption: () => 'Reps per workout', format: (n) => countOf(n, 'rep') },
];

/** An Exercise only ever logged at weight 0 has only reps to chart. */
const REPS_ONLY = METRICS.filter((m) => m.value === 'totalReps');

const RANGES: readonly Range[] = [
  { value: '3m', label: '3 months', months: 3, phrase: 'last 3 months' },
  { value: '1y', label: '1 year', months: 12, phrase: 'last year' },
  { value: 'all', label: 'All time', months: null, phrase: 'all time' },
];

const font = matchFont({ fontFamily: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }), fontSize: 11 });

/** The same day `months` before `now`, or the last day of that month if it's shorter. */
function monthsBefore(now: Date, months: number) {
  const year = now.getFullYear();
  const month = now.getMonth() - months;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(now.getDate(), lastDay));
}

/** The Sessions finished within the range, up to now. */
function sessionsIn(range: Range, sessions: ProgressPoint[], now: Date) {
  if (range.months === null) return sessions;
  const from = monthsBefore(now, range.months).getTime();
  return sessions.filter((s) => Date.parse(s.finishedAt) >= from);
}

/**
 * The chart in words, for screen readers: "Estimated 1RM, last 3 months, 2
 * workouts: Mon, Oct 6: 126.7 kg, Personal record; Tue, Nov 4: 121 kg".
 */
function chartDescription(metric: Metric, range: Range, points: ProgressPoint[], unit: UnitPreference) {
  const pointDescriptions = points.map(
    (p) =>
      `${formatSessionDate(p.finishedAt)}: ${metric.format(p[metric.value], unit)}${p.personalRecord ? ', Personal record' : ''}`,
  );
  return `${metric.label}, ${range.phrase}, ${countOf(points.length, 'workout')}: ${pointDescriptions.join('; ')}`;
}

/**
 * The User's progress at an Exercise: a point per finished Session, by the
 * metric chosen (best Estimated 1RM, heaviest weight, best Set volume,
 * Exercise volume or total reps) over a range, marking the Sessions that set a
 * Personal record. In the User's Unit preference. An Exercise only ever logged
 * at weight 0 charts only its reps.
 */
export function ExerciseProgressChart({ token, exerciseId }: { token: string; exerciseId: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [progress, setProgress] = useState<ExerciseProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState<MetricKey>('estimated1RM');
  const [rangeKey, setRangeKey] = useState<RangeKey>('3m');
  const metrics = progress?.sessions.every((s) => s.heaviestWeight === 0) ? REPS_ONLY : METRICS;
  const metric = metrics.find((m) => m.value === metricKey) ?? metrics[0];
  const range = RANGES.find((r) => r.value === rangeKey)!;

  useEffect(() => {
    let current = true;
    getExerciseProgress(token, exerciseId)
      .then((found) => current && setProgress(found))
      .catch((e) => current && setError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [token, exerciseId]);

  const points = useMemo(() => (progress ? sessionsIn(range, progress.sessions, new Date()) : []), [progress, range]);
  const data = useMemo(
    () => points.map((p) => ({ x: Date.parse(p.finishedAt), y: p[metric.value] })),
    [points, metric],
  );

  let body;
  if (error) {
    body = (
      <Text accessibilityRole="alert" style={styles.error}>
        {error}
      </Text>
    );
  } else if (!progress) {
    body = <Spinner />;
  } else if (progress.sessions.length === 0) {
    body = <Text style={styles.muted}>No sets of this exercise yet.</Text>;
  } else {
    body = (
      <>
        <ChipGroup label="Metric" options={metrics} value={metric.value} onChange={(m) => m && setMetricKey(m)} />
        <ChipGroup label="Range" options={RANGES} value={rangeKey} onChange={(r) => r && setRangeKey(r)} />
        {points.length === 0 ? (
          <Text style={styles.muted}>No workouts in the {range.phrase}.</Text>
        ) : (
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={chartDescription(metric, range, points, progress.unit)}
            style={styles.chart}
          >
            <CartesianChart
              data={data}
              xKey="x"
              yKeys={['y']}
              padding={{ left: 4, bottom: 4 }}
              domainPadding={{ left: 16, right: 16, top: 16, bottom: 8 }}
              xAxis={{
                font,
                tickCount: Math.min(points.length, 4),
                labelColor: colors.muted,
                lineColor: colors.border,
                formatXLabel: formatShortDate,
              }}
              yAxis={[
                {
                  font,
                  tickCount: 4,
                  labelColor: colors.muted,
                  lineColor: colors.border,
                  formatYLabel: (y) => `${Math.round(y)}`,
                },
              ]}
            >
              {({ points: plotted }) => (
                <>
                  <Line points={plotted.y} color={colors.text} strokeWidth={2} curveType="linear" />
                  <Scatter points={plotted.y} radius={3} color={colors.text} />
                  <Scatter
                    points={plotted.y.filter((_, i) => points[i]?.personalRecord)}
                    radius={6}
                    color={colors.link}
                  />
                </>
              )}
            </CartesianChart>
          </View>
        )}
        <Text style={styles.muted}>
          {metric.caption(progress.unit)}. Larger points mark a workout that set a Personal record.
        </Text>
      </>
    );
  }
  return (
    <View accessibilityLabel="Progress" style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        Progress
      </Text>
      {body}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.md, gap: spacing.sm },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  chart: { height: 220 },
  muted: { fontSize: 13, color: colors.muted },
  error: { color: colors.danger, fontSize: 15 },
}));
