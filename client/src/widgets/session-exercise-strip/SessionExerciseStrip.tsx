import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ExerciseMedia, getExercise } from '@/entities/exercise';
import { blockExercises, allPlannedSetsLogged, type SessionBlock, type SessionExercise } from '@/entities/workout';
import { makeStyles, spacing } from '@/shared/ui';
import { listNames } from '@/shared/utils';

type SessionExerciseStripProps = {
  token: string;
  blocks: SessionBlock[];
  /** The Session exercise shown, or null when there's none. */
  shownId: string | null;
  onShow: (sessionExerciseId: string) => void;
  onAdd: () => void;
};

/**
 * A strip of square tiles across the session screen, one per Session
 * exercise with its Exercise's image, that shows the one tapped. A bar under
 * each tile is highlighted under the one shown, and fills once its Session
 * exercise has a Target and every Set it plans is logged; a Superset's members sit
 * together in a bracket. A "+" tile at the end adds an exercise. The strip
 * scrolls sideways and keeps the tile shown in view.
 */
export function SessionExerciseStrip({ token, blocks, shownId, onShow, onAdd }: SessionExerciseStripProps) {
  const styles = useStyles();
  const images = useExerciseImages(
    token,
    blocks.flatMap((b) => blockExercises(b).map((e) => e.exerciseId)),
  );
  const scroll = useRef<ScrollView>(null);
  // Where each block sits in the strip, and each tile in its block.
  const blockX = useRef(new Map<string, number>());
  const tileX = useRef(new Map<string, { block: string; x: number }>());
  // The part of the strip in view: how far it's scrolled, and its width.
  const scrolledX = useRef(0);
  const width = useRef(0);

  /** Scrolls the tile shown into view, with a peek at the tile beyond it, if it's out of view. */
  function scrollToShown() {
    if (!shownId) return;
    const tile = tileX.current.get(shownId);
    const block = tile && blockX.current.get(tile.block);
    if (!tile || block === undefined || width.current === 0) return;
    const start = block + tile.x;
    const end = start + TILE_SIZE;
    if (start < scrolledX.current) {
      scroll.current?.scrollTo({ x: Math.max(start - PEEK, 0), animated: true });
    } else if (end > scrolledX.current + width.current) {
      scroll.current?.scrollTo({ x: end - width.current + PEEK, animated: true });
    }
  }

  useEffect(scrollToShown, [shownId]);

  function tile(exercise: SessionExercise, block: string) {
    const shown = exercise.id === shownId;
    const done = allPlannedSetsLogged(exercise);
    const imageUrl = images[exercise.exerciseId];
    return (
      <Pressable
        key={exercise.id}
        accessibilityRole="tab"
        accessibilityLabel={exercise.name}
        accessibilityState={{ selected: shown }}
        accessibilityValue={done ? { text: 'Done' } : undefined}
        onPress={() => onShow(exercise.id)}
        onLayout={(e) => {
          tileX.current.set(exercise.id, { block, x: e.nativeEvent.layout.x });
          if (shown) scrollToShown();
        }}
        style={styles.tileColumn}
      >
        <View style={styles.tile}>
          {imageUrl ? <ExerciseMedia path={imageUrl} token={token} accessibilityLabel="" fill /> : null}
        </View>
        {/* Done takes the fill's colour over shown, so shown also thickens the bar. */}
        <View style={styles.barSlot}>
          <View style={[styles.bar, shown && styles.barShown, done && styles.barDone]} />
        </View>
      </Pressable>
    );
  }

  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel="Exercises in this workout"
      contentContainerStyle={styles.strip}
      onLayout={(e) => {
        width.current = e.nativeEvent.layout.width;
        scrollToShown();
      }}
      onScroll={(e) => {
        scrolledX.current = e.nativeEvent.contentOffset.x;
      }}
      scrollEventThrottle={32}
    >
      {blocks.map((b) => {
        const key = b.kind === 'superset' ? b.supersetId : b.exercise.id;
        const onLayout = (e: { nativeEvent: { layout: { x: number } } }) => {
          blockX.current.set(key, e.nativeEvent.layout.x);
        };
        return b.kind === 'superset' ? (
          <View
            key={key}
            accessibilityLabel={`Tiles of superset of ${listNames(b.exercises.map((e) => e.name))}`}
            onLayout={onLayout}
            style={styles.superset}
          >
            {b.exercises.map((e) => tile(e, key))}
          </View>
        ) : (
          <View key={key} onLayout={onLayout} style={styles.single}>
            {tile(b.exercise, key)}
          </View>
        );
      })}
      <Pressable accessibilityRole="button" accessibilityLabel="Add exercise" onPress={onAdd} style={styles.tileColumn}>
        <View style={[styles.tile, styles.add]}>
          <Text style={styles.plus}>+</Text>
        </View>
        <View style={styles.barSlot} />
      </Pressable>
    </ScrollView>
  );
}

/**
 * Each Exercise's image path, by Exercise id, once looked up; an Exercise
 * with no image, or not looked up yet, has none.
 */
function useExerciseImages(token: string, exerciseIds: string[]): Record<string, string | null> {
  const [images, setImages] = useState<Record<string, string | null>>({});
  const missing = [...new Set(exerciseIds)].filter((id) => !(id in images)).sort();
  const missingKey = missing.join(',');

  useEffect(() => {
    if (missing.length === 0) return;
    let current = true;
    Promise.all(
      missing.map((id) =>
        getExercise(token, id).then(
          (exercise) => [id, exercise.imageUrl] as const,
          // An image that can't be looked up leaves its tile grey.
          () => [id, null] as const,
        ),
      ),
    ).then((found) => {
      if (current) setImages((before) => ({ ...before, ...Object.fromEntries(found) }));
    });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- missing is keyed by missingKey
  }, [token, missingKey]);

  return images;
}

const TILE_SIZE = 56;
const BAR_HEIGHT = 4;
/** The bar under the tile shown, thicker than the rest. */
const BAR_SHOWN_HEIGHT = 6;
/** How much of the next tile shows beyond the one scrolled to. */
const PEEK = 24;

const useStyles = makeStyles((colors) => ({
  strip: { gap: spacing.sm, paddingVertical: spacing.xs, alignItems: 'flex-end' },
  single: { flexDirection: 'row' },
  superset: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
    paddingBottom: 0,
    borderRadius: 12,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: colors.primary,
  },
  tileColumn: { gap: spacing.xs, alignItems: 'center' },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  add: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.fieldBorder },
  plus: { fontSize: 28, color: colors.text },
  bar: { width: TILE_SIZE, height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2, backgroundColor: colors.border },
  barShown: { height: BAR_SHOWN_HEIGHT, borderRadius: BAR_SHOWN_HEIGHT / 2, backgroundColor: colors.primary },
  barDone: { backgroundColor: colors.success },
  // As tall as the bar shown, so tiles stay level as the one shown changes.
  barSlot: { height: BAR_SHOWN_HEIGHT, justifyContent: 'center' },
}));
