# Air-Draw MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser app where the user draws strokes in 3D space by pinching in front of their webcam, and orbits a Three.js camera to confirm the strokes occupy real depth.

**Architecture:** Three stacked, absolutely-positioned layers fill the window: a mirrored `<video>` backdrop, a 2D debug-overlay canvas, and a transparent WebGL canvas. A single `requestAnimationFrame` loop in `main.ts` drives everything. The `tracking/` layer is the only code that touches MediaPipe; it reduces 21 raw landmarks to one plain object, `HandInput { tip, pinching, present }`, and the `scene/` layer consumes only that. This boundary is load-bearing — it is what lets a future input source be swapped in, and it keeps gesture logic independent of the webcam.

**Tech Stack:** Vite, TypeScript, `@mediapipe/tasks-vision` (HandLandmarker), `three` (+ `OrbitControls`). No other runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-16-air-draw-mvp-scope-design.md` (approved scope hardening) and `PLAN.md` (original handoff spec — authoritative for milestones, gotchas, and the out-of-scope list). Where they disagree, the scope design wins. **Executors must read both before starting.**

---

## Global Constraints

These apply to every task. Do not restate, do not violate.

- **Dependencies are frozen at four:** `vite`, `typescript`, `@mediapipe/tasks-vision`, `three`. Adding any other runtime or dev dependency requires stopping and asking the user first. This is a hard constraint from `PLAN.md` §3, not a style preference.
- **No automated test framework.** Verification is manual and visual in the browser (spec §8). Do not install vitest/jest or write `.test.ts` files.
- **Stop after every task.** Each task maps to a milestone that only a human watching a webcam can verify. Do not begin task N+1 until the user confirms task N works. (`PLAN.md` §8, spec §8.)
- **Target is Chrome on macOS only** (spec §4). Write no cross-browser fallbacks and no runtime GPU→CPU delegate detection.
- **Language:** all files in `src/` are `.ts`. The `.js` extensions in `PLAN.md` §4's tree are illustrative of structure only (spec §7.2).
- **The mirroring convention, applied in all three places** (spec §7.1): the video is mirrored via CSS `transform: scaleX(-1)`; the overlay canvas is mirrored identically; the scene mapping compensates with `x_scene = (0.5 - lm.x) * SCENE_WIDTH`. Reproduce this sentence as a comment at each of the three sites.
- **Out of scope — do not build, even as a small addition:** color selection, brush sizes, erasing, undo, AI recognition or 3D generation, hand-gesture camera control, two-handed interaction, save/load/export, networking, mobile/responsive layout, auth/backend/database.
- **Every stroke retains its raw 3D points** alongside baked geometry — a future export/recognition step needs them.

---

## File Structure

| File | Responsibility |
|---|---|
| `index.html` | The three stacked layers, the error element, the two UI buttons |
| `src/main.ts` | Bootstrap + the single animation loop. The **only** place tracking output is wired into the scene. |
| `src/config.ts` | Every tunable constant in one place, so Task 8's tuning pass edits one file |
| `src/camera.ts` | `getUserMedia`, returns a playing `<video>`; throws typed errors |
| `src/tracking/types.ts` | `HandInput` — the contract between the two layers |
| `src/tracking/handTracker.ts` | MediaPipe init + per-frame detect. Only file importing `@mediapipe/*`. |
| `src/tracking/gestures.ts` | Pinch ratio + hysteresis state machine (pure) |
| `src/tracking/smoothing.ts` | One Euro filter (pure) |
| `src/tracking/depth.ts` | Apparent-palm-width → z estimate (pure) |
| `src/tracking/handInput.ts` | Composes the four above into one `HandInput` per frame |
| `src/scene/setup.ts` | Renderer, camera, lights, OrbitControls, resize |
| `src/scene/stroke.ts` | One stroke: live geometry, finalize, dispose |
| `src/scene/strokeManager.ts` | Active vs. finished strokes, `clear()` |
| `src/ui/errorDisplay.ts` | Shows the four fatal-error messages |
| `src/ui/debugOverlay.ts` | 2D canvas: landmark dots, pinch ratio, fps |
| `src/ui/controls.ts` | Clear button, debug toggle |

`public/models/hand_landmarker.task` and `public/wasm/` are committed assets, never hotlinked (`PLAN.md` §5 M1).

---

## Task 1: Project skeleton and mirrored webcam feed

Implements `PLAN.md` M0 and spec §2 (camera failure cases).

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `.gitignore`, `index.html`
- Create: `src/main.ts`, `src/config.ts`, `src/camera.ts`, `src/ui/errorDisplay.ts`, `src/style.css`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `startCamera(): Promise<HTMLVideoElement>` from `camera.ts`; `showFatalError(message: string): void` and `ERROR_MESSAGES` from `errorDisplay.ts`; the `#video`, `#overlay`, `#scene`, `#error` DOM elements

- [ ] **Step 1: Scaffold the project and install the four dependencies**

```bash
cd /Users/camlau/Projects/air-draw
npm init -y
npm install three @mediapipe/tasks-vision
npm install -D vite typescript @types/three
```

`@types/three` is bundled type definitions for a dependency already approved, not a fifth dependency.

- [ ] **Step 2: Write the config files**

`.gitignore`:
```
node_modules/
dist/
.DS_Store
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173 },
});
```

Replace the `scripts` block in `package.json` with:
```json
"scripts": {
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview"
}
```

Also add `"type": "module"` to `package.json`.

- [ ] **Step 3: Write `index.html` with the three stacked layers**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Air-Draw</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <div id="stage">
      <!-- Mirroring convention: the video is mirrored via CSS transform: scaleX(-1);
           the overlay canvas is mirrored identically; the scene mapping compensates
           with x_scene = (0.5 - lm.x) * SCENE_WIDTH. -->
      <video id="video" autoplay playsinline muted></video>
      <canvas id="overlay"></canvas>
      <canvas id="scene"></canvas>
      <div id="error" hidden></div>
      <div id="controls">
        <button id="clear">Clear all</button>
        <button id="toggle-debug">Debug: on</button>
      </div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`autoplay`, `playsinline`, and `muted` are all required or Chrome refuses to play the stream (`PLAN.md` §5 M0).

- [ ] **Step 4: Write `src/style.css`**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: #111;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

#stage { position: relative; width: 100vw; height: 100vh; }

#video, #overlay, #scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* Mirroring convention: video and overlay are mirrored identically. */
#video { object-fit: cover; transform: scaleX(-1); }
#overlay { transform: scaleX(-1); pointer-events: none; }
#scene { pointer-events: auto; }

