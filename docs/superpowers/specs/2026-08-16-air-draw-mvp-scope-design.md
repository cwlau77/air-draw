# Air-Draw MVP: Scope Hardening Design

**Date:** 2026-08-16
**Status:** Approved
**Relationship to `PLAN.md`:** This document resolves gaps in `PLAN.md`. It does not replace it. `PLAN.md` remains authoritative for the milestone sequence (§5), the known gotchas (§6), and the out-of-scope list (§2). Where this document and `PLAN.md` disagree, this document wins, and the disagreements are listed explicitly in §7 below.

---

## 1. Purpose

`PLAN.md` is a strong handoff document, but a review before implementation planning found five decisions it leaves unstated. Each would otherwise be resolved improvisationally mid-milestone, which is exactly where quality erodes. This spec settles all five, plus two consistency issues, so implementation planning starts from a closed set of decisions.

Nothing here expands the MVP's feature surface. Every item either handles a failure the plan ignored or narrows an ambiguity toward less work.

## 2. Failure states

`PLAN.md` never says what the user sees when the app cannot start. Four hard failures get a handled path:

| Failure | Trigger | Message |
|---|---|---|
| Permission denied | `getUserMedia` rejects with `NotAllowedError` | Camera access is required. Allow it in your browser and reload. |
| No camera device | `getUserMedia` rejects with `NotFoundError` | No camera found. Connect one and reload. |
| Model load failure | `HandLandmarker.createFromOptions` or the `.task` fetch rejects | Hand tracking failed to load. Reload to try again. |
| No WebGL | `WebGLRenderer` construction throws | This browser can't render 3D graphics. |

**Implementation:** one `#error` element in `index.html`, hidden by default, shown with the relevant text and covering the video area. No retry button, no pre-permission onboarding screen, no per-error styling beyond matching the existing minimal UI.

**Milestone placement:** the two camera cases land in M0; the model case in M1; the WebGL case in M3. Each arrives with the milestone that can first trigger it, so failures are legible during that milestone's own verification rather than surfacing later as apparent bugs.

## 3. Camera controls

`OrbitControls` configured with:

- orbit (left-drag): **enabled**
- zoom (scroll): **enabled**
- pan (right-drag): **disabled** via `controls.enablePan = false`

Zoom earns its place because the definition of done is *seeing that strokes occupy real 3D space* — moving closer to a stroke is part of confirming that. Pan is disabled because the scene has no ground plane, no bounding box, and no reset control, so panning off-center strands the user looking at empty space with no way back.

`enablePan = false` is an active line of configuration, not a default. It is recorded here so a later refactor does not silently drop it.

**Milestone placement:** M3.

## 4. Browser target

**Chrome on macOS, on the developer's own machine.** Not a cross-browser project.

**Consequence for the GPU delegate:** during M1, try `delegate: "GPU"`, confirm it works on that machine, and hardcode whichever value works. Write no runtime capability detection and no GPU-to-CPU fallback path. `PLAN.md` §6's note about delegate inconsistency is thereby demoted from a requirement to a **debugging instruction**: if tracking behaves strangely, flip the delegate to isolate whether it is the cause.

This is the single largest scope reduction in this document. It is justified because the MVP's purpose is proving out feel, not distribution.

## 5. Two hands in frame

`numHands: 1` stays. MediaPipe picks one hand by its own confidence ranking, and that pick can switch mid-stroke if a second hand enters frame, potentially producing a visible artifact.

**Decision: accept this. Write no handling code.** No hand-identity heuristic, no position-jump detection, no extra stroke-termination path beyond the hand-loss handling already planned for M6.

This is a **documented limitation**, in the same category as `PLAN.md` §6's note that depth-from-hand-size drifts when the user leans toward the camera: a known consequence of the approach, not a defect to chase.

**Revisit condition:** if hand-switching proves constantly disruptive during the M7 tuning pass, that is new information and the decision can be reopened. It is not to be built for speculatively beforehand.

## 6. Window resize

The app has three stacked layers that must stay aligned: the `<video>`, the 2D overlay canvas, and the WebGL canvas. On window resize, all three must remain registered with each other.

**On resize:**

- update the renderer size
- update the camera aspect ratio and call `updateProjectionMatrix()`
- update the overlay canvas's backing dimensions

**Milestone placement:** introduced in M3, when the WebGL canvas first exists. The overlay-canvas half is retro-applied to M1's canvas at that time.

**This is not responsive design.** Mobile and responsive layout remain out of scope per `PLAN.md` §2. This covers only the case of a desktop window changing size mid-session, which would otherwise produce a misalignment that looks like a coordinate-mapping bug and waste debugging time during milestone verification.

## 7. Consistency corrections to `PLAN.md`

Two places where `PLAN.md` is internally ambiguous. These are corrections, not new decisions.

### 7.1 The mirroring convention, stated once

`PLAN.md` warns about mirroring in three separate places (§5 M1, §5 M4, §6) but never states the canonical rule in one place, so there is nothing to check code against. The rule is:

> **The video is mirrored via CSS `transform: scaleX(-1)`. The debug overlay canvas is mirrored identically. The scene coordinate mapping compensates for that mirroring with `x_scene = (0.5 - lm.x) * SCENE_WIDTH`.**

All three layers, one convention. This sentence is to be reproduced as a comment at each of the three implementation sites.

### 7.2 File extensions

`PLAN.md` §3 recommends TypeScript; §4's project tree shows `.js` files. **TypeScript wins** — the tree's extensions are illustrative of structure, not of language. `src/` is to be uniformly `.ts`. This is recorded so nobody splits the difference and produces a mixed-language source tree.

## 8. What this document does not change

- The milestone sequence M0–M7, and the requirement that each be confirmed working by a human in the browser before the next begins
- The out-of-scope list in `PLAN.md` §2
- The tracking/scene decoupling boundary, and the plain `{ tip, pinching, present }` input object
- Retaining raw stroke points alongside baked geometry
- The dependency constraint: Vite, `@mediapipe/tasks-vision`, `three`, and nothing else without flagging it first
- Verification remains manual and visual. No test framework is introduced.
