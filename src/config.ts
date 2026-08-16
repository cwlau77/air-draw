/** Requested webcam resolution. */
export const VIDEO_WIDTH = 640;
export const VIDEO_HEIGHT = 480;

/**
 * MediaPipe normalises x by frame WIDTH and y by frame HEIGHT, so on a non-square
 * frame one x-unit is physically longer than one y-unit. Scale x-deltas by this
 * before any distance calculation, or every measured distance depends on the
 * ORIENTATION of the vector — which made the pinch ratio swing with wrist rotation
 * and behave differently for left and right hands.
 */
export const LANDMARK_ASPECT = VIDEO_WIDTH / VIDEO_HEIGHT;

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

/** Engage below this ratio. Measured pinched ratios reach at most 0.171 across both
 *  hands; open hands never read below 0.92. Sits about 2x above the worst pinched value. */
export const PINCH_ON = 0.35;
/** Release past this ratio (subject to debounce below). Roughly the geometric midpoint
 *  of the measured pinched/open gap, so low-end glitch spikes (observed up to 0.28) no
 *  longer cross it at all. */
export const PINCH_OFF = 0.5;

/** Ratio must stay above PINCH_OFF this long before the pinch releases. A measured
 *  tracking glitch spiked the ratio for ~133ms; this bridges it with margin. Costs
 *  nothing visually — drawing already stops the instant PINCH_OFF is crossed, so this
 *  only delays the decision to END the stroke, not point recording. Time-based, not
 *  frame-based: detect() returns cached landmarks on stale frames, so a frame counter
 *  would count duplicate samples. */
export const PINCH_RELEASE_DELAY_MS = 150;

/** Above this ratio the hand is unambiguously open, so release immediately with no
 *  debounce. Above the worst observed glitch spike (0.7047) but below the lowest
 *  measured open reading (0.9227), so a deliberate open hand still stops drawing at
 *  once while a glitch does not. */
export const PINCH_RELEASE_HARD = 0.8;

/** If the video has not advanced for this long, treat the hand as lost rather than
 *  returning stale landmarks forever. Guards against the webcam being unplugged or
 *  taken by another app, which would otherwise freeze the cursor and never end the
 *  active stroke. */
export const STALE_FRAME_TIMEOUT_MS = 400;

export const CAMERA_FOV = 50;
export const CAMERA_START_Z = 8;

/**
 * Scene extents the hand maps into, derived from the camera frustum rather than
 * guessed, so a fingertip at the edge of the video maps to the edge of the view.
 * Exact at the z=0 plane; a sphere displaced in z still shifts slightly under
 * perspective, which is expected and is real depth feedback, not an error.
 */
export const SCENE_HEIGHT =
  2 * CAMERA_START_Z * Math.tan((CAMERA_FOV * Math.PI) / 360);
export const SCENE_WIDTH = SCENE_HEIGHT * (VIDEO_WIDTH / VIDEO_HEIGHT);

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

/** Preallocated capacity for the in-progress line. */
export const MAX_STROKE_POINTS = 5000;
/** Minimum spacing between recorded points; smaller = denser, jitterier geometry. */
export const MIN_POINT_DISTANCE = 0.02;
/** Finished-stroke geometry. */
export const TUBE_RADIUS = 0.04;
export const TUBE_SEGMENTS_PER_POINT = 4;
export const TUBE_RADIAL_SEGMENTS = 8;
export const STROKE_COLOR = 0xffcc33;