#error {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 2rem;
  background: #111;
  color: #eee;
  font-size: 1rem;
  text-align: center;
  z-index: 10;
}
#error[hidden] { display: none; }

#controls {
  position: absolute;
  bottom: 1rem;
  left: 1rem;
  display: flex;
  gap: 0.5rem;
  z-index: 5;
}
#controls button {
  padding: 0.5rem 0.75rem;
  border: 1px solid #555;
  border-radius: 4px;
  background: #222;
  color: #eee;
  font: inherit;
  cursor: pointer;
}
#controls button:hover { background: #333; }
```

- [ ] **Step 5: Write `src/config.ts` with the constants this task needs**

Every tunable lives here so Task 8 edits one file.

```ts
/** Requested webcam resolution. */
export const VIDEO_WIDTH = 640;
export const VIDEO_HEIGHT = 480;
```

- [ ] **Step 6: Write `src/ui/errorDisplay.ts`**

The four fatal cases from spec §2. Plain text, no retry button, no onboarding screen.

```ts
export const ERROR_MESSAGES = {
  permissionDenied: "Camera access is required. Allow it in your browser and reload.",
  noCamera: "No camera found. Connect one and reload.",
  modelFailed: "Hand tracking failed to load. Reload to try again.",
  noWebGL: "This browser can't render 3D graphics.",
} as const;

export function showFatalError(message: string): void {
  const el = document.querySelector<HTMLDivElement>("#error");
  if (!el) throw new Error("#error element missing from index.html");
  el.textContent = message;
  el.hidden = false;
  console.error("[air-draw] fatal:", message);
}
```

- [ ] **Step 7: Write `src/camera.ts`**

Maps the two `getUserMedia` rejection names to our messages, and resolves only once the video is actually playing — otherwise `videoWidth` is still 0 when the loop starts.

```ts
import { VIDEO_WIDTH, VIDEO_HEIGHT } from "./config";
import { ERROR_MESSAGES } from "./ui/errorDisplay";

/** Thrown with a user-facing message already chosen. */
export class CameraError extends Error {}

export async function startCamera(): Promise<HTMLVideoElement> {
  const video = document.querySelector<HTMLVideoElement>("#video");
  if (!video) throw new Error("#video element missing from index.html");

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
    });
  } catch (err) {
    const name = (err as DOMException)?.name;
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      throw new CameraError(ERROR_MESSAGES.noCamera);
    }
    throw new CameraError(ERROR_MESSAGES.permissionDenied);
  }

  video.srcObject = stream;
  await video.play();

  // videoWidth stays 0 until the first frame arrives; the loop needs real dimensions.
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await new Promise<void>((resolve) => {
      video.addEventListener("loadeddata", () => resolve(), { once: true });
    });
  }
  return video;
}
```

- [ ] **Step 8: Write `src/main.ts`**

```ts
import "./style.css";
import { startCamera, CameraError } from "./camera";
import { showFatalError } from "./ui/errorDisplay";

async function boot(): Promise<void> {
  try {
    const video = await startCamera();
    console.log("[air-draw] camera ready", video.videoWidth, "x", video.videoHeight);
  } catch (err) {
    if (err instanceof CameraError) {
      showFatalError(err.message);
      return;
    }
    throw err;
  }
}

void boot();
```

- [ ] **Step 9: Run the app**

```bash
npm run dev
```

Open `http://localhost:5173` in Chrome and allow camera access when prompted.

- [ ] **Step 10: Verify in browser — STOP and confirm with the user**

