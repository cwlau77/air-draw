import type { Landmark } from "./handTracker";
import { median } from "./median";
import {
  LM_THUMB_TIP,
  LM_INDEX_TIP,
  LM_WRIST,
  LM_INDEX_MCP,
  LM_PINKY_MCP,
  LM_FINGERTIPS,
  PINCH_ON,
  PINCH_OFF,
  PINCH_RELEASE_DELAY_MS,
  PINCH_RELEASE_HARD,
  PINCH_MEDIAN_WINDOW,
  FIST_ON,
  FIST_OFF,
  FIST_MEDIAN_WINDOW,
  LANDMARK_ASPECT,
} from "../config";

/** Euclidean distance in isotropic units. See LANDMARK_ASPECT: x and y are normalised
 *  by different frame dimensions, so the x-delta must be scaled or the result depends
 *  on the vector's orientation. */
function distance(a: Landmark, b: Landmark): number {
  return Math.hypot((a.x - b.x) * LANDMARK_ASPECT, a.y - b.y);
}

/**
 * Thumb-tip-to-index-tip distance, normalized by wrist-to-index-knuckle so the
 * value stays roughly scale-invariant as the hand moves toward or away from the
 * camera. Raw distance alone is useless because it shrinks with distance.
 */
export function pinchRatio(landmarks: Landmark[]): number {
  const reference = distance(landmarks[LM_WRIST], landmarks[LM_INDEX_MCP]);
  if (reference < 1e-6) return Number.POSITIVE_INFINITY;
  return distance(landmarks[LM_THUMB_TIP], landmarks[LM_INDEX_TIP]) / reference;
}

/** Two-threshold state machine. One threshold would flicker at the boundary. */
export class PinchDetector {
  private pinching = false;
  /** When the ratio first rose above PINCH_OFF, or null if it is currently below. */
  private releaseSince: number | null = null;
  private ratioWindow: number[] = [];
  /** The median-filtered ratio thresholding actually used, or null before any sample. */
  private smoothed: number | null = null;

  /**
   * True only while points should actively be appended. Goes false the moment the
   * ratio rises above PINCH_OFF, before the debounce decides whether to end the
   * stroke — so the finger-opening motion is not recorded as a tail.
   */
  get isDrawing(): boolean {
    return this.pinching && this.releaseSince === null;
  }

  get smoothedRatio(): number | null {
    return this.smoothed;
  }

  /** Returns the new pinch state. A null hand always releases immediately. */
  update(landmarks: Landmark[] | null, nowMs: number): boolean {
    if (!landmarks) {
      this.pinching = false;
      this.releaseSince = null;
      this.ratioWindow.length = 0;
      this.smoothed = null;
      return false;
    }

    const ratio = pinchRatio(landmarks);

    this.ratioWindow.push(ratio);
    if (this.ratioWindow.length > PINCH_MEDIAN_WINDOW) this.ratioWindow.shift();
    const smoothedRatio = median(this.ratioWindow);
    this.smoothed = smoothedRatio;

    if (!this.pinching) {
      if (smoothedRatio < PINCH_ON) {
        this.pinching = true;
        this.releaseSince = null;
      }
      return this.pinching;
    }

    if (smoothedRatio > PINCH_RELEASE_HARD) {
      // Unambiguously open — a deliberate release, not a blur spike. Stop at once.
      this.pinching = false;
      this.releaseSince = null;
    } else if (smoothedRatio > PINCH_OFF) {
      // Motion blur can spike the ratio for a frame or two; only release if it stays high.
      if (this.releaseSince === null) this.releaseSince = nowMs;
      else if (nowMs - this.releaseSince >= PINCH_RELEASE_DELAY_MS) {
        this.pinching = false;
        this.releaseSince = null;
      }
    } else {
      // Dipped back below the threshold — the spike was transient, so restart the timer.
      this.releaseSince = null;
    }
    return this.pinching;
  }
}

/**
 * Mean fingertip-to-wrist distance, normalised by palm width so the value is roughly
 * scale-invariant as the hand moves toward or away from the camera. Curled fingers sit
 * closer to the wrist, so a low ratio means a fist.
 *
 * Uses the same LANDMARK_ASPECT-corrected distance() as pinchRatio: x and y are
 * normalised by different frame dimensions, so an uncorrected hypot would make this
 * depend on hand ROTATION rather than finger curl.
 */
export function fistRatio(landmarks: Landmark[]): number {
  const reference = distance(landmarks[LM_INDEX_MCP], landmarks[LM_PINKY_MCP]);
  if (reference < 1e-6) return Number.POSITIVE_INFINITY;
  const wrist = landmarks[LM_WRIST];
  let total = 0;
  for (const tip of LM_FINGERTIPS) total += distance(wrist, landmarks[tip]);
  return total / LM_FINGERTIPS.length / reference;
}

/** Two-threshold state machine with a median filter, mirroring PinchDetector. */
export class FistDetector {
  private closed = false;
  private ratioWindow: number[] = [];
  private smoothed: number | null = null;

  get smoothedRatio(): number | null {
    return this.smoothed;
  }

  update(landmarks: Landmark[] | null): boolean {
    if (!landmarks) {
      this.closed = false;
      this.ratioWindow.length = 0;
      this.smoothed = null;
      return false;
    }

    this.ratioWindow.push(fistRatio(landmarks));
    if (this.ratioWindow.length > FIST_MEDIAN_WINDOW) this.ratioWindow.shift();
    const ratio = median(this.ratioWindow);
    this.smoothed = ratio;

    if (!this.closed && ratio < FIST_ON) this.closed = true;
    else if (this.closed && ratio > FIST_OFF) this.closed = false;
    return this.closed;
  }
}
