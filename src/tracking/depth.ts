import type { Landmark } from "./handTracker";
import {
  LM_INDEX_MCP,
  LM_PINKY_MCP,
  Z_REF,
  Z_SCALE,
  Z_MIN,
  Z_MAX,
  LANDMARK_ASPECT,
} from "../config";

/**
 * MediaPipe's per-landmark z is relative to the wrist and far too noisy for stroke
 * depth. Apparent palm width is stable instead: a closer hand fills more of the frame.
 * Known limitation (spec §5, PLAN.md §6): this drifts if the user leans toward the
 * camera. That is accepted, not a bug to chase.
 *
 * raw = 1/palmWidth grows as the hand moves AWAY from the camera. The scene camera
 * looks from +z toward the origin, so +z is toward the viewer: a hand moving away
 * must produce a MORE NEGATIVE z. Hence (Z_REF - raw), not (raw - Z_REF).
 */
export interface DepthMeasurement {
  /** Distance between landmarks 5 and 17 in isotropic units. */
  palmWidth: number;
  /** 1 / palmWidth. Grows as the hand moves AWAY from the camera. */
  raw: number;
  /** Final clamped scene-space z. */
  z: number;
}

export function measureDepth(landmarks: Landmark[]): DepthMeasurement {
  const a = landmarks[LM_INDEX_MCP];
  const b = landmarks[LM_PINKY_MCP];
  // See LANDMARK_ASPECT (config.ts): x is normalised by frame width, y by frame
  // height, so the x-delta must be rescaled or palm rotation injects phantom depth.
  const palmWidth = Math.hypot((a.x - b.x) * LANDMARK_ASPECT, a.y - b.y);
  if (palmWidth < 1e-6) return { palmWidth, raw: 0, z: 0 };

  const raw = 1 / palmWidth;
  const z = (Z_REF - raw) * Z_SCALE;
  return { palmWidth, raw, z: Math.min(Z_MAX, Math.max(Z_MIN, z)) };
}

export function estimateDepth(landmarks: Landmark[]): number {
  return measureDepth(landmarks).z;
}
