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
