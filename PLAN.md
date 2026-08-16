# Air-Draw MVP: Implementation Plan

**Handoff document for Claude Code.** Build milestone by milestone. Each milestone is independently runnable and verifiable; do not start the next one until the current one is confirmed working in the browser.

---

## 1. What this is

A browser app that uses the webcam to track the user's hand, lets them draw strokes in 3D space by pinching, and lets them orbit the camera to view the drawing from any angle.

This is the foundation for a larger project (color selection, erasing, AI shape recognition, AI 3D model generation, and eventually a game layer). **None of that is in scope here.** The purpose of this MVP is to prove out the three genuinely risky parts: hand tracking reliability, depth estimation, and whether drawing in the air actually feels good.

## 2. Scope

### In scope

- Webcam feed as the visual backdrop
- Single-hand tracking via MediaPipe
- Pinch gesture (thumb tip to index tip) starts and ends a stroke
- Strokes render as 3D lines in a Three.js scene, positioned in x, y, and z
- Multiple strokes persist in the scene
- Mouse drag orbits the camera around the drawing
- A "clear all" button
- A debug overlay (toggleable) showing landmarks and pinch state

### Explicitly out of scope

Do not build these, even if they seem like small additions:

- Color selection, brush sizes, erasing, undo
- AI recognition or 3D model generation
- Hand-gesture camera control (mouse orbit only for now)
- Two-handed interaction
- Saving, loading, or exporting
- Multiplayer or networking
- Mobile support or responsive layout
- Authentication, backend, or database

### Definition of done

The MVP is complete when the user can draw at least three separate strokes at visibly different depths, orbit the camera, and see clearly that the strokes occupy real 3D space rather than a flat plane. It should sustain 30fps or better on a MacBook Air, and it should not break or produce garbage strokes when the hand leaves the frame.

## 3. Stack

| Concern | Choice | Notes |
|---|---|---|
| Build tool | Vite | Vanilla JS or TypeScript, your call; TypeScript is worth it here because the MediaPipe result shapes are easy to get wrong |
| Hand tracking | `@mediapipe/tasks-vision` | Runs fully client-side, free, Apache 2.0 |
| 3D | `three` | Plus `OrbitControls` from `three/examples/jsm/controls/OrbitControls.js` |
| Hosting | None yet | `vite dev` on localhost is sufficient; `getUserMedia` works on localhost without HTTPS |

Check the current versions of both packages at install time rather than pinning to whatever version this document might imply. Do not add any other dependencies without flagging it first.

## 4. Project structure

```
air-draw/
  index.html
  package.json
  vite.config.js
  public/
    models/
      hand_landmarker.task
  src/
    main.js                 app entry, animation loop, wiring
    tracking/
      handTracker.js        MediaPipe init, per-frame detect, returns landmarks
      gestures.js           pinch ratio + hysteresis state machine
      smoothing.js          One Euro filter (or EMA fallback)
      depth.js              apparent-hand-size to z estimate
    scene/
      setup.js              renderer, camera, lights, OrbitControls
      stroke.js             Stroke class: accumulate points, build geometry
      strokeManager.js      active stroke vs. finished strokes, clear()
    ui/
      debugOverlay.js       2D canvas: landmark dots, pinch ratio, fps
      controls.js           clear button, debug toggle
```

Keep the tracking layer and the scene layer decoupled. The tracking layer's only output should be a plain object like `{ tip: {x, y, z}, pinching: boolean, present: boolean }`. The scene layer should know nothing about MediaPipe. This matters because the game layer later will want to swap in different input sources, and because it makes the pinch logic testable without a webcam.

## 5. Milestones

### M0: Project skeleton and webcam feed

Set up Vite. Get a `<video>` element playing the user's webcam via `getUserMedia({ video: { width: 640, height: 480 } })`.

The video element must have `autoplay`, `playsinline`, and `muted` set or browsers will refuse to play it. Mirror it horizontally with CSS (`transform: scaleX(-1)`) so it reads as a mirror, which is what users expect.

**Verify:** you see yourself, mirrored, at a stable frame rate.

### M1: MediaPipe landmarks and debug overlay

Initialize the HandLandmarker:

