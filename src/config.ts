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
/** Fingertip landmarks used for fist detection: index, middle, ring, pinky tips. */
export const LM_FINGERTIPS = [8, 12, 16, 20] as const;

/** Engage below this ratio. Measured (airDrawDiag, 8392 samples): open-hand minimum
 *  is 0.254, only 0.004 above the old 0.25 — almost no margin against an accidental
 *  engage. 0.22 restores 0.034 of margin below that floor. Both hands still engage
 *  easily while genuinely pinched (left p5 0.111, right p5 0.057). Assumes
 *  PINCH_MEDIAN_WINDOW is filtering the ratio first — if that window is ever reduced
 *  to 1, this must be widened again. */
export const PINCH_ON = 0.22;
/** Release past this ratio (subject to debounce below). Measured: the LEFT hand is
 *  the binding constraint — its pinched distribution sits higher and wider than the
 *  right's, with p95 0.381, which was ABOVE the old 0.33 threshold (so ~5% of left-hand
 *  drawing frames were already trying to release, surviving only on debounce). 0.40
 *  clears that p95 with the smallest margin that does so — release stickiness was a
 *  prior complaint at 0.50, so this is deliberately not higher. Any future retune of
 *  this value must clear the LEFT hand's pinched distribution, not the right's, since
 *  right pinched p95 (0.285) is comfortably lower. If PINCH_MEDIAN_WINDOW is ever
 *  reduced to 1, this must be widened again. */
export const PINCH_OFF = 0.4;

/** Ratio must stay above PINCH_OFF this long before the pinch releases. A measured
 *  tracking glitch spiked the ratio for ~133ms; this bridges it with margin. Costs
 *  nothing visually — drawing already stops the instant PINCH_OFF is crossed, so this
 *  only delays the decision to END the stroke, not point recording. Time-based, not
 *  frame-based: detect() returns cached landmarks on stale frames, so a frame counter
 *  would count duplicate samples. */
export const PINCH_RELEASE_DELAY_MS = 150;

/** Above this ratio the hand is unambiguously open, so release immediately with no
 *  debounce. Measured: the LEFT hand's pinched max was 0.497, a whisker under the old
 *  0.5 hard-release — a spike could nearly trigger an instant release mid-stroke. 0.58
 *  sits above that worst pinched spike so a glitch cannot instant-release mid-stroke,
 *  while remaining well below a genuinely open hand (left open p5 0.372, right open p5
 *  0.314). As with PINCH_OFF, the left hand is the binding constraint here. Assumes
 *  PINCH_MEDIAN_WINDOW is filtering the ratio first — if that window is ever reduced
 *  to 1, this must be widened again. */
export const PINCH_RELEASE_HARD = 0.58;

/**
 * Number of recent pinch-ratio samples used for the median that thresholding sees.
 * Motion makes individual samples spike briefly (measured up to 0.73 while genuinely
 * pinched, against a median of ~0.14). Those excursions are impulsive, so a median
 * rejects them outright where an average would be dragged toward them. Odd values only.
 */
export const PINCH_MEDIAN_WINDOW = 5;

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
 *
 * Z_SCALE was raised from 0.35: at that value the effective depth travel was only
 * about 1 scene unit against scene extents of roughly 7.5 (height) x 9.9 (width),
 * so drawing felt geometrically shallow.
 *
 * Z_REF = 5.2 is the measured median of depthRaw (1/palmWidth) at the user's natural
 * drawing distance (airDrawDiag, 8392 samples: depthRaw p50 5.2158), replacing the
 * original guess of 7.0. Centering on the measured median puts z near zero at rest
 * and makes depth travel symmetric: push toward the camera for positive z, pull back
 * for negative. With this value the expected range is roughly -1.9 to +1.4 (from
 * measured depthRaw p5 3.41 and p95 7.59), which no longer clips against Z_MIN/Z_MAX
 * the way the old Z_REF=7.0 did (measured z was hitting both the -3 and +3 clamps,
 * with p95 2.8753 and a max of exactly 3.0000).
 */
