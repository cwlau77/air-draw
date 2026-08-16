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
