import type { Landmark } from "./handTracker";
import type { HandInput } from "./types";
import { PinchDetector, FistDetector } from "./gestures";
import { OneEuroFilter } from "./smoothing";
import { estimateDepth } from "./depth";
import { median } from "./median";
import { LM_THUMB_TIP, LM_INDEX_TIP, SCENE_WIDTH, SCENE_HEIGHT, Z_MEDIAN_WINDOW } from "../config";

export class HandInputSource {
  private pinch = new PinchDetector();
  private fist = new FistDetector();
  private fx = new OneEuroFilter();
  private fy = new OneEuroFilter();
  private fz = new OneEuroFilter();
  private zWindow: number[] = [];
  private last: HandInput = {
    tip: { x: 0, y: 0, z: 0 },
    pinching: false,
    drawing: false,
    erasing: false,
    present: false,
  };

  /** Median-filtered pinch ratio thresholding actually used, or null before any sample.
   *  Diagnostics-only: deliberately not part of HandInput, so the scene layer never sees it. */
  get smoothedPinchRatio(): number | null {
    return this.pinch.smoothedRatio;
  }

  get smoothedFistRatio(): number | null {
    return this.fist.smoothedRatio;
  }

  update(landmarks: Landmark[] | null, nowMs: number): HandInput {
    if (!landmarks) {
      // Reset filters so the hand reappearing elsewhere does not glide across the gap.
      this.fx.reset();
      this.fy.reset();
      this.fz.reset();
      this.zWindow.length = 0;
      this.fist.update(null);
      this.last = {
        tip: this.last.tip,
        pinching: this.pinch.update(null, nowMs),
        drawing: false,
        erasing: false,
        present: false,
      };
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

    // Depth is a 1/x quantity, so a brief tracking collapse (palm width near zero)
    // explodes into an impulsive z spike even after PALM_WIDTH_MIN floors the
    // denominator. Median-filter before the One Euro filter sees it: a median rejects
    // that kind of spike outright, where an average (or the One Euro filter alone)
    // would be dragged toward it.
    this.zWindow.push(rawZ);
    if (this.zWindow.length > Z_MEDIAN_WINDOW) this.zWindow.shift();
    const medianZ = median(this.zWindow);

    // update() must run before isDrawing is read below: isDrawing reflects the state
    // update() just computed, and object-literal fields evaluate top to bottom, so
    // hoisting this call keeps that dependency explicit instead of relying on literal
    // property order (which a future "cosmetic" reordering could silently break).
    const pinching = this.pinch.update(landmarks, nowMs);
    const drawing = this.pinch.isDrawing;
    const erasing = this.fist.update(landmarks);

    this.last = {
      tip: {
        x: this.fx.filter(rawX, nowMs),
        y: this.fy.filter(rawY, nowMs),
        z: this.fz.filter(medianZ, nowMs),
      },
      // Fist takes strict precedence. In a closed fist the thumb lies across the curled
      // fingers, so thumb-to-index distance can fall below PINCH_ON and the pinch would
      // engage too — every erase gesture would leave a short spurious stroke behind.
      pinching: erasing ? false : pinching,
      drawing: erasing ? false : drawing,
      erasing,
      present: true,
    };
    return this.last;
  }
}
