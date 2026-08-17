import { STROKE_PALETTE, STROKE_RADII, STROKE_COLOR, TUBE_RADIUS } from "../config";

export interface ToolbarHandlers {
  onColor(color: number): void;
  onRadius(radius: number): void;
  onUndo(): void;
}

/** Marks one button in a group active and clears the others. */
function setActive(container: HTMLElement, active: HTMLElement): void {
  for (const child of Array.from(container.children)) {
    child.classList.toggle("active", child === active);
  }
}

export function initToolbar(handlers: ToolbarHandlers): void {
  const undoBtn = document.querySelector<HTMLButtonElement>("#undo");
  const swatches = document.querySelector<HTMLElement>("#swatches");
  const sizes = document.querySelector<HTMLElement>("#sizes");
  if (!undoBtn || !swatches || !sizes) {
    throw new Error("toolbar elements missing from index.html");
  }

  undoBtn.addEventListener("click", () => handlers.onUndo());

  for (const color of STROKE_PALETTE) {
    const btn = document.createElement("button");
    btn.className = "swatch";
    btn.style.background = `#${color.toString(16).padStart(6, "0")}`;
    btn.title = `#${color.toString(16).padStart(6, "0")}`;
    if (color === STROKE_COLOR) btn.classList.add("active");
    btn.addEventListener("click", () => {
      handlers.onColor(color);
      setActive(swatches, btn);
    });
    swatches.appendChild(btn);
  }

  const sizeLabels = ["S", "M", "L"];
  STROKE_RADII.forEach((radius, i) => {
    const btn = document.createElement("button");
    // Fall back to the raw radius so adding a config entry yields a usable button
    // rather than a silently empty one.
    btn.textContent = sizeLabels[i] ?? String(radius);
    if (radius === TUBE_RADIUS) btn.classList.add("active");
    btn.addEventListener("click", () => {
      handlers.onRadius(radius);
      setActive(sizes, btn);
    });
    sizes.appendChild(btn);
  });
}
