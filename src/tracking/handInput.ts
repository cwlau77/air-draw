import type { Landmark } from "./handTracker";
import type { HandInput } from "./types";
import { PinchDetector } from "./gestures";
import { OneEuroFilter } from "./smoothing";
import { estimateDepth } from "./depth";
import { LM_THUMB_TIP, LM_INDEX_TIP, SCENE_WIDTH, SCENE_HEIGHT } from "../config";

export class HandInputSource {
  private pinch = new PinchDetector();
  private fx = new OneEuroFilter();
  private fy = new OneEuroFilter();
  private fz = new OneEuroFilter();
  private last: HandInput = {
    tip: { x: 0, y: 0, z: 0 },
    pinching: false,
    drawing: false,
    present: false,
  };

  update(landmarks: Landmark[] | null, nowMs: number): HandInput {
    if (!landmarks) {
      // Reset filters so the hand reappearing elsewhere does not glide across the gap.
      this.fx.reset();
      this.fy.reset();
      this.fz.reset();
      this.last = { tip: this.last.tip, pinching: this.pinch.update(null, nowMs), drawing: false, present: false };
      return this.last;
    }

    // Draw from the midpoint of thumb tip and index tip, not the index tip alone:
    // pinching converges both fingers ON this point, so it barely moves during the
    // gesture. Using the index tip made every stroke start with an inward drag hook.
    const thumbLm = landmarks[LM_THUMB_TIP];
    const indexLm = landmarks[LM_INDEX_TIP];
    const tipX = (thumbLm.x + indexLm.x) / 2;
    const tipY = (thumbLm.y + indexLm.y) / 2;

    // Mirroring convention: the video and overlay are mirrored via CSS, so the scene
    // mapping compensates here with (0.5 - x). MediaPipe is origin-top-left in [0,1];
    // three.js is y-up, origin-center.
    const rawX = (0.5 - tipX) * SCENE_WIDTH;
    const rawY = -(tipY - 0.5) * SCENE_HEIGHT;
    const rawZ = estimateDepth(landmarks);

    // update() must run before isDrawing is read below: isDrawing reflects the state
    // update() just computed, and object-literal fields evaluate top to bottom, so
    // hoisting this call keeps that dependency explicit instead of relying on literal
    // property order (which a future "cosmetic" reordering could silently break).
    const pinching = this.pinch.update(landmarks, nowMs);

    this.last = {
      tip: {
        x: this.fx.filter(rawX, nowMs),
        y: this.fy.filter(rawY, nowMs),
        z: this.fz.filter(rawZ, nowMs),
      },
      pinching,
      drawing: this.pinch.isDrawing,
      present: true,
    };
    return this.last;
  }
}
