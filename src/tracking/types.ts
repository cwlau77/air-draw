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
  /** Smoothed index-fingertip position in scene coordinates. */
  tip: Vec3;
  /** True while the stroke is alive (release is debounced). */
  pinching: boolean;
  /** True only while points should be appended; goes false as soon as the fingers
   *  begin to open, so the release gesture is not drawn. */
  drawing: boolean;
  present: boolean;
}