export const Z_REF = 5.2;
export const Z_SCALE = 0.8;
export const Z_MIN = -3;
export const Z_MAX = 3;

/**
 * Lower bound on measured palm width before it is inverted for depth. Measured p5 is
 * 0.1317 and the plausible minimum for a real hand is far above this floor, so it only
 * catches tracking collapses — where palmWidth fell to 0.0139 and 1/palmWidth exploded
 * to 71.8 against a p95 of 7.6.
 */
export const PALM_WIDTH_MIN = 0.04;

/** Samples used for the median that rejects impulsive depth spikes. Odd values only. */
export const Z_MEDIAN_WINDOW = 5;

/**
 * Fist engages below FIST_ON and releases above FIST_OFF. Measured across both hands:
 * a fist never exceeds 1.0031 and a non-fist hand (open or pinching) never drops below
 * 2.5115, so these sit at the geometric middle of that gap with a ~1.4x margin on each
 * side. The left hand is the binding constraint, as it is for pinch.
 */
export const FIST_ON = 1.4;
export const FIST_OFF = 1.8;

/** Samples for the median that rejects impulsive fist-ratio spikes. Odd values only. */
export const FIST_MEDIAN_WINDOW = 5;

/** Preallocated capacity for the in-progress line. */
export const MAX_STROKE_POINTS = 5000;
/** Minimum spacing between recorded points; smaller = denser, jitterier geometry. */
export const MIN_POINT_DISTANCE = 0.02;
/** Finished-stroke geometry. */
export const TUBE_RADIUS = 0.04;
export const TUBE_SEGMENTS_PER_POINT = 4;
export const TUBE_RADIAL_SEGMENTS = 8;
export const STROKE_COLOR = 0xffcc33;

/** Selectable stroke colours. Six is enough to distinguish strokes without a picker. */
export const STROKE_PALETTE = [
  0xffcc33, // amber (default, matches the original STROKE_COLOR)
  0xff5566, // red
  0x44ddaa, // green
  0x4499ff, // blue
  0xcc66ff, // violet
  0xffffff, // white
] as const;

/** Selectable brush radii, small to large. TUBE_RADIUS (0.04) is the default middle value. */
export const STROKE_RADII = [0.02, 0.04, 0.08] as const;

/**
 * Actions retained for undo. Erased strokes are kept alive (removed from the scene but
 * not disposed) until their action falls off the end, so this bounds how much erased
 * geometry can accumulate over a session.
 */
export const HISTORY_DEPTH = 20;

/**
 * A stroke is erased when the fingertip comes within this distance of any of its
 * recorded points. Scene units — compare against SCENE_HEIGHT (~7.5) for a sense of
 * scale. Generous enough to catch a stroke without demanding precision, small enough
 * not to sweep up neighbours.
 */
export const ERASE_RADIUS = 0.35;

/**
 * Bloom. These values were measured in a spike on the target machine, not estimated.
 *
 * BLOOM_THRESHOLD is the load-bearing one: at 0.0 every pixel blooms, strokes saturate
 * to white and both colour and tube form are lost — the effect reads as unusable mush.
 * At 0.75 only the bright core blooms and the stroke keeps its colour and shading.
 * Do not lower it without looking at the result.
 */
export const BLOOM_STRENGTH = 0.45;
export const BLOOM_RADIUS = 0.4;
export const BLOOM_THRESHOLD = 0.75;

/**
 * How brightly a stroke emits its own colour. Paired with BLOOM_THRESHOLD: raising this
 * without raising the threshold pushes strokes toward white.
 */
export const STROKE_EMISSIVE_INTENSITY = 0.8;

/**
 * Cursor size as a multiple of the selected brush radius. The cursor takes the stroke's
 * exact colour and emissive treatment, so size is the only thing distinguishing it from
 * a drawn dot — keep this comfortably above 1.
 */
export const CURSOR_RADIUS_SCALE = 2.5;
