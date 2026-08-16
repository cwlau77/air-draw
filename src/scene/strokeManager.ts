import * as THREE from "three";
import { Stroke } from "./stroke";
import { ActionHistory } from "./history";
import type { HandInput, Vec3 } from "../tracking/types";
import { ERASE_RADIUS, STROKE_COLOR, TUBE_RADIUS } from "../config";

export class StrokeManager {
  private finished: Stroke[] = [];
  private active: Stroke | null = null;
  private color: number = STROKE_COLOR;
  private radius: number = TUBE_RADIUS;
  private history = new ActionHistory();

  constructor(private scene: THREE.Scene) {}

  /** Applies to the NEXT stroke only; strokes already drawn are never recoloured. */
  setColor(color: number): void {
    this.color = color;
  }

  /** Applies to the NEXT stroke only. */
  setRadius(radius: number): void {
    this.radius = radius;
  }

  /** Consumes only the HandInput contract — knows nothing about MediaPipe. */
  update(input: HandInput): void {
    // Losing the hand always ends the stroke immediately, so a reappearance
    // elsewhere cannot connect across the gap.
    if (!input.present) {
      this.endActive();
      return;
    }

    if (input.erasing) {
      // A fist forces pinching/drawing false upstream, so no stroke can be active here.
      const hit = this.finished.filter((s) => this.isNear(s, input.tip));
      if (hit.length > 0) {
        for (const stroke of hit) stroke.hide();
        this.finished = this.finished.filter((s) => !hit.includes(s));
        this.history.push({ type: "erase", strokes: hit });
      }
      return;
    }

    if (input.pinching) {
      if (!this.active) this.active = new Stroke(this.scene, this.color, this.radius);
      // Only append while actively drawing: this excludes the finger-opening motion
      // during the release debounce, which otherwise trails the stroke.
      if (input.drawing) this.active.addPoint(input.tip);
    } else {
      this.endActive();
    }
  }

  /**
   * True if any recorded point of the stroke lies within ERASE_RADIUS of `p`.
   *
   * No raycasting: every Stroke retains its raw points, so this is a distance check.
   * The squared distance avoids a sqrt per point.
   */
  private isNear(stroke: Stroke, p: Vec3): boolean {
    const r2 = ERASE_RADIUS * ERASE_RADIUS;
    for (const q of stroke.points) {
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const dz = q.z - p.z;
      if (dx * dx + dy * dy + dz * dz <= r2) return true;
    }
    return false;
  }

  private endActive(): void {
    if (!this.active) return;
    this.active.finalize();
    // A stroke of 0 points built no geometry; drop it rather than retain it.
    if (this.active.pointCount >= 1) {
      this.finished.push(this.active);
      this.history.push({ type: "draw", stroke: this.active });
    } else {
      this.active.dispose();
    }
    this.active = null;
  }

  /** Reverses the most recent draw or erase. Returns false if there was nothing to undo. */
  undo(): boolean {
    const action = this.history.undo();
    if (!action) return false;

    if (action.type === "draw") {
      const i = this.finished.indexOf(action.stroke);
      if (i !== -1) this.finished.splice(i, 1);
      action.stroke.dispose();
    } else {
      for (const stroke of action.strokes) {
        stroke.restore();
        this.finished.push(stroke);
      }
    }
    return true;
  }

  /** Disposes geometries and materials, not just scene removal (PLAN.md §6). */
  clear(): void {
    this.endActive();
    for (const stroke of this.finished) stroke.dispose();
    this.finished = [];
    this.history.clear();
  }
}