```js
const vision = await FilesetResolver.forVisionTasks(/* wasm path */);
const landmarker = await HandLandmarker.createFromOptions(vision, {
  baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate: "GPU" },
  runningMode: "VIDEO",
  numHands: 1,
});
```

Download `hand_landmarker.task` into `public/models/` rather than hotlinking it, so the app works offline and does not depend on a CDN staying up.

In the animation loop, call `landmarker.detectForVideo(videoEl, timestampMs)`. The timestamp **must strictly increase** between calls or the call throws. Use `performance.now()`, and guard against the case where the video has not advanced (compare `video.currentTime` against the last processed value and skip the detect call if unchanged).

Draw the 21 landmarks as dots on a 2D canvas overlaid on the video. Remember that if the video is mirrored in CSS, the overlay canvas must be mirrored the same way, or the dots will appear on the wrong side. Getting one mirrored and not the other is the single most common bug at this stage.

**Verify:** dots track your hand accurately and stay glued to your fingertips as you move.

### M2: Pinch detection

Landmark indices you need: `4` (thumb tip), `8` (index tip), `0` (wrist), `5` (index MCP), `17` (pinky MCP).

Raw distance between landmarks 4 and 8 is useless on its own because it shrinks as the hand moves away from the camera. Normalize it:

```
pinchRatio = distance(4, 8) / distance(0, 5)
```

Using wrist-to-index-knuckle as the reference length makes the ratio roughly scale-invariant.

Apply **hysteresis** so the state does not flicker at the threshold: engage the pinch when the ratio drops below roughly 0.35, release it only when the ratio rises above roughly 0.45. Two separate thresholds, not one. Tune the exact numbers by hand while watching the debug readout.

Display the live pinch ratio and the boolean state in the debug overlay.

**Verify:** pinch state flips cleanly and predictably, with no rapid toggling when you hold your fingers near the threshold.

### M3: Three.js scene overlay

Create a Three.js scene with a transparent renderer (`new WebGLRenderer({ alpha: true })`, `setClearColor(0x000000, 0)`) on a canvas absolutely positioned over the video element. Add a `PerspectiveCamera`, ambient plus directional light, `OrbitControls`, and a temporary reference cube at the origin.

**Verify:** the cube floats over the live video feed and you can orbit around it with the mouse.

### M4: Fingertip to 3D position

Map the index fingertip into scene coordinates.

**x and y:** MediaPipe returns normalized coordinates in [0, 1] with the origin at the top left. Three.js is y-up with the origin at the center. So roughly:

```
x_scene =  (0.5 - lm.x) * SCENE_WIDTH     // note: 0.5 - x, because the view is mirrored
y_scene = -(lm.y - 0.5) * SCENE_HEIGHT
```

Pick `SCENE_WIDTH` and `SCENE_HEIGHT` so a comfortable arm movement covers most of the visible area, and account for the camera's aspect ratio.

**z (the hard part):** MediaPipe's per-landmark `z` is relative to the wrist and is too noisy to use directly for stroke depth. Instead, derive depth from **apparent hand size**: a hand closer to the camera occupies more of the frame.

```
palmWidth = distance(landmark 5, landmark 17)   // in normalized coords
z_scene = K / palmWidth  (then re-centered and scaled)
```

This is an approximation, not real metric depth, and that is fine. It is stable, and it maps to an intuitive physical action: push your hand toward the camera and the stroke moves forward.

Apply a **One Euro filter** to x, y, and z before using them. This filter is the standard choice for noisy interactive input because it smooths aggressively when the hand is still but stays responsive when it moves fast, which a plain moving average cannot do. A simple exponential moving average is an acceptable fallback if the One Euro implementation causes trouble, but expect visible jitter or lag from it.

Render a small sphere at the computed fingertip position.

**Verify:** the sphere tracks your fingertip smoothly, and moving your hand toward and away from the camera visibly moves the sphere along the depth axis when you orbit to a side view.

### M5: Live stroke drawing

On pinch engage, start a new stroke. While pinched, append the smoothed fingertip position, but **only if it is farther than a minimum distance from the previous point** (start around 0.02 scene units). Appending every frame produces dense, jittery, expensive geometry.