All four must hold:
1. You see yourself, **mirrored** (raise your right hand; it appears on the right side of the screen).
2. The feed is smooth, not stuttering.
3. The console logs `[air-draw] camera ready 640 x 480`.
4. Reload, and this time **deny** camera permission — the plain message "Camera access is required. Allow it in your browser and reload." covers the screen instead of a broken video element.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: vite skeleton with mirrored webcam feed and camera error handling"
```

---

## Task 2: MediaPipe hand tracking and debug overlay

Implements `PLAN.md` M1 and spec §2 (model-load failure), §4 (hardcoded delegate).

**Files:**
- Create: `src/tracking/handTracker.ts`, `src/ui/debugOverlay.ts`
- Create: `public/models/hand_landmarker.task`, `public/wasm/` (downloaded assets)
- Modify: `src/main.ts`, `src/config.ts`

**Interfaces:**
- Consumes: `startCamera()`, `showFatalError()`, `ERROR_MESSAGES` from Task 1
- Produces: `createHandTracker(): Promise<HandTracker>` where `HandTracker` has `detect(video: HTMLVideoElement, nowMs: number): Landmark[] | null`; `Landmark = { x: number; y: number; z: number }`; `DebugOverlay` with `resize()`, `draw(landmarks, info)`, `setVisible(v)`

- [ ] **Step 1: Download the model and WASM assets locally**

Committed, not hotlinked, so the app works offline (`PLAN.md` §5 M1).

```bash
mkdir -p public/models public/wasm
curl -L -o public/models/hand_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
cp node_modules/@mediapipe/tasks-vision/wasm/* public/wasm/
ls -la public/models public/wasm
```

Expected: `hand_landmarker.task` is roughly 7-8 MB, and `public/wasm/` contains `.wasm` and `.js` files. If the `.task` file is only a few hundred bytes it is an error page — stop and report.

- [ ] **Step 2: Add tracking constants to `src/config.ts`**

Append:
```ts
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
```

- [ ] **Step 3: Write `src/tracking/handTracker.ts`**

This is the only file in the codebase permitted to import from `@mediapipe/*`.

```ts
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { WASM_PATH, MODEL_PATH, DELEGATE } from "../config";
import { ERROR_MESSAGES } from "../ui/errorDisplay";

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/** Thrown with a user-facing message already chosen. */
export class TrackerError extends Error {}

export interface HandTracker {
  /** Returns 21 landmarks, or null if no hand is present or the frame is stale. */
  detect(video: HTMLVideoElement, nowMs: number): Landmark[] | null;
}

export async function createHandTracker(): Promise<HandTracker> {
  let landmarker: HandLandmarker;
  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: DELEGATE },
      runningMode: "VIDEO",
      numHands: 1,
    });
  } catch (err) {
    console.error("[air-draw] landmarker init failed", err);
    throw new TrackerError(ERROR_MESSAGES.modelFailed);
  }

  // detectForVideo throws if the timestamp does not strictly increase (PLAN.md §6),
  // so skip frames the video has not advanced past.
  let lastVideoTime = -1;

  return {
    detect(video, nowMs) {
      if (video.currentTime === lastVideoTime) return null;
      lastVideoTime = video.currentTime;

      const result = landmarker.detectForVideo(video, nowMs);
      const hand = result.landmarks[0];
      return hand && hand.length > 0 ? hand : null;
    },
  };
}
```

- [ ] **Step 4: Write `src/ui/debugOverlay.ts`**

The overlay canvas is mirrored in CSS, so landmarks are drawn in raw normalized coordinates and the CSS mirror aligns them with the mirrored video. Text would come out backwards under that mirror, so it is drawn un-mirrored via a local transform flip.

```ts
export interface DebugInfo {
  fps: number;
  pinchRatio: number | null;
  pinching: boolean;
}

export class DebugOverlay {
  private ctx: CanvasRenderingContext2D;
  private visible = true;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable for overlay canvas");
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.canvas.hidden = !v;
  }

  isVisible(): boolean {
    return this.visible;
  }

  draw(landmarks: { x: number; y: number }[] | null, info: DebugInfo): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.visible) return;

    // Mirroring convention: this canvas is mirrored in CSS identically to the video,
    // so normalized landmark coords map directly with no flip here.
    if (landmarks) {
      ctx.fillStyle = "#0f0";
      for (const lm of landmarks) {
        ctx.beginPath();
        ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Text must be un-mirrored or it renders backwards under the CSS flip.
    ctx.save();
    ctx.setTransform(-1, 0, 0, 1, canvas.width, 0);
    ctx.fillStyle = info.pinching ? "#ff0" : "#eee";
    ctx.font = "14px ui-monospace, monospace";
    const ratio = info.pinchRatio === null ? "--" : info.pinchRatio.toFixed(3);
    ctx.fillText(`fps ${info.fps.toFixed(0)}`, 12, 24);
    ctx.fillText(`pinch ratio ${ratio}`, 12, 44);
    ctx.fillText(`pinching ${info.pinching}`, 12, 64);
    ctx.fillText(landmarks ? "hand: present" : "hand: none", 12, 84);
    ctx.restore();
  }
}
```

- [ ] **Step 5: Rewrite `src/main.ts` with the animation loop**

```ts
import "./style.css";
import { startCamera, CameraError } from "./camera";
import { createHandTracker, TrackerError } from "./tracking/handTracker";
import { DebugOverlay } from "./ui/debugOverlay";
import { showFatalError } from "./ui/errorDisplay";

async function boot(): Promise<void> {
  let video: HTMLVideoElement;
  let tracker: Awaited<ReturnType<typeof createHandTracker>>;

  try {
    video = await startCamera();
    tracker = await createHandTracker();
  } catch (err) {
    if (err instanceof CameraError || err instanceof TrackerError) {
      showFatalError(err.message);
      return;
    }
    throw err;
  }

  const overlayCanvas = document.querySelector<HTMLCanvasElement>("#overlay")!;
  const overlay = new DebugOverlay(overlayCanvas);
  window.addEventListener("resize", () => overlay.resize());

  let lastFrameMs = performance.now();
  let fps = 0;

  function frame(): void {
    requestAnimationFrame(frame);

    const now = performance.now();
    const dt = (now - lastFrameMs) / 1000;
    lastFrameMs = now;
    if (dt > 0) fps = fps * 0.9 + (1 / dt) * 0.1;

    const landmarks = tracker.detect(video, now);
    overlay.draw(landmarks, { fps, pinchRatio: null, pinching: false });
  }

  requestAnimationFrame(frame);
}

