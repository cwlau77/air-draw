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
