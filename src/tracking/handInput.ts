import type { Landmark } from "./handTracker";
import type { HandInput } from "./types";
import { PinchDetector } from "./gestures";
import { OneEuroFilter } from "./smoothing";
import { estimateDepth } from "./depth";
import { LM_INDEX_TIP, SCENE_WIDTH, SCENE_HEIGHT } from "../config";

export class HandInputSource {
  private pinch = new PinchDetector();
  private fx = new OneEuroFilter();
  private fy = new OneEuroFilter();
  private fz = new OneEuroFilter();
  private last: HandInput = {
    tip: { x: 0, y: 0, z: 0 },
    pinching: false,
    present: false,
  };

  update(landmarks: Landmark[] | null, nowMs: number): HandInput {
    if (!landmarks) {
      // Reset filters so the hand reappearing elsewhere does not glide across the gap.
      this.fx.reset();
      this.fy.reset();
      this.fz.reset();
      this.last = { tip: this.last.tip, pinching: this.pinch.update(null), present: false };
      return this.last;
    }

    const tipLm = landmarks[LM_INDEX_TIP];

    // Mirroring convention: the video and overlay are mirrored via CSS, so the scene
    // mapping compensates here with (0.5 - x). MediaPipe is origin-top-left in [0,1];
    // three.js is y-up, origin-center.
    const rawX = (0.5 - tipLm.x) * SCENE_WIDTH;
    const rawY = -(tipLm.y - 0.5) * SCENE_HEIGHT;
    const rawZ = estimateDepth(landmarks);

    this.last = {
      tip: {
        x: this.fx.filter(rawX, nowMs),
        y: this.fy.filter(rawY, nowMs),
        z: this.fz.filter(rawZ, nowMs),
      },
      pinching: this.pinch.update(landmarks),
      present: true,
    };
    return this.last;
  }
}