void boot();
```

Note `fps` is smoothed and the first second is meaningless because the initial `detectForVideo` call after model load is slow (`PLAN.md` §6).

- [ ] **Step 6: Run and verify in browser — STOP and confirm with the user**

```bash
npm run dev
```

All four must hold:
1. 21 green dots track your hand and stay glued to your fingertips as you move.
2. The dots are on the **same side** as your actual hand — raise your right hand and the dots appear over it, not mirrored to the other side. (This is the single most common bug at this stage; if the dots are on the wrong side, the video and overlay mirrors disagree.)
3. The readout text is legible left-to-right, not backwards.
4. After a couple of seconds, `fps` reads 30 or higher.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: mediapipe hand landmarks with debug overlay"
```

---

## Task 3: Pinch detection with hysteresis

Implements `PLAN.md` M2.

**Files:**
- Create: `src/tracking/gestures.ts`
- Modify: `src/main.ts`, `src/config.ts`

**Interfaces:**
- Consumes: `Landmark` from Task 2; `LM_*` index constants from Task 2
- Produces: `pinchRatio(landmarks: Landmark[]): number`; `class PinchDetector` with `update(landmarks: Landmark[] | null): boolean` and `get isPinching(): boolean`

- [ ] **Step 1: Add pinch constants to `src/config.ts`**

Append. Two separate thresholds — collapsing them to one causes flicker (`PLAN.md` §5 M2).

```ts
/** Pinch engages below this ratio. */
export const PINCH_ON = 0.35;
/** Pinch releases above this ratio. Deliberately higher than PINCH_ON (hysteresis). */
export const PINCH_OFF = 0.45;
```

- [ ] **Step 2: Write `src/tracking/gestures.ts`**

```ts
import type { Landmark } from "./handTracker";
import {
  LM_THUMB_TIP,
  LM_INDEX_TIP,
  LM_WRIST,
  LM_INDEX_MCP,
  PINCH_ON,
  PINCH_OFF,
} from "../config";

function distance(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Thumb-tip-to-index-tip distance, normalized by wrist-to-index-knuckle so the
 * value stays roughly scale-invariant as the hand moves toward or away from the
 * camera. Raw distance alone is useless because it shrinks with distance.
 */
export function pinchRatio(landmarks: Landmark[]): number {
  const reference = distance(landmarks[LM_WRIST], landmarks[LM_INDEX_MCP]);
  if (reference < 1e-6) return Number.POSITIVE_INFINITY;
  return distance(landmarks[LM_THUMB_TIP], landmarks[LM_INDEX_TIP]) / reference;
}

/** Two-threshold state machine. One threshold would flicker at the boundary. */
export class PinchDetector {
  private pinching = false;

  get isPinching(): boolean {
    return this.pinching;
  }

  /** Returns the new pinch state. A null hand always releases. */
  update(landmarks: Landmark[] | null): boolean {
    if (!landmarks) {
      this.pinching = false;
      return false;
    }
    const ratio = pinchRatio(landmarks);
    if (!this.pinching && ratio < PINCH_ON) this.pinching = true;
    else if (this.pinching && ratio > PINCH_OFF) this.pinching = false;
    return this.pinching;
  }
}
```

- [ ] **Step 3: Wire it into `src/main.ts`**

Add the import:
```ts
import { PinchDetector, pinchRatio } from "./tracking/gestures";
```

Declare above `frame()`, next to the `fps` declaration:
```ts
const pinch = new PinchDetector();
```

Replace the two closing lines of `frame()` with:
```ts
    const landmarks = tracker.detect(video, now);
    const pinching = pinch.update(landmarks);
    overlay.draw(landmarks, {
      fps,
      pinchRatio: landmarks ? pinchRatio(landmarks) : null,
      pinching,
    });
```

- [ ] **Step 4: Verify in browser — STOP and confirm with the user**

All three must hold:
1. The live pinch ratio updates as you move your thumb and index finger together and apart.
2. `pinching true` appears (and the text turns yellow) when you pinch, `false` when you release.
3. **Hold your fingers deliberately near the threshold and wiggle slightly.** The state must not rapid-toggle. If it does, the hysteresis gap is too narrow — widen `PINCH_OFF` and note it for Task 8.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: pinch detection with hysteresis"
```

---

## Task 4: Three.js scene overlay

Implements `PLAN.md` M3, and spec §3 (pan disabled), §2 (WebGL failure), §6 (resize).

**Files:**
- Create: `src/scene/setup.ts`
- Modify: `src/main.ts`, `src/config.ts`

**Interfaces:**
- Consumes: `showFatalError()`, `ERROR_MESSAGES` from Task 1
- Produces: `createScene(canvas: HTMLCanvasElement): SceneContext` where `SceneContext = { scene, camera, renderer, controls, render(), resize() }`; `class SceneError`

- [ ] **Step 1: Add scene constants to `src/config.ts`**

Append:
```ts
/** Scene extents the hand maps into. Roughly 4:3 to match the video. */
export const SCENE_WIDTH = 8;
export const SCENE_HEIGHT = 6;

export const CAMERA_FOV = 50;
export const CAMERA_START_Z = 8;
```

- [ ] **Step 2: Write `src/scene/setup.ts`**

Pan is disabled deliberately (spec §3): the scene has no ground plane and no reset control, so panning strands the user in empty space. Do not remove this line in a later refactor.

```ts
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CAMERA_FOV, CAMERA_START_Z } from "../config";
import { ERROR_MESSAGES } from "../ui/errorDisplay";

