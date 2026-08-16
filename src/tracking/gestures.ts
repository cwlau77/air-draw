import type { Landmark } from "./handTracker";
import {
  LM_THUMB_TIP,
  LM_INDEX_TIP,
  LM_WRIST,
  LM_INDEX_MCP,
  PINCH_ON,
  PINCH_OFF,
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

  get isPinching(): boolean {
    return this.pinching;
  }

  /** Returns the new pinch state. A null hand always releases. */
  update(landmarks: Landmark[] | null): boolean {
    if (!landmarks) {
      this.pinching = false;
      return false;
    }
    const ratio = pinchRatio(landmarks);
    if (!this.pinching && ratio < PINCH_ON) this.pinching = true;
    else if (this.pinching && ratio > PINCH_OFF) this.pinching = false;
    return this.pinching;
  }
}
