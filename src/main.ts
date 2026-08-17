import "./style.css";
import * as THREE from "three";
import { startCamera, CameraError } from "./camera";
import { createHandTracker, TrackerError } from "./tracking/handTracker";
import { DebugOverlay } from "./ui/debugOverlay";
import { showFatalError } from "./ui/errorDisplay";
import { pinchRatio, fistRatio } from "./tracking/gestures";
import { createScene, SceneError } from "./scene/setup";
import { HandInputSource } from "./tracking/handInput";
import { measureDepth } from "./tracking/depth";
import { StrokeManager } from "./scene/strokeManager";
import { initControls } from "./ui/controls";
import { initToolbar } from "./ui/toolbar";
import { PinchDiagnostics } from "./ui/diagnostics";
import { viewToWorld } from "./scene/viewMapping";
import { STROKE_COLOR, STROKE_EMISSIVE_INTENSITY, CURSOR_RADIUS_SCALE } from "./config";

async function boot(): Promise<void> {
  let video: HTMLVideoElement;
  let tracker: Awaited<ReturnType<typeof createHandTracker>>;
  let sceneCtx: ReturnType<typeof createScene>;

  try {
    video = await startCamera();
    console.log("[air-draw] camera ready", video.videoWidth, "x", video.videoHeight);

    // The stage's default aspect-ratio (4/3) is just a placeholder until the real
    // stream dimensions are known. #video, #overlay, and #scene all span the stage's
    // full bounds, so the stage must match the ACTUAL camera ratio, not the requested
    // one — otherwise the video is cropped by object-fit: cover while the overlay and
    // scene canvases are not, and landmark/fingertip coordinates (normalized against
    // the full camera frame) will not align with what's on screen.
    if (video.videoHeight > 0) {
      const stage = document.querySelector<HTMLDivElement>("#stage");
      if (stage) {
        stage.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
      }
    }

    tracker = await createHandTracker();
    sceneCtx = createScene(document.querySelector<HTMLCanvasElement>("#scene")!);
  } catch (err) {
    if (err instanceof CameraError || err instanceof TrackerError || err instanceof SceneError) {
      showFatalError(err.message);
      return;
    }
    throw err;
  }

  // Unit sphere, scaled per frame to the selected brush radius — so the cursor previews
  // both the colour and the thickness of the stroke it is about to draw. A fixed pink
  // sphere gave no feedback until a stroke already existed.
  const cursorMaterial = new THREE.MeshStandardMaterial({
    color: STROKE_COLOR,
    emissive: STROKE_COLOR,
    emissiveIntensity: STROKE_EMISSIVE_INTENSITY,
  });
  const cursor = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), cursorMaterial);
  sceneCtx.scene.add(cursor);

  // Reused each frame by viewToWorld() to avoid a per-frame allocation.
  const worldTip = new THREE.Vector3();

  const overlayCanvas = document.querySelector<HTMLCanvasElement>("#overlay")!;
  const overlay = new DebugOverlay(overlayCanvas);
  window.addEventListener("resize", () => {
    overlay.resize();
    sceneCtx.resize();
  });

  let lastFrameMs = performance.now();
  let fps = 0;
  const handInput = new HandInputSource();
  const strokes = new StrokeManager(sceneCtx.scene);

  // Measurement instrumentation is opt-in via ?diag. It is a development tool: it
  // records every frame into a ring buffer, exposes a window global, and needs a second
  // measureDepth() call per frame. Gated on a URL param rather than import.meta.env.DEV
  // because this project is run through `npm run dev` for everything, so a DEV check
  // would leave it permanently on and gate nothing.
  const diagEnabled = new URLSearchParams(window.location.search).has("diag");
  const diagnostics = diagEnabled ? new PinchDiagnostics() : null;
  if (diagnostics) {
    // Debug handle for console use: airDrawDiag.sample("right-pinched"), .stats(), .reset()
    (window as any).airDrawDiag = diagnostics;
    console.log(
      '[air-draw] diagnostics: airDrawDiag.sample("right-pinched"), .stats(), .reset()',
    );
  }

  initControls({
    onClear: () => strokes.clear(),
    onToggleDebug: () => {
      const next = !overlay.isVisible();
      overlay.setVisible(next);
      return next;
    },
    onResetView: () => sceneCtx.resetView(),
  });

  initToolbar({
    onColor: (color) => strokes.setColor(color),
    onRadius: (radius) => strokes.setRadius(radius),
    onUndo: () => strokes.undo(),
  });

  function frame(): void {
    requestAnimationFrame(frame);

    const now = performance.now();
    const dt = (now - lastFrameMs) / 1000;
    lastFrameMs = now;
    if (dt > 0) fps = fps * 0.9 + (1 / dt) * 0.1;

    const landmarks = tracker.detect(video, now);
    const input = handInput.update(landmarks, now);

    // input.tip is view-relative; both consumers below need world coordinates.
    viewToWorld(input.tip, sceneCtx, worldTip);

    cursor.visible = input.present;
    cursor.position.copy(worldTip);
    // Cheap per-frame reads of two numbers; keeps the cursor honest when the user
    // changes colour or size mid-session without needing a change event.
    cursorMaterial.color.setHex(strokes.currentColor);
    cursorMaterial.emissive.setHex(strokes.currentColor);
    const r = strokes.currentRadius * CURSOR_RADIUS_SCALE;
    cursor.scale.set(r, r, r);

    strokes.update({ ...input, tip: worldTip });

    if (diagnostics && landmarks) {
      // Instrumentation only, and only under ?diag: a second measureDepth() call
      // alongside the one already inside HandInputSource, so the diagnostics buffer can
      // see the intermediate palmWidth/raw/z values used to settle Z_REF and Z_SCALE.
      const depth = measureDepth(landmarks);
      diagnostics.record({
        t: now,
        ratio: pinchRatio(landmarks),
        smoothed: handInput.smoothedPinchRatio,
        pinching: input.pinching,
        drawing: input.drawing,
        hand: tracker.handedness ?? "unknown",
        palmWidth: depth.palmWidth,
        depthRaw: depth.raw,
        z: depth.z,
        fistRaw: fistRatio(landmarks),
        fistSmoothed: handInput.smoothedFistRatio,
      });
    }

    overlay.draw(landmarks, {
      fps,
      pinchRatio: landmarks ? pinchRatio(landmarks) : null,
      pinching: input.pinching,
      drawing: input.drawing,
      erasing: input.erasing,
      fistRatio: landmarks ? fistRatio(landmarks) : null,
      diagnostics: diagnostics
        ? {
            rollingRange: diagnostics.rolling(),
            flickerCount: diagnostics.flickerCount,
          }
        : undefined,
    });
    sceneCtx.render();
  }

  requestAnimationFrame(frame);
}

void boot();
