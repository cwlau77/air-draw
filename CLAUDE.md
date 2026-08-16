# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

This repository contains only `PLAN.md` — no code has been written yet (no `package.json`, no `src/`). `PLAN.md` is the authoritative spec and handoff document; it is longer and more detailed than this file, and this file does not replace it. Read `PLAN.md` in full before starting any work, especially §5 (milestones) and §6 (gotchas).

## 1. Project overview

Air-Draw: a browser app that uses the webcam to track a hand via MediaPipe, lets the user draw strokes in 3D space by pinching (thumb tip to index tip), and lets them orbit a Three.js camera to view the drawing from any angle. It's an MVP proving out three risky things: hand tracking reliability, depth estimation from a single 2D camera, and whether drawing in the air actually feels good.

It is the foundation for a larger, unbuilt project (color/erase tools, AI shape recognition, AI-generated 3D models, a game layer). The two decisions here that matter for that future are the decoupled tracking-input interface and retaining raw stroke points, not just baked geometry (see §3 Architecture). Everything else about that future project is explicitly not this MVP's concern — see §9.

Done means: three separate strokes at visibly different depths, camera orbit working, strokes clearly occupying real 3D space rather than a flat plane, 30fps+ on a MacBook Air, no garbage strokes when the hand leaves frame.

## 2. Tech stack

