import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, Vibration, View } from 'react-native';

import { formatRest } from '@/entities/workout';
import { Button, makeStyles, Sheet, spacing } from '@/shared/ui';

const MINUTES = Array.from({ length: 11 }, (_, i) => i);
const SECONDS = [0, 15, 30, 45];
/** The rest the wheels start at with none planned. */
const DEFAULT_REST_S = 90;
const COUNTDOWN_TICK_MS = 250;

/**
 * An optional countdown between Sets, started by the User: a ⏱ icon, with the
 * time left beside it while counting down, which opens a sheet. There the
 * User picks a rest on two wheels, minutes (0–10) and seconds in 15-second
 * steps, starting at the first rest the Routine planned (plannedSeconds); or,
 * while counting down, adds 15 seconds or skips it. It lives on the device
 * only, and keeps time from its end time, so it stays right while the app is
 * in the background.
 */
export function RestTimer({ plannedSeconds = [] }: { plannedSeconds?: number[] }) {
  const styles = useStyles();
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);

  const remaining = endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));

  useEffect(() => {
    if (endsAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(timer);
  }, [endsAt]);

  useEffect(() => {
    if (endsAt !== null && remaining === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- predates the linter; refactor when next touched.
      setEndsAt(null);
      Vibration.vibrate();
    }
  }, [endsAt, remaining]);

  function start(seconds: number) {
    const startedAt = Date.now();
    setNow(startedAt);
    setEndsAt(startedAt + seconds * 1000);
    setOpen(false);
  }

  function skip() {
    setEndsAt(null);
    setOpen(false);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Rest timer"
        hitSlop={6}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.icon}>⏱</Text>
        {endsAt !== null ? <Text style={styles.left}>{formatRest(remaining)}</Text> : null}
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} accessibilityLabel="Rest timer sheet" title="Rest timer">
        {endsAt !== null ? (
          <>
            <Text accessibilityLabel="Rest time left" style={styles.countdown}>
              {formatRest(remaining)}
            </Text>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button label="+15s" variant="secondary" onPress={() => setEndsAt(endsAt + 15_000)} />
              </View>
              <View style={styles.flex}>
                <Button label="Skip rest" variant="secondary" onPress={skip} />
              </View>
            </View>
          </>
        ) : (
          <RestPicker initialSeconds={plannedSeconds[0] ?? DEFAULT_REST_S} onStart={start} />
        )}
      </Sheet>
    </>
  );
}

/** Two wheels, minutes and seconds, starting at initialSeconds (to the nearest 15), and Start rest. */
function RestPicker({ initialSeconds, onStart }: { initialSeconds: number; onStart: (seconds: number) => void }) {
  const styles = useStyles();
  const rounded = Math.min(Math.round(initialSeconds / 15) * 15, MINUTES.at(-1)! * 60 + SECONDS.at(-1)!);
  const [minutes, setMinutes] = useState(Math.floor(rounded / 60));
  const [seconds, setSeconds] = useState(rounded % 60);
  const total = minutes * 60 + seconds;
  return (
    <>
      <View style={styles.wheels}>
        <Wheel values={MINUTES} value={minutes} onChange={setMinutes} text={(m) => `${m} min`} label="minutes" />
        <Wheel
          values={SECONDS}
          value={seconds}
          onChange={setSeconds}
          text={(s) => `${String(s).padStart(2, '0')} s`}
          label="seconds"
        />
      </View>
      <Button
        label={`Start ${formatRest(total)}`}
        accessibilityLabel="Start rest"
        disabled={total === 0}
        onPress={() => onStart(total)}
      />
    </>
  );
}

const ITEM_HEIGHT = 44;

/**
 * A wheel of values, three in view with the one picked in the middle: it
 * snaps to a value as it's scrolled, or scrolls to one tapped. Each value
 * reads out as "2 minutes", "15 seconds" (label).
 */
function Wheel({
  values,
  value,
  onChange,
  text,
  label,
}: {
  values: number[];
  value: number;
  onChange: (value: number) => void;
  text: (value: number) => string;
  label: string;
}) {
  const styles = useStyles();
  const scroll = useRef<ScrollView>(null);
  const [startIndex] = useState(() => Math.max(0, values.indexOf(value)));
  return (
    <View style={styles.wheel}>
      <View pointerEvents="none" style={styles.wheelPicked} />
      <ScrollView
        ref={scroll}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: startIndex * ITEM_HEIGHT }}
        contentContainerStyle={styles.wheelContent}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
          onChange(values[Math.min(Math.max(i, 0), values.length - 1)]);
        }}
      >
        {values.map((v, i) => (
          <Pressable
            key={v}
            accessibilityRole="button"
            accessibilityLabel={`${v} ${label}`}
            accessibilityState={{ selected: v === value }}
            onPress={() => {
              scroll.current?.scrollTo({ y: i * ITEM_HEIGHT, animated: true });
              onChange(v);
            }}
            style={styles.wheelItem}
          >
            <Text style={[styles.wheelText, v === value && styles.wheelTextPicked]}>{text(v)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
  },
  pressed: { backgroundColor: colors.card },
  icon: { fontSize: 20 },
  left: { fontSize: 17, fontWeight: '600', color: colors.primary, fontVariant: ['tabular-nums'] },
  countdown: { fontSize: 40, fontWeight: '700', color: colors.text, textAlign: 'center' },
  row: { flexDirection: 'row', gap: spacing.xs },
  flex: { flex: 1 },
  wheels: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  wheel: { width: 120, height: ITEM_HEIGHT * 3 },
  wheelContent: { paddingVertical: ITEM_HEIGHT },
  wheelPicked: {
    position: 'absolute',
    top: ITEM_HEIGHT,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    borderRadius: 10,
    backgroundColor: colors.card,
  },
  wheelItem: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  wheelText: { fontSize: 20, color: colors.muted, fontVariant: ['tabular-nums'] },
  wheelTextPicked: { color: colors.text, fontWeight: '600' },
}));