/** Thrown with a user-facing message already chosen. */
export class SceneError extends Error {}

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  render(): void;
  resize(): void;
}

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (err) {
    console.error("[air-draw] WebGL init failed", err);
    throw new SceneError(ERROR_MESSAGES.noWebGL);
  }

  renderer.setClearColor(0x000000, 0); // transparent: the video shows through
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    1000,
  );
  camera.position.set(0, 0, CAMERA_START_Z);

  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const dir = new THREE.DirectionalLight(0xffffff, 1.5);
  dir.position.set(2, 3, 4);
  scene.add(dir);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enableZoom = true;
  // Deliberate (spec §3): no ground plane and no reset control, so panning
  // strands the user looking at empty space. Do not re-enable.
  controls.enablePan = false;

  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function render(): void {
    controls.update();
    renderer.render(scene, camera);
  }

  return { scene, camera, renderer, controls, render, resize };
}
```

- [ ] **Step 3: Add a temporary reference cube and wire the scene into `main.ts`**

Add imports:
```ts
import * as THREE from "three";
import { createScene, SceneError } from "./scene/setup";
```

Extend the boot `try` block to build the scene, and the `catch` to handle `SceneError`:
```ts
  let sceneCtx: ReturnType<typeof createScene>;
  try {
    video = await startCamera();
    tracker = await createHandTracker();
    sceneCtx = createScene(document.querySelector<HTMLCanvasElement>("#scene")!);
  } catch (err) {
    if (err instanceof CameraError || err instanceof TrackerError || err instanceof SceneError) {
      showFatalError(err.message);
      return;
    }
    throw err;
  }
```

Add the temporary cube after the scene is created (removed in Task 6):
```ts
  // TEMPORARY reference object — deleted in Task 6 once strokes render.
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x44aaff }),
  );
  sceneCtx.scene.add(cube);
```

Extend the resize listener to cover both layers (spec §6):
```ts
  window.addEventListener("resize", () => {
    overlay.resize();
    sceneCtx.resize();
  });
```

Add as the last line of `frame()`:
```ts
    sceneCtx.render();
```

- [ ] **Step 4: Verify in browser — STOP and confirm with the user**

All five must hold:
1. A blue cube floats over the live video feed, and the video is visible behind and around it.
2. Left-drag orbits the camera around the cube.
3. Scroll wheel zooms in and out.
4. **Right-drag does nothing** — panning is disabled.
5. **Resize the browser window.** The video, the landmark dots, and the cube all stay aligned and correctly proportioned; nothing stretches or drifts out of register.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: transparent three.js scene with orbit and zoom"
```

---

## Task 5: Fingertip to smoothed 3D position

Implements `PLAN.md` M4. This is the hardest task; it produces the `HandInput` contract the whole scene layer depends on.

**Files:**
- Create: `src/tracking/types.ts`, `src/tracking/smoothing.ts`, `src/tracking/depth.ts`, `src/tracking/handInput.ts`
- Modify: `src/main.ts`, `src/config.ts`

**Interfaces:**
- Consumes: `Landmark`, `PinchDetector`, `pinchRatio`, `LM_*` constants, `SCENE_WIDTH`, `SCENE_HEIGHT`
- Produces: `interface Vec3 { x, y, z }`; `interface HandInput { tip: Vec3; pinching: boolean; present: boolean }`; `class OneEuroFilter` with `filter(value, timestampMs): number`; `estimateDepth(landmarks): number`; `class HandInputSource` with `update(landmarks, nowMs): HandInput`

- [ ] **Step 1: Add filter and depth constants to `src/config.ts`**

Append:
```ts
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
```

- [ ] **Step 2: Write `src/tracking/types.ts` — the layer boundary**

```ts
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
```

- [ ] **Step 3: Write `src/tracking/smoothing.ts`**

The One Euro filter smooths hard when the hand is still but stays responsive when it moves fast — a plain moving average cannot do both (`PLAN.md` §5 M4).

```ts
import { ONE_EURO_MIN_CUTOFF, ONE_EURO_BETA, ONE_EURO_D_CUTOFF } from "../config";

/** Smoothing factor for a given cutoff frequency and timestep. */
function alpha(cutoffHz: number, dtSeconds: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSeconds);
}

/** Filters one scalar channel. Use one instance per axis. */
export class OneEuroFilter {
  private lastValue: number | null = null;
  private lastDerivative = 0;
  private lastTimeMs: number | null = null;

  constructor(
    private minCutoff = ONE_EURO_MIN_CUTOFF,
    private beta = ONE_EURO_BETA,
    private dCutoff = ONE_EURO_D_CUTOFF,
  ) {}

  reset(): void {
    this.lastValue = null;
    this.lastDerivative = 0;
    this.lastTimeMs = null;
  }

  filter(value: number, timestampMs: number): number {
    if (this.lastValue === null || this.lastTimeMs === null) {
      this.lastValue = value;
      this.lastTimeMs = timestampMs;
      return value;
    }

    const dt = (timestampMs - this.lastTimeMs) / 1000;
    if (dt <= 0) return this.lastValue;
    this.lastTimeMs = timestampMs;

    // Smooth the speed estimate, then let speed widen the cutoff.
    const derivative = (value - this.lastValue) / dt;
    const aD = alpha(this.dCutoff, dt);
    this.lastDerivative = aD * derivative + (1 - aD) * this.lastDerivative;

    const cutoff = this.minCutoff + this.beta * Math.abs(this.lastDerivative);
    const a = alpha(cutoff, dt);
    this.lastValue = a * value + (1 - a) * this.lastValue;
    return this.lastValue;
  }
}
```

