import type { Post } from '@/entities/post';
import { setRuns, type SetRun } from '@/entities/workout';

/**
 * One image of a Carousel. The cover is the Progress photo with the date and
 * title over it, or the stats when there's no photo; then the stats; the
 * Personal records, only if there are any; then the Exercises with their Sets.
 */
export type CarouselImage =
  { kind: 'cover' } | { kind: 'stats' } | { kind: 'records' } | { kind: 'exercises'; runs: SetRun[] };

/** About four Exercises fit an image, or fewer with many Sets. */
const RUNS_PER_IMAGE = 4;
/** The lines an exercises image holds: a name, or a Set. */
const LINES_PER_IMAGE = 16;
/** The most Sets one Exercise shows; the rest are counted instead. */
export const MAX_SETS_SHOWN = 8;

/** The images of post's Carousel, in order. */
export function carouselImages(post: Post): CarouselImage[] {
  const images: CarouselImage[] = [{ kind: 'cover' }, { kind: 'stats' }];
  if (post.session.personalRecords.length > 0) images.push({ kind: 'records' });

  let runs: SetRun[] = [];
  let lines = 0;
  for (const run of post.session.exercises.flatMap(setRuns)) {
    const cost = 1 + Math.min(run.sets.length, MAX_SETS_SHOWN + 1);
    if (runs.length > 0 && (runs.length === RUNS_PER_IMAGE || lines + cost > LINES_PER_IMAGE)) {
      images.push({ kind: 'exercises', runs });
      runs = [];
      lines = 0;
    }
    runs.push(run);
    lines += cost;
  }
  if (runs.length > 0) images.push({ kind: 'exercises', runs });
  return images;
}
