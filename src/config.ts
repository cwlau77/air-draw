/** Requested webcam resolution. */
export const VIDEO_WIDTH = 640;
export const VIDEO_HEIGHT = 480;

/** MediaPipe asset paths (served from public/). */
export const WASM_PATH = "/wasm";
export const MODEL_PATH = "/models/hand_landmarker.task";

/**
 * Chrome-on-macOS only (spec §4), so this is hardcoded rather than detected.
 * If tracking behaves strangely, flip to "CPU" to isolate the delegate as the cause.
 */
export const DELEGATE = "GPU" as const;

/** Landmark indices we rely on (PLAN.md §5 M2). */
export const LM_THUMB_TIP = 4;
export const LM_INDEX_TIP = 8;
export const LM_WRIST = 0;
export const LM_INDEX_MCP = 5;
export const LM_PINKY_MCP = 17;

/** Pinch engages below this ratio. */
export const PINCH_ON = 0.26;
/** Pinch releases above this ratio. Deliberately higher than PINCH_ON (hysteresis). */
export const PINCH_OFF = 0.30;

/** Scene extents the hand maps into. Roughly 4:3 to match the video. */
export const SCENE_WIDTH = 8;
export const SCENE_HEIGHT = 6;

export const CAMERA_FOV = 50;
export const CAMERA_START_Z = 8;

/** One Euro filter. Lower minCutoff = smoother at rest; higher beta = more responsive when fast. */
export const ONE_EURO_MIN_CUTOFF = 1.0;
export const ONE_EURO_BETA = 0.007;
export const ONE_EURO_D_CUTOFF = 1.0;

/**
 * Depth from apparent palm width (distance between landmarks 5 and 17).
 * z_raw = 1 / palmWidth, then re-centered on Z_REF and scaled.
 * This is an approximation, not metric depth (PLAN.md §5 M4).
 */
export const Z_REF = 7.0;
export const Z_SCALE = 0.35;
export const Z_MIN = -3;
export const Z_MAX = 3;
