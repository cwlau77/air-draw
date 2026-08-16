import { ONE_EURO_MIN_CUTOFF, ONE_EURO_BETA, ONE_EURO_D_CUTOFF } from "../config";

/** Smoothing factor for a given cutoff frequency and timestep. */
function alpha(cutoffHz: number, dtSeconds: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSeconds);
}

/** Filters one scalar channel. Use one instance per axis. */
export class OneEuroFilter {
  private lastValue: number | null = null;
  private lastDerivative = 0;
  private lastTimeMs: number | null = null;

  constructor(
    private minCutoff = ONE_EURO_MIN_CUTOFF,
    private beta = ONE_EURO_BETA,
    private dCutoff = ONE_EURO_D_CUTOFF,
  ) {}

  reset(): void {
    this.lastValue = null;
    this.lastDerivative = 0;
    this.lastTimeMs = null;
  }

  filter(value: number, timestampMs: number): number {
    if (this.lastValue === null || this.lastTimeMs === null) {
      this.lastValue = value;
      this.lastTimeMs = timestampMs;
      return value;
    }

    const dt = (timestampMs - this.lastTimeMs) / 1000;
    if (dt <= 0) return this.lastValue;
    this.lastTimeMs = timestampMs;

    // Smooth the speed estimate, then let speed widen the cutoff.
    const derivative = (value - this.lastValue) / dt;
    const aD = alpha(this.dCutoff, dt);
    this.lastDerivative = aD * derivative + (1 - aD) * this.lastDerivative;

    const cutoff = this.minCutoff + this.beta * Math.abs(this.lastDerivative);
    const a = alpha(cutoff, dt);
    this.lastValue = a * value + (1 - a) * this.lastValue;
    return this.lastValue;
  }
}
