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
