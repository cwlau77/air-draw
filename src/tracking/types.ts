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
  pinching: boolean;
  present: boolean;
}
