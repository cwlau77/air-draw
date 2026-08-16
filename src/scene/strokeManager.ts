import * as THREE from "three";
import { Stroke } from "./stroke";
import type { HandInput } from "../tracking/types";

export class StrokeManager {
  private finished: Stroke[] = [];
  private active: Stroke | null = null;

  constructor(private scene: THREE.Scene) {}

  get strokeCount(): number {
    return this.finished.length;
  }

  /** Consumes only the HandInput contract — knows nothing about MediaPipe. */
  update(input: HandInput): void {
    // Losing the hand always ends the stroke immediately, so a reappearance
    // elsewhere cannot connect across the gap.
    if (!input.present) {
      this.endActive();
      return;
    }

    if (input.pinching) {
      if (!this.active) this.active = new Stroke(this.scene);
      // Only append while actively drawing: this excludes the finger-opening motion
      // during the release debounce, which otherwise trails the stroke.
      if (input.drawing) this.active.addPoint(input.tip);
    } else {
      this.endActive();
    }
  }

  private endActive(): void {
    if (!this.active) return;
    this.active.finalize();
    // A stroke of 0 points built no geometry; drop it rather than retain it.
    if (this.active.pointCount >= 1) this.finished.push(this.active);
    else this.active.dispose();
    this.active = null;
  }

  /** Disposes geometries and materials, not just scene removal (PLAN.md §6). */
  clear(): void {
    this.endActive();
    for (const stroke of this.finished) stroke.dispose();
    this.finished = [];
  }
}
