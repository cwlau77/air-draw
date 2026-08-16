import "./style.css";
import { startCamera, CameraError } from "./camera";
import { showFatalError } from "./ui/errorDisplay";

async function boot(): Promise<void> {
  try {
    const video = await startCamera();
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
  } catch (err) {
    if (err instanceof CameraError) {
      showFatalError(err.message);
      return;
    }
    throw err;
  }
}

void boot();
