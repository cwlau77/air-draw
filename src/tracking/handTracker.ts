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
  let lastResult: Landmark[] | null = null;

  return {
    detect(video, nowMs) {
      // A stale frame means "no new information", NOT "no hand". Returning null here
      // would make the consumer see the hand vanish on every frame where rAF (~60fps)
      // has advanced but the webcam (~30fps) has not — which in later tasks ends the
      // active stroke and resets the smoothing filters. Return the previous result.
      if (video.currentTime === lastVideoTime) return lastResult;
      lastVideoTime = video.currentTime;

      const result = landmarker.detectForVideo(video, nowMs);
      const hand = result.landmarks[0];
      lastResult = hand && hand.length > 0 ? hand : null;
      return lastResult;
    },
  };
}
