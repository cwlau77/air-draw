export const ERROR_MESSAGES = {
  permissionDenied: "Camera access is required. Allow it in your browser and reload.",
  noCamera: "No camera found. Connect one and reload.",
  modelFailed: "Hand tracking failed to load. Reload to try again.",
  noWebGL: "This browser can't render 3D graphics.",
  cameraUnavailable: "The camera could not be started. Close any other app using it and reload.",
} as const;

export function showFatalError(message: string): void {
  const el = document.querySelector<HTMLDivElement>("#error");
  if (!el) throw new Error("#error element missing from index.html");
  el.textContent = message;
  el.hidden = false;
  console.error("[air-draw] fatal:", message);
}