- [ ] **Step 4: Write `src/tracking/depth.ts`**

```ts
import type { Landmark } from "./handTracker";
import { LM_INDEX_MCP, LM_PINKY_MCP, Z_REF, Z_SCALE, Z_MIN, Z_MAX } from "../config";

/**
 * MediaPipe's per-landmark z is relative to the wrist and far too noisy for stroke
 * depth. Apparent palm width is stable instead: a closer hand fills more of the frame.
 * Known limitation (spec §5, PLAN.md §6): this drifts if the user leans toward the
 * camera. That is accepted, not a bug to chase.
 */
export function estimateDepth(landmarks: Landmark[]): number {
  const a = landmarks[LM_INDEX_MCP];
  const b = landmarks[LM_PINKY_MCP];
  const palmWidth = Math.hypot(a.x - b.x, a.y - b.y);
  if (palmWidth < 1e-6) return 0;

  const raw = 1 / palmWidth;
  const z = (raw - Z_REF) * Z_SCALE;
  return Math.min(Z_MAX, Math.max(Z_MIN, z));
}
```

- [ ] **Step 5: Write `src/tracking/handInput.ts`**

This composes tracking into the single boundary object.

```ts
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
```

- [ ] **Step 6: Wire into `main.ts` with a fingertip sphere**

Replace the `PinchDetector` import and instance with:
```ts
import { HandInputSource } from "./tracking/handInput";
import { pinchRatio } from "./tracking/gestures";
```
```ts
  const handInput = new HandInputSource();
```

Add the cursor sphere after the cube:
```ts
  const cursor = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xff4488 }),
  );
  sceneCtx.scene.add(cursor);
```

Replace the tracking lines in `frame()`:
```ts
    const landmarks = tracker.detect(video, now);
    const input = handInput.update(landmarks, now);

    cursor.visible = input.present;
    cursor.position.set(input.tip.x, input.tip.y, input.tip.z);

    overlay.draw(landmarks, {
      fps,
      pinchRatio: landmarks ? pinchRatio(landmarks) : null,
      pinching: input.pinching,
    });
```

- [ ] **Step 7: Verify in browser — STOP and confirm with the user**

All four must hold:
1. A pink sphere sits on your index fingertip and follows it smoothly.
2. Holding your hand still produces a **steady** sphere, not a jittering one.
3. Moving your hand fast, the sphere keeps up without noticeable lag. (Both 2 and 3 together are what the One Euro filter buys; if only one holds, note it for Task 8.)
4. **Orbit to a side view, then push your hand toward and away from the camera.** The sphere visibly travels along the depth axis. This is the core thing the MVP exists to prove.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: smoothed 3d fingertip position with depth estimation"
```

---

## Task 6: Live stroke drawing

Implements `PLAN.md` M5.

**Files:**
- Create: `src/scene/stroke.ts`
- Modify: `src/main.ts`, `src/config.ts`

**Interfaces:**
- Consumes: `Vec3` from Task 5
- Produces: `class Stroke` with `constructor(scene: THREE.Scene)`, `addPoint(p: Vec3): void`, `finalize(): void`, `dispose(): void`, `get pointCount(): number`, `readonly points: Vec3[]`

- [ ] **Step 1: Add stroke constants to `src/config.ts`**

Append:
```ts
/** Preallocated capacity for the in-progress line. */
export const MAX_STROKE_POINTS = 5000;
/** Minimum spacing between recorded points; smaller = denser, jitterier geometry. */
export const MIN_POINT_DISTANCE = 0.02;
/** Finished-stroke geometry. */
export const TUBE_RADIUS = 0.04;
export const TUBE_SEGMENTS_PER_POINT = 4;
export const TUBE_RADIAL_SEGMENTS = 8;
export const STROKE_COLOR = 0xffcc33;
```

- [ ] **Step 2: Write `src/scene/stroke.ts`**

Two distinct geometries by design (`PLAN.md` §5 M5): a cheap preallocated `THREE.Line` while drawing, then one `TubeGeometry` build on release. Do not try to rebuild `Line2` per frame — it uses instanced attributes and either fails silently or leaks.

```ts
import * as THREE from "three";
import type { Vec3 } from "../tracking/types";
import {
  MAX_STROKE_POINTS,
  MIN_POINT_DISTANCE,
  TUBE_RADIUS,
  TUBE_SEGMENTS_PER_POINT,
  TUBE_RADIAL_SEGMENTS,
  STROKE_COLOR,
} from "../config";

export class Stroke {
  /** Raw points are retained deliberately — future export/recognition needs them. */
  readonly points: Vec3[] = [];

  private liveGeometry: THREE.BufferGeometry;
  private liveMaterial: THREE.LineBasicMaterial;
  private liveLine: THREE.Line;
  private positions: Float32Array;
  private finalMesh: THREE.Mesh | null = null;
  private finalized = false;

