import type { Landmark } from "./handTracker";
import {
  LM_THUMB_TIP,
  LM_INDEX_TIP,
  LM_WRIST,
  LM_INDEX_MCP,
  PINCH_ON,
  PINCH_OFF,
  PINCH_RELEASE_DELAY_MS,
  PINCH_RELEASE_HARD,
} from "../config";

function distance(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

  get isPinching(): boolean {
    return this.pinching;
  }

  /** Returns the new pinch state. A null hand always releases immediately. */
  update(landmarks: Landmark[] | null, nowMs: number): boolean {
    if (!landmarks) {
      this.pinching = false;
      this.releaseSince = null;
      return false;
    }

    const ratio = pinchRatio(landmarks);

    if (!this.pinching) {
      if (ratio < PINCH_ON) {
        this.pinching = true;
        this.releaseSince = null;
      }
      return this.pinching;
    }

    if (ratio > PINCH_RELEASE_HARD) {
      // Unambiguously open — a deliberate release, not a blur spike. Stop at once.
      this.pinching = false;
      this.releaseSince = null;
    } else if (ratio > PINCH_OFF) {
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
