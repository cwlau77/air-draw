export interface ControlHandlers {
  onClear(): void;
  /** Returns the new visibility state so the label can be updated. */
  onToggleDebug(): boolean;
  onResetView(): void;
}

export function initControls(handlers: ControlHandlers): void {
  const clearBtn = document.querySelector<HTMLButtonElement>("#clear");
  const debugBtn = document.querySelector<HTMLButtonElement>("#toggle-debug");
  const resetViewBtn = document.querySelector<HTMLButtonElement>("#reset-view");
  if (!clearBtn || !debugBtn || !resetViewBtn) throw new Error("control buttons missing from index.html");

  clearBtn.addEventListener("click", () => handlers.onClear());
  debugBtn.addEventListener("click", () => {
    const visible = handlers.onToggleDebug();
    debugBtn.textContent = `Debug: ${visible ? "on" : "off"}`;
  });
  resetViewBtn.addEventListener("click", () => handlers.onResetView());
}