  constructor(private scene: THREE.Scene) {
    this.positions = new Float32Array(MAX_STROKE_POINTS * 3);
    this.liveGeometry = new THREE.BufferGeometry();
    this.liveGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3),
    );
    this.liveGeometry.setDrawRange(0, 0);
    // THREE.Line ignores linewidth > 1 on essentially every platform. That is fine —
    // thickness comes from the TubeGeometry built in finalize().
    this.liveMaterial = new THREE.LineBasicMaterial({ color: STROKE_COLOR });
    this.liveLine = new THREE.Line(this.liveGeometry, this.liveMaterial);
    this.liveLine.frustumCulled = false;
    this.scene.add(this.liveLine);
  }

  get pointCount(): number {
    return this.points.length;
  }

  /** Appends only if far enough from the previous point. Dense points are jittery and expensive. */
  addPoint(p: Vec3): void {
    if (this.finalized || this.points.length >= MAX_STROKE_POINTS) return;

    const prev = this.points[this.points.length - 1];
    if (prev) {
      const d = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
      if (d < MIN_POINT_DISTANCE) return;
    }

    const i = this.points.length * 3;
    this.positions[i] = p.x;
    this.positions[i + 1] = p.y;
    this.positions[i + 2] = p.z;
    this.points.push({ ...p });

    this.liveGeometry.setDrawRange(0, this.points.length);
    this.liveGeometry.attributes.position.needsUpdate = true;
    this.liveGeometry.computeBoundingSphere();
  }

  /** Builds the final geometry exactly once, then discards the live line. */
  finalize(): void {
    if (this.finalized) return;
    this.finalized = true;

    this.scene.remove(this.liveLine);
    this.liveGeometry.dispose();
    this.liveMaterial.dispose();

    // Fewer than 2 points is a tap, not a stroke — nothing to build.
    if (this.points.length < 2) return;

    const curve = new THREE.CatmullRomCurve3(
      this.points.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    );
    const segments = Math.max(8, this.points.length * TUBE_SEGMENTS_PER_POINT);
    const geometry = new THREE.TubeGeometry(
      curve,
      segments,
      TUBE_RADIUS,
      TUBE_RADIAL_SEGMENTS,
      false,
    );
    const material = new THREE.MeshStandardMaterial({
      color: STROKE_COLOR,
      roughness: 0.4,
      metalness: 0.1,
    });
    this.finalMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.finalMesh);
  }

  /** Frees GPU memory. Scene removal alone leaks (PLAN.md §6). */
  dispose(): void {
    if (!this.finalized) {
      this.scene.remove(this.liveLine);
      this.liveGeometry.dispose();
      this.liveMaterial.dispose();
      this.finalized = true;
    }
    if (this.finalMesh) {
      this.scene.remove(this.finalMesh);
      this.finalMesh.geometry.dispose();
      (this.finalMesh.material as THREE.Material).dispose();
      this.finalMesh = null;
    }
  }
}
```

- [ ] **Step 3: Wire stroke lifecycle into `main.ts` and remove the temporary cube**

Delete the cube block added in Task 4 (the `THREE.Mesh` with `BoxGeometry`) and its `scene.add`.

Add the import:
```ts
import { Stroke } from "./scene/stroke";
```

Declare above `frame()`:
```ts
  let activeStroke: Stroke | null = null;
```

Add to `frame()`, after `cursor.position.set(...)`:
```ts
    if (input.pinching && input.present) {
      if (!activeStroke) activeStroke = new Stroke(sceneCtx.scene);
      activeStroke.addPoint(input.tip);
    } else if (activeStroke) {
      activeStroke.finalize();
      activeStroke = null;
    }
```

- [ ] **Step 4: Verify in browser — STOP and confirm with the user**

All three must hold:
1. Pinching draws a thin yellow trail that follows your fingertip in real time.
2. Releasing the pinch replaces that thin trail with a visibly **thicker, smoother** tube that catches the light.
3. The trail does not stutter or drop frames as it gets long — draw a deliberately long stroke to check.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: live stroke drawing with tube finalization"
```

---

## Task 7: Multiple strokes, clear, and hand-loss handling

Implements `PLAN.md` M6.

**Files:**
- Create: `src/scene/strokeManager.ts`, `src/ui/controls.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Stroke` from Task 6; `HandInput` from Task 5; `DebugOverlay` from Task 2
- Produces: `class StrokeManager` with `update(input: HandInput): void`, `clear(): void`, `get strokeCount(): number`; `initControls(handlers: { onClear(): void; onToggleDebug(): boolean }): void`

- [ ] **Step 1: Write `src/scene/strokeManager.ts`**

The hand-loss rule matters: without it, a hand that vanishes mid-stroke and reappears elsewhere produces one long spurious line across the gap (`PLAN.md` §5 M6).

```ts
import * as THREE from "three";
import { Stroke } from "./stroke";
import type { HandInput } from "../tracking/types";

export class StrokeManager {
  private finished: Stroke[] = [];
  private active: Stroke | null = null;

  constructor(private scene: THREE.Scene) {}

  get strokeCount(): number {
    return this.finished.length;
  }

  /** Consumes only the HandInput contract — knows nothing about MediaPipe. */
  update(input: HandInput): void {
    // Losing the hand always ends the stroke immediately, so a reappearance
    // elsewhere cannot connect across the gap.
    if (!input.present) {
      this.endActive();
      return;
    }

    if (input.pinching) {
      if (!this.active) this.active = new Stroke(this.scene);
      this.active.addPoint(input.tip);
    } else {
      this.endActive();
    }
  }

  private endActive(): void {
    if (!this.active) return;
    this.active.finalize();
    // A stroke of 0 or 1 points built no geometry; drop it rather than retain it.
    if (this.active.pointCount >= 2) this.finished.push(this.active);
    else this.active.dispose();
    this.active = null;
  }

  /** Disposes geometries and materials, not just scene removal (PLAN.md §6). */
  clear(): void {
    this.endActive();
    for (const stroke of this.finished) stroke.dispose();
    this.finished = [];
  }
}
```