**Use:** Vite, TypeScript (preferred over vanilla JS — MediaPipe's result shapes are easy to get wrong without types), `@mediapipe/tasks-vision` for hand tracking, `three` plus `OrbitControls` from `three/examples/jsm/controls/OrbitControls.js`. Check current package versions at install time; don't assume the versions implied by `PLAN.md`.

**Do not use:** any other hand/pose-tracking library (e.g. TensorFlow.js handpose, MediaPipe's older JS solutions API), any other 3D/WebGL library or framework (no react-three-fiber, no Babylon.js), any UI framework (no React/Vue/Svelte — this is small enough for direct DOM manipulation), any backend or database. Do not add *any* dependency beyond the four above without flagging it to the user first — this is a hard constraint from the handoff doc, not a style preference.

## 3. Architecture

Planned project layout (`PLAN.md` §4):

```
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
    strokeManager.js       active stroke vs. finished strokes, clear()
  ui/
    debugOverlay.js        2D canvas: landmark dots, pinch ratio, fps
    controls.js            clear button, debug toggle
public/models/hand_landmarker.task   downloaded model, not hotlinked from a CDN
```

**Data flow / hard boundary:** `tracking/` is the only layer that touches MediaPipe. Its output to the rest of the app is a plain object shaped like `{ tip: {x, y, z}, pinching: boolean, present: boolean }` — nothing else crosses that line. `scene/` must know nothing about MediaPipe, landmarks, or gesture state; it only consumes that plain object. `main.js` is the only place that wires tracking output into the scene, per animation-loop frame. This boundary exists so a future input source (e.g. a different tracker, or grab/rotate gestures on a generated model) can be swapped in behind the same interface, and so gesture logic is testable without a webcam.

Each finished stroke retains its raw accumulated 3D points (not only the final baked `TubeGeometry`/`Line2` mesh) — a future AI-recognition or export step needs the points.

## 4. Coding conventions

- TypeScript for all new source files; keep MediaPipe/Three.js result and option shapes typed rather than treated as `any`.
- One responsibility per file, matching the layout in §3 — e.g. gesture state-machine logic lives in `gestures.js`, never inline in `main.js`.
- No dynamic per-frame allocation in the animation loop where avoidable (e.g. reuse `THREE.Vector3` instances, preallocate stroke `BufferGeometry`) — this app must sustain 30fps on a MacBook Air with a webcam feed, hand tracking, and WebGL rendering all running concurrently.
- Comment mirroring conventions and coordinate-mapping formulas inline where they're implemented (see §6) — get this wrong once and it's very hard to debug from the rendered output alone.

## 5. UI and interaction rules

- The webcam video is the visual backdrop, always mirrored (`transform: scaleX(-1)`) so it reads as a mirror. The debug-overlay canvas and the fingertip coordinate mapping must use the exact same mirroring convention as the video — pick one and apply it in all three places.
- UI chrome is intentionally minimal: a "clear all" button and a debug-overlay toggle. Nothing else. Do not add a broader control panel, settings menu, or color/tool UI (see §9).
- The debug overlay, when on, shows: the 21 hand landmarks as dots, the live pinch ratio, the boolean pinch state, and fps.
- No responsive/mobile layout work — this targets a single desktop browser window with a webcam.

## 6. Depth, smoothing, and gesture rules — read before touching this code

These are the fragile, easy-to-get-subtly-wrong parts of the app (`PLAN.md` §6):

- `landmarker.detectForVideo()`'s timestamp argument must strictly increase or the call throws. Use `performance.now()`, and skip the detect call if `video.currentTime` hasn't advanced since the last processed frame.
- Pinch state uses two thresholds, not one: engage below ratio ~0.35, release above ~0.45 (`pinchRatio = distance(4,8) / distance(0,5)`). This hysteresis gap is intentional — collapsing it to a single threshold will cause flickering.
- z-depth comes from apparent hand size (`palmWidth = distance(landmark 5, landmark 17)`), not MediaPipe's per-landmark z, which is too noisy. This is an approximation that drifts if the user leans toward the camera — a known limitation, not something to "fix" in the MVP.
- Apply a One Euro filter to x, y, and z before use; a plain EMA is an acceptable fallback only if One Euro proves troublesome, with the expectation of visible jitter/lag.
- On hand loss (`detectForVideo` returns no hands, or the hand is at the frame edge / low confidence), immediately end any in-progress stroke — otherwise the next stroke connects across the gap into a spurious line.
- `delegate: "GPU"` in `HandLandmarker` options is faster but inconsistent across machines; if tracking misbehaves, test with `"CPU"` to isolate whether the delegate is the cause.

## 7. Testing and quality bar

There is no automated test suite planned for this MVP — verification is manual, per milestone, against a live webcam in the browser (see each milestone's "Verify" step in `PLAN.md` §5). Do not add a test framework or write automated tests unless asked; they wouldn't meaningfully cover hand-tracking/webcam behavior anyway. "Done" for any change is: it visibly works when checked in the browser against the relevant milestone's verify criteria, and it does not regress an earlier milestone's verify criteria.

## 8. File and content placement rules

- New tracking-related logic goes in `src/tracking/`; new rendering/geometry logic goes in `src/scene/`; anything DOM/button/overlay-related goes in `src/ui/`. Don't add a new top-level directory without a clear reason tied to this structure.
- Don't create a new abstraction (base class, generic interface, plugin system) for something that has exactly one implementation today — e.g. no "input source" abstraction beyond the plain object contract in §3 until a second input source actually exists.
- The `.task` model file lives in `public/models/`, downloaded once and committed/kept locally — never hotlinked from a CDN at runtime.

## 9. Guardrails — what not to change or build casually

- **Do not build anything on the out-of-scope list**, even as a "small" addition: color selection, brush sizes, erasing, undo, AI recognition or 3D model generation, hand-gesture camera control (mouse-drag orbit only), two-handed interaction, save/load/export, multiplayer/networking, mobile/responsive layout, auth/backend/database.
- **Do not start the next milestone (M0–M7, `PLAN.md` §5) until the current one has been confirmed working by a human in the browser.** Most milestones can only be verified visually against a live webcam feed — don't self-certify and move on.
- **Do not add a dependency** beyond the four listed in §2 without flagging it to the user first.
- **Treat the mirroring convention and the tracking/scene boundary (§3, §6) as load-bearing.** Changing either casually to "simplify" a milestone will silently break a later one.
- Always `.dispose()` geometries and materials on stroke clear — don't just remove meshes from the scene, or GPU memory leaks over a session.

## 10. Commands

No `package.json` exists yet. Once the project is scaffolded with Vite, standard commands (`npm run dev`, `npm run build`) apply. There is no existing lint or test command to run — don't assume or invent one.
