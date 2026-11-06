import { matchFont } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { CartesianChart, Line, Scatter } from 'victory-native';

import {
  formatSessionDate,
  formatVolume,
  getExerciseProgress,
  type ExerciseProgress,
  type ProgressPoint,
} from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { ChipGroup, makeStyles, spacing, Spinner, useTheme, type ChipOption } from '@/shared/ui';

type Metric = 'estimated1RM' | 'heaviestWeight' | 'volume';
type Range = '3m' | '1y' | 'all';

const METRICS: readonly ChipOption<Metric>[] = [
  { value: 'estimated1RM', label: 'Estimated 1RM' },
  { value: 'heaviestWeight', label: 'Heaviest weight' },
  { value: 'volume', label: 'Volume' },
];

const RANGES: readonly (ChipOption<Range> & { months: number | null; phrase: string })[] = [
  { value: '3m', label: '3 months', months: 3, phrase: 'last 3 months' },
  { value: '1y', label: '1 year', months: 12, phrase: 'last year' },
  { value: 'all', label: 'All time', months: null, phrase: 'all time' },
];

const font = matchFont({ fontFamily: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }), fontSize: 11 });

/** The finished Sessions in range, oldest first, given the date it ends now. */
function inRange(sessions: ProgressPoint[], range: Range, now: Date) {
  const { months } = RANGES.find((r) => r.value === range)!;
  if (months === null) return sessions;
  const from = new Date(now.getFullYear(), now.getMonth() - months, now.getDate()).getTime();
  return sessions.filter((s) => Date.parse(s.finishedAt) >= from);
}

/** "126.7 kg", or Volume as "1,026 kg". */
function formatValue(metric: Metric, value: number, unit: ExerciseProgress['unit']) {
  return metric === 'volume' ? formatVolume(value, unit) : `${value} ${unit}`;
}

/**
 * The chart, said in words for screen readers: "Estimated 1RM, last 3
 * months, 2 workouts: Mon, Oct 6: 126.7 kg, Personal record; …".
 */
function describe(metric: Metric, range: Range, points: ProgressPoint[], unit: ExerciseProgress['unit']) {
  const metricLabel = METRICS.find((m) => m.value === metric)!.label;
  const { phrase } = RANGES.find((r) => r.value === range)!;
  const count = `${points.length} ${points.length === 1 ? 'workout' : 'workouts'}`;
  const each = points.map(
    (p) =>
      `${formatSessionDate(p.finishedAt)}: ${formatValue(metric, p[metric], unit)}${p.personalRecord ? ', Personal record' : ''}`,
  );
  return `${metricLabel}, ${phrase}, ${count}: ${each.join('; ')}`;
}

/**
 * The User's progress at an Exercise: a point per finished Session, by the
 * metric chosen (best Estimated 1RM, heaviest weight or Volume) over a range,
 * marking the Sessions that set a Personal record. In the User's Unit
 * preference.
 */
export function ExerciseProgressChart({ token, exerciseId }: { token: string; exerciseId: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [progress, setProgress] = useState<ExerciseProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('estimated1RM');
  const [range, setRange] = useState<Range>('3m');

  useEffect(() => {
    let current = true;
    getExerciseProgress(token, exerciseId)
      .then((found) => current && setProgress(found))
      .catch((e) => current && setError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [token, exerciseId]);

  const points = useMemo(() => (progress ? inRange(progress.sessions, range, new Date()) : []), [progress, range]);
  const data = useMemo(() => points.map((p) => ({ x: Date.parse(p.finishedAt), y: p[metric] })), [points, metric]);

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
    const { phrase } = RANGES.find((r) => r.value === range)!;
    body = (
      <>
        <ChipGroup label="Metric" options={METRICS} value={metric} onChange={(m) => m && setMetric(m)} />
        <ChipGroup label="Range" options={RANGES} value={range} onChange={(r) => r && setRange(r)} />
        {points.length === 0 ? (
          <Text style={styles.muted}>No workouts in the {phrase}.</Text>
        ) : (
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={describe(metric, range, points, progress.unit)}
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
                formatXLabel: (x) => new Date(x).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
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
              {({ points: drawn }) => (
                <>
                  <Line points={drawn.y} color={colors.text} strokeWidth={2} curveType="linear" />
                  <Scatter points={drawn.y} radius={3} color={colors.text} />
                  <Scatter
                    points={drawn.y.filter((_, i) => points[i]?.personalRecord)}
                    radius={6}
                    color={colors.link}
                  />
                </>
              )}
            </CartesianChart>
          </View>
        )}
        <Text style={styles.muted}>{unitNote(metric, progress.unit)}</Text>
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

/** What the chart's numbers are, and what the gold points mean. */
function unitNote(metric: Metric, unit: ExerciseProgress['unit']) {
  const per =
    metric === 'volume'
      ? 'Volume per workout'
      : metric === 'heaviestWeight'
        ? 'Heaviest set per workout'
        : 'Best Estimated 1RM per workout';
  return `${per}, in ${unit}. Gold points set a Personal record.`;
}

const useStyles = makeStyles((colors) => ({
  card: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.md, gap: spacing.sm },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  chart: { height: 220 },
  muted: { fontSize: 13, color: colors.muted },
  error: { color: colors.danger, fontSize: 15 },
}));
