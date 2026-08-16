import "./style.css";
import * as THREE from "three";
import { startCamera, CameraError } from "./camera";
import { createHandTracker, TrackerError } from "./tracking/handTracker";
import { DebugOverlay } from "./ui/debugOverlay";
import { showFatalError } from "./ui/errorDisplay";
import { pinchRatio } from "./tracking/gestures";
import { createScene, SceneError } from "./scene/setup";
import { HandInputSource } from "./tracking/handInput";

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

  // TEMPORARY reference object — deleted in Task 6 once strokes render.
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x44aaff }),
  );
  sceneCtx.scene.add(cube);

  const cursor = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xff4488 }),
  );
  sceneCtx.scene.add(cursor);

  const overlayCanvas = document.querySelector<HTMLCanvasElement>("#overlay")!;
  const overlay = new DebugOverlay(overlayCanvas);
  window.addEventListener("resize", () => {
    overlay.resize();
    sceneCtx.resize();
  });

  let lastFrameMs = performance.now();
  let fps = 0;
  const handInput = new HandInputSource();

  function frame(): void {
    requestAnimationFrame(frame);

    const now = performance.now();
    const dt = (now - lastFrameMs) / 1000;
    lastFrameMs = now;
    if (dt > 0) fps = fps * 0.9 + (1 / dt) * 0.1;

    const landmarks = tracker.detect(video, now);
    const input = handInput.update(landmarks, now);

    cursor.visible = input.present;
    cursor.position.set(input.tip.x, input.tip.y, input.tip.z);

    overlay.draw(landmarks, {
      fps,
      pinchRatio: landmarks ? pinchRatio(landmarks) : null,
      pinching: input.pinching,
    });
    sceneCtx.render();
  }

  requestAnimationFrame(frame);
}

void boot();
