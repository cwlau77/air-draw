export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * The ONLY thing the tracking layer exposes to the rest of the app.
 * The scene layer must never see landmarks or anything MediaPipe-shaped.
 * A future input source can implement this same shape and be swapped in.
 */
export interface HandInput {
  /** Smoothed position of the midpoint between the thumb tip and index tip, in scene
   *  coordinates. Not the index fingertip alone: pinching converges both fingers on
   *  this point, so any input source implementing this contract must report the
   *  midpoint, not a single fingertip, or drawn strokes will hook toward the index
   *  finger's approach path at gesture start. */
  tip: Vec3;
  /** True while the stroke is alive (release is debounced). */
  pinching: boolean;
  /** True only while points should be appended; goes false as soon as the fingers
   *  begin to open, so the release gesture is not drawn. */
  drawing: boolean;
  present: boolean;
}
