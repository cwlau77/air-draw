import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { WASM_PATH, MODEL_PATH, DELEGATE, STALE_FRAME_TIMEOUT_MS } from "../config";
import { ERROR_MESSAGES } from "../ui/errorDisplay";

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/** Thrown with a user-facing message already chosen. */
export class TrackerError extends Error {}

export interface HandTracker {
  /** Returns 21 landmarks, or null if detection ran and found no hand, or if the video
   *  has been stalled too long (see STALE_FRAME_TIMEOUT_MS) to keep trusting the cache. */
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
  let lastAdvanceMs = -1;

  return {
    detect(video, nowMs) {
      // A stale frame means "no new information", NOT "no hand". Returning null here
      // would make the consumer see the hand vanish on every frame where rAF (~60fps)
      // has advanced but the webcam (~30fps) has not — which in later tasks ends the
      // active stroke and resets the smoothing filters. Return the previous result...
      if (video.currentTime === lastVideoTime) {
        // ...but only for a bounded time. If currentTime never advances again (webcam
        // unplugged, macOS handing the device to another app, track ended), the frame
        // is not "briefly stale", it is gone — keep returning cached landmarks forever
        // and the cursor freezes with an active stroke that never ends. Past the
        // timeout, fall through to the hand-loss path instead.
        if (lastAdvanceMs < 0 || nowMs - lastAdvanceMs <= STALE_FRAME_TIMEOUT_MS) {
          return lastResult;
        }
        lastResult = null;
        return lastResult;
      }
      lastVideoTime = video.currentTime;
      lastAdvanceMs = nowMs;

      const result = landmarker.detectForVideo(video, nowMs);
      const hand = result.landmarks[0];
      lastResult = hand && hand.length > 0 ? hand : null;
      return lastResult;
    },
  };
}
