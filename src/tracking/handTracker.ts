import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { WASM_PATH, MODEL_PATH, DELEGATE } from "../config";
import { ERROR_MESSAGES } from "../ui/errorDisplay";

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/** Thrown with a user-facing message already chosen. */
export class TrackerError extends Error {}

export interface HandTracker {
  /** Returns 21 landmarks, or null if no hand is present or the frame is stale. */
  detect(video: HTMLVideoElement, nowMs: number): Landmark[] | null;
}

export async function createHandTracker(): Promise<HandTracker> {
  let landmarker: HandLandmarker;
  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: DELEGATE },
      runningMode: "VIDEO",
      numHands: 1,
    });
  } catch (err) {
    console.error("[air-draw] landmarker init failed", err);
    throw new TrackerError(ERROR_MESSAGES.modelFailed);
  }

  // detectForVideo throws if the timestamp does not strictly increase (PLAN.md §6),
  // so skip frames the video has not advanced past.
  let lastVideoTime = -1;

  return {
    detect(video, nowMs) {
      if (video.currentTime === lastVideoTime) return null;
      lastVideoTime = video.currentTime;

      const result = landmarker.detectForVideo(video, nowMs);
      const hand = result.landmarks[0];
      return hand && hand.length > 0 ? hand : null;
    },
  };
}