- [ ] **Step 2: Write `src/ui/controls.ts`**

```ts
export interface ControlHandlers {
  onClear(): void;
  /** Returns the new visibility state so the label can be updated. */
  onToggleDebug(): boolean;
}

export function initControls(handlers: ControlHandlers): void {
  const clearBtn = document.querySelector<HTMLButtonElement>("#clear");
  const debugBtn = document.querySelector<HTMLButtonElement>("#toggle-debug");
  if (!clearBtn || !debugBtn) throw new Error("control buttons missing from index.html");

  clearBtn.addEventListener("click", () => handlers.onClear());
  debugBtn.addEventListener("click", () => {
    const visible = handlers.onToggleDebug();
    debugBtn.textContent = `Debug: ${visible ? "on" : "off"}`;
  });
}
```

- [ ] **Step 3: Replace the inline stroke logic in `main.ts` with the manager**

Add imports:
```ts
import { StrokeManager } from "./scene/strokeManager";
import { initControls } from "./ui/controls";
```

Delete the `let activeStroke: Stroke | null = null;` declaration and the `Stroke` import, then declare:
```ts
  const strokes = new StrokeManager(sceneCtx.scene);

  initControls({
    onClear: () => strokes.clear(),
    onToggleDebug: () => {
      const next = !overlay.isVisible();
      overlay.setVisible(next);
      return next;
    },
  });
```

Replace the whole `if (input.pinching && input.present) { ... }` block in `frame()` with:
```ts
    strokes.update(input);
```

- [ ] **Step 4: Verify in browser — STOP and confirm with the user**

This is the definition-of-done check from `PLAN.md` §2. All five must hold:
1. Draw **three separate strokes at visibly different depths** (hand close, mid, far). All three persist.
2. Orbit the camera. The three strokes are **genuinely distributed in 3D**, not lying on one flat plane. This is the MVP's whole purpose — be strict here.
3. **Wave your hand out of frame mid-stroke, then bring it back.** No long spurious line connects the two positions.
4. "Clear all" removes every stroke, and drawing still works afterward.
5. The debug toggle hides and shows the overlay, and the button label tracks the state.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: stroke manager with clear and hand-loss handling"
```

---

## Task 8: Tuning pass

Implements `PLAN.md` M7. This is where the app stops feeling like a demo. Budget real time.

**Files:**
- Modify: `src/config.ts` (expected to be the only file changed)

**Interfaces:**
- Consumes: every constant defined in Tasks 1-7
- Produces: no new interfaces — tuned values only

- [ ] **Step 1: Confirm the fps baseline**

With the app running and a hand in frame, let it settle for several seconds and read the overlay. Record the number. If it is below 30, stop and report — that is a performance problem to diagnose, not something tuning constants will fix.

- [ ] **Step 2: Tune one parameter at a time, in this order**

Change **one** value in `src/config.ts`, reload, draw a few strokes, keep or revert. Never change two at once — you will not know which one helped.

| Order | Constants | Symptom it fixes | Direction |
|---|---|---|---|
| 1 | `PINCH_ON` / `PINCH_OFF` | Pinch triggers too early/late, or flickers | Widen the gap to stop flicker; lower both to trigger more easily |
| 2 | `ONE_EURO_MIN_CUTOFF` | Sphere jitters when the hand is still | Lower it |
| 3 | `ONE_EURO_BETA` | Sphere lags behind fast movement | Raise it |
| 4 | `Z_REF` | Comfortable arm distance does not sit near z=0 | Set to the `1/palmWidth` value at your natural distance |
| 5 | `Z_SCALE` | Depth range too compressed or too extreme | Raise for more depth travel, lower for less |
| 6 | `MIN_POINT_DISTANCE` | Strokes jagged (lower it) or too coarse (raise it) | Small changes only; this drives point count |
| 7 | `TUBE_RADIUS` | Finished strokes too thin or too fat | Taste |

For `Z_REF` specifically, temporarily log the raw value to read it directly:
```ts
// Temporary, in estimateDepth() — remove before committing.
console.log("1/palmWidth =", 1 / palmWidth);
```

- [ ] **Step 3: Remove any temporary logging**

Confirm no `console.log` added during tuning remains in `src/`:
```bash
grep -rn "console.log" src/
```
Expected: only the deliberate `[air-draw] camera ready` line from Task 1, if you kept it.

- [ ] **Step 4: Final verification pass — STOP and confirm with the user**

Re-run the full definition of done (`PLAN.md` §2):
1. Three strokes at visibly different depths, clearly occupying 3D space when orbited.
2. 30fps or better, sustained.
3. Hand leaving frame produces no garbage strokes.
4. Drawing **feels good** — this is a judgment call and the user's to make. It is the actual point of the MVP.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "tune: pinch, smoothing, depth, and stroke parameters"
```

---

## Out of Scope — Do Not Build

Restated because this list is the plan's most likely failure mode. From `PLAN.md` §2:

Color selection, brush sizes, erasing, undo, AI recognition, AI 3D model generation, hand-gesture camera control, two-handed interaction, saving/loading/exporting, multiplayer/networking, mobile or responsive layout, authentication, backend, database.

Also accepted as **known limitations**, not bugs to fix (spec §5, `PLAN.md` §6):
- Depth drifts if the user leans toward the camera.
- With two hands in frame, MediaPipe's pick can switch mid-stroke and produce an artifact. Revisit only if it proves constantly disruptive during Task 8.
