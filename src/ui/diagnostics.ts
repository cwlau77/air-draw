/**
 * Developer instrumentation for measuring the pinch ratio's distribution, instead of
 * eyeballing a rapidly-changing on-screen number. Self-contained and separable from
 * the rest of the app — wired only from main.ts, never imported by src/scene/.
 */

export interface PinchSample {
  t: number; // performance.now()
  ratio: number; // raw pinch ratio; only finite samples are recorded
  smoothed: number | null; // median-filtered ratio thresholding actually used, or null before the first sample
  pinching: boolean;
  drawing: boolean;
  hand: string; // "Left" | "Right" | "unknown"
}

const MAX_SAMPLES = 20000;
const FLICKER_GAP_MS = 250;

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((p / 100) * (sortedAsc.length - 1))));
  return sortedAsc[idx];
}

interface GroupStats {
  hand: string;
  pinching: boolean;
  count: number;
  min: string;
  p5: string;
  p50: string;
  p95: string;
  max: string;
  mean: string;
}

function groupBy(samples: PinchSample[]): Map<string, PinchSample[]> {
  const groups = new Map<string, PinchSample[]>();
  for (const s of samples) {
    // Delimiter is safe: hand is always "Left"/"Right"/"unknown" and pinching
    // renders as "true"/"false" -- neither can contain a pipe.
    const key = `${s.hand}|${s.pinching}`;
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push(s);
  }
  return groups;
}

function statsRow(hand: string, pinchingStr: string, ratios: number[]): GroupStats {
  const sorted = [...ratios].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sorted.length > 0 ? sum / sorted.length : NaN;
  return {
    hand,
    pinching: pinchingStr === "true",
    count: sorted.length,
    min: sorted[0]?.toFixed(4) ?? "NaN",
    p5: percentile(sorted, 5).toFixed(4),
    p50: percentile(sorted, 50).toFixed(4),
    p95: percentile(sorted, 95).toFixed(4),
    max: sorted[sorted.length - 1]?.toFixed(4) ?? "NaN",
    mean: mean.toFixed(4),
  };
}

function sortRows(rows: GroupStats[]): GroupStats[] {
  rows.sort((a, b) => (a.hand === b.hand ? Number(a.pinching) - Number(b.pinching) : a.hand.localeCompare(b.hand)));
  return rows;
}

/** Raw, unfiltered pinch ratio -- comparable against earlier measurements taken before
 *  median filtering was introduced. */
function summarize(samples: PinchSample[]): GroupStats[] {
  const groups = groupBy(samples);
  const rows: GroupStats[] = [];
  for (const [key, arr] of groups) {
    const [hand, pinchingStr] = key.split("|");
    rows.push(statsRow(hand, pinchingStr, arr.map((s) => s.ratio)));
  }
  return sortRows(rows);
}

/** Median-filtered ratio thresholding actually used. Samples recorded before the first
 *  filter output (smoothed === null) are excluded rather than treated as 0 or dropped
 *  silently mixed in -- they carry no smoothed value to summarize. */
function summarizeSmoothed(samples: PinchSample[]): GroupStats[] {
  const groups = groupBy(samples);
  const rows: GroupStats[] = [];
  for (const [key, arr] of groups) {
    const [hand, pinchingStr] = key.split("|");
    const smoothedRatios = arr
      .map((s) => s.smoothed)
      .filter((v): v is number => v !== null);
    rows.push(statsRow(hand, pinchingStr, smoothedRatios));
  }
  return sortRows(rows);
}

export class PinchDiagnostics {
  private buffer: PinchSample[] = [];
  private lastPinching: boolean | null = null;
  private lastTransitionT: number | null = null;
  private lastTransitionRatio: number | null = null;
  flickerCount = 0;

  record(sample: PinchSample): void {
    if (!Number.isFinite(sample.ratio)) return;

    this.buffer.push(sample);
    if (this.buffer.length > MAX_SAMPLES) {
      this.buffer.splice(0, this.buffer.length - MAX_SAMPLES);
    }

    if (this.lastPinching !== null && sample.pinching !== this.lastPinching) {
      if (
        this.lastTransitionT !== null &&
        this.lastTransitionRatio !== null &&
        sample.t - this.lastTransitionT < FLICKER_GAP_MS
      ) {
        this.flickerCount++;
        const gap = sample.t - this.lastTransitionT;
        console.warn(
          `[air-draw] pinch flicker: gap ${gap.toFixed(1)}ms, ratios ${this.lastTransitionRatio.toFixed(4)} -> ${sample.ratio.toFixed(4)}, hand ${sample.hand}`,
        );
      }
      this.lastTransitionT = sample.t;
      this.lastTransitionRatio = sample.ratio;
    }
    this.lastPinching = sample.pinching;
  }

  stats(): void {
    console.log("[air-draw] raw:");
    console.table(summarize(this.buffer));
    console.log("[air-draw] smoothed:");
    console.table(summarizeSmoothed(this.buffer));
  }

  async sample(label: string, durationMs = 3000): Promise<void> {
    console.log(`[air-draw] measuring ${label} for ${(durationMs / 1000).toFixed(1)}s...`);
    const start = performance.now();
    await new Promise<void>((resolve) => setTimeout(resolve, durationMs));
    const end = performance.now();
    const windowSamples = this.buffer.filter((s) => s.t >= start && s.t <= end);
    console.log(`[air-draw] results for "${label}" (${windowSamples.length} samples):`);
    console.log("[air-draw] raw:");
    console.table(summarize(windowSamples));
    console.log("[air-draw] smoothed:");
    console.table(summarizeSmoothed(windowSamples));
  }

  reset(): void {
    this.buffer = [];
    this.lastPinching = null;
    this.lastTransitionT = null;
    this.lastTransitionRatio = null;
    this.flickerCount = 0;
  }

  rolling(windowMs = 2000): { min: number; max: number; count: number } | null {
    const now = performance.now();
    const cutoff = now - windowMs;
    let min = Infinity;
    let max = -Infinity;
    let count = 0;
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const s = this.buffer[i];
      if (s.t < cutoff) break;
      if (s.ratio < min) min = s.ratio;
      if (s.ratio > max) max = s.ratio;
      count++;
    }
    if (count === 0) return null;
    return { min, max, count };
  }
}
