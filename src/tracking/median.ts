/**
 * Median of the values, which rejects impulsive spikes outright where an average would
 * be dragged toward them.
 *
 * Both signals that use this — the pinch ratio and the depth estimate — fail in the same
 * way: brief tracking glitches produce large excursions that return to baseline within a
 * frame or two. A mean follows those; a median ignores them.
 *
 * Does not mutate the input.
 */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