For the in-progress stroke, do not try to dynamically resize a fat-line geometry. `Line2` uses instanced attributes internally and rebuilding it every frame either fails silently or leaks memory; this is a known rough edge in three.js. Instead:

- **In progress:** a preallocated `THREE.BufferGeometry` (say 5000 vertices) with a plain `THREE.Line`, updated via `setDrawRange(0, pointCount)` and `needsUpdate` on the position attribute. Cheap, and 1px width is perfectly adequate as live feedback.
- **On release:** build the final geometry exactly once. Fit a `CatmullRomCurve3` through the accumulated points, resample it to a fixed number of segments, and build either a `Line2`/`LineMaterial` fat line or a `TubeGeometry` mesh. Both are fine; `TubeGeometry` looks better under lighting and reads as more solidly three-dimensional when orbiting.

Note that `THREE.Line` ignores `linewidth` above 1 on essentially every platform. Do not spend time trying to make it thicker; that is what the finalize step is for.

**Verify:** pinching draws a visible trail that follows your finger; releasing leaves a smooth, thicker stroke behind.

### M6: Multiple strokes and lifecycle

Finished strokes accumulate in the scene. Add a clear button that disposes geometries and materials properly (call `.dispose()` on both; do not just remove from the scene, or you leak GPU memory over a long session).

Handle hand loss: when `detectForVideo` returns no hands, immediately end any in-progress stroke. If you do not, the stroke will connect across the gap when the hand reappears somewhere else, producing a long spurious line. Also consider ending the stroke if tracking confidence drops or the hand is at the very edge of the frame.

**Verify:** draw three strokes at different depths, orbit around them, confirm they are genuinely distributed in 3D. Wave your hand out of frame mid-stroke and confirm no garbage line appears.

### M7: Tuning pass

With everything working, tune: pinch thresholds, One Euro filter parameters (`minCutoff` and `beta`), depth scaling constant `K`, minimum point spacing, and curve resampling density. This is the milestone where the app stops feeling like a demo and starts feeling good. Budget real time for it, and change one parameter at a time.

## 6. Known gotchas

- `getUserMedia` requires HTTPS or localhost. Vite dev serves localhost, so this is fine locally, but remember it when deploying.
- The MediaPipe timestamp passed to `detectForVideo` must strictly increase. Reusing or repeating a timestamp throws.
- Mirroring must be applied consistently to the video, the debug overlay, and the coordinate mapping. Pick one convention and write it down in a comment.
- The first `detectForVideo` call after model load is slow. Do not measure fps until the loop has been running for a second or two.
- `delegate: "GPU"` is much faster but falls back inconsistently across machines. If tracking behaves strangely, test with `"CPU"` to isolate whether the delegate is the cause.
- Dispose geometries and materials on clear. Long drawing sessions will otherwise degrade.
- Depth from apparent hand size drifts if the user leans toward the camera. This is a known limitation, not a bug to chase in the MVP.

## 7. What comes after (do not build yet)

Recorded here only so the architecture does not paint itself into a corner:

1. Color selection and erase gestures
2. Snapshot the canvas, send to Gemini, display "what is this?" guesses
3. Confirmed guess feeds Meshy or a self-hosted TripoSR to generate a 3D model, loaded back via `GLTFLoader`
4. Reuse the same gesture layer to grab, rotate, and scale the generated model
5. Game layer (a Quick, Draw! style timed single-player mode first)

The two design decisions in this MVP that most affect that future: keeping the tracking layer decoupled behind a plain input object (step 4 needs to reuse it), and keeping each stroke as a retained array of 3D points rather than only baked geometry (step 2 and any future export need the raw points).

## 8. Handoff notes

Save this file as `PLAN.md` in the repo root. Ask Claude Code to work one milestone at a time and to stop for confirmation after each, since most milestones can only be verified by a human looking at a webcam feed. Resist letting it run ahead into the out-of-scope list.

---

## Sources

- [MediaPipe Hand Landmarker, Web/JS guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
- [Updating Line2 dynamically, three.js forum](https://discourse.threejs.org/t/how-to-update-line2-dynamically/37913)
- [three.js](https://en.wikipedia.org/wiki/Three.js)
- [3D Hand Canvas, a comparable project](https://www.hackster.io/auxencedaillen/3d-hand-canvas-3b4e40)
