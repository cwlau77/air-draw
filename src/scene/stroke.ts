import * as THREE from "three";
import type { Vec3 } from "../tracking/types";
import {
  MAX_STROKE_POINTS,
  MIN_POINT_DISTANCE,
  TUBE_SEGMENTS_PER_POINT,
  TUBE_RADIAL_SEGMENTS,
} from "../config";

export class Stroke {
  /** Raw points are retained deliberately — future export/recognition needs them. */
  readonly points: Vec3[] = [];

  private liveGeometry: THREE.BufferGeometry | null;
  private liveMaterial: THREE.LineBasicMaterial | null;
  private liveLine: THREE.Line | null;
  private positions: Float32Array | null;
  // Typed distinctly from liveGeometry.attributes.position (a BufferAttribute |
  // InterleavedBufferAttribute union) so addUpdateRange, which only exists on
  // BufferAttribute, is available without a cast.
  private positionAttr: THREE.BufferAttribute | null;
  private finalMesh: THREE.Mesh | null = null;
  private finalized = false;

  constructor(
    private scene: THREE.Scene,
    private color: number,
    private radius: number,
  ) {
    this.positions = new Float32Array(MAX_STROKE_POINTS * 3);
    this.positionAttr = new THREE.BufferAttribute(this.positions, 3);
    this.liveGeometry = new THREE.BufferGeometry();
    this.liveGeometry.setAttribute("position", this.positionAttr);
    this.liveGeometry.setDrawRange(0, 0);
    // THREE.Line ignores linewidth > 1 on essentially every platform. That is fine —
    // thickness comes from the TubeGeometry built in finalize().
    this.liveMaterial = new THREE.LineBasicMaterial({ color: this.color });
    this.liveLine = new THREE.Line(this.liveGeometry, this.liveMaterial);
    this.liveLine.frustumCulled = false;
    this.scene.add(this.liveLine);
  }

  get pointCount(): number {
    return this.points.length;
  }

  /** Appends only if far enough from the previous point. Dense points are jittery and expensive. */
  addPoint(p: Vec3): void {
    if (this.finalized || this.points.length >= MAX_STROKE_POINTS) return;
    // The `finalized` check above already prevents reaching here after finalize()
    // nulls these fields; this guard exists only to satisfy their nullable types.
    if (!this.positions || !this.liveGeometry || !this.positionAttr) return;

    const prev = this.points[this.points.length - 1];
    if (prev) {
      const d = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
      if (d < MIN_POINT_DISTANCE) return;
    }

    const i = this.points.length * 3;
    this.positions[i] = p.x;
    this.positions[i + 1] = p.y;
    this.positions[i + 2] = p.z;
    this.points.push({ ...p });

    this.liveGeometry.setDrawRange(0, this.points.length);
    this.positionAttr.needsUpdate = true;
    // Restrict the GPU upload to the 3 components just written, instead of re-uploading
    // the whole preallocated buffer on every appended point.
    this.positionAttr.addUpdateRange(i, 3);
    // No computeBoundingSphere() here: it is O(n) per call, which would make a long
    // stroke O(n^2), and liveLine.frustumCulled = false means it is never consulted.
  }

  /** Builds the final geometry exactly once, then discards the live line. */
  finalize(): void {
    if (this.finalized) return;
    this.finalized = true;

    this.scene.remove(this.liveLine!);
    this.liveGeometry!.dispose();
    this.liveMaterial!.dispose();
    // Drop the JS references too, not just the GPU buffer: the preallocated 5000-point
    // Float32Array (~60KB) plus the geometry/line/material chain would otherwise be
    // retained for the lifetime of every finished stroke (PLAN.md §6).
    this.liveGeometry = null;
    this.liveMaterial = null;
    this.liveLine = null;
    this.positions = null;
    this.positionAttr = null;

    // A single point is a deliberate tap: render it as a dot rather than silently
    // discarding the user's input. Fewer than one point means nothing was drawn.
    if (this.points.length === 0) return;
    if (this.points.length === 1) {
      const p = this.points[0];
      const dotGeometry = new THREE.SphereGeometry(this.radius, TUBE_RADIAL_SEGMENTS, TUBE_RADIAL_SEGMENTS);
      const dotMaterial = new THREE.MeshStandardMaterial({
        color: this.color,
        roughness: 0.4,
        metalness: 0.1,
      });
      this.finalMesh = new THREE.Mesh(dotGeometry, dotMaterial);
      this.finalMesh.position.set(p.x, p.y, p.z);
      this.scene.add(this.finalMesh);
      return;
    }

    const curve = new THREE.CatmullRomCurve3(
      this.points.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    );
    const segments = Math.max(8, this.points.length * TUBE_SEGMENTS_PER_POINT);
    const geometry = new THREE.TubeGeometry(
      curve,
      segments,
      this.radius,
      TUBE_RADIAL_SEGMENTS,
      false,
    );
    const material = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.4,
      metalness: 0.1,
    });
    this.finalMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.finalMesh);
  }

  /**
   * Removes the finished mesh from the scene WITHOUT disposing it, so an erase can be
   * undone. Disposal happens only when the action is evicted from the history.
   */
  hide(): void {
    if (this.finalMesh) this.scene.remove(this.finalMesh);
  }

  /** Puts a hidden stroke back into the scene. */
  restore(): void {
    if (this.finalMesh) this.scene.add(this.finalMesh);
  }

  /** Frees GPU memory. Scene removal alone leaks (PLAN.md §6). */
  dispose(): void {
    if (!this.finalized) {
      // finalize() is the only place that sets finalized to true, and it is also the
      // only place these fields are nulled — so while !this.finalized, they are live.
      this.scene.remove(this.liveLine!);
      this.liveGeometry!.dispose();
      this.liveMaterial!.dispose();
      this.finalized = true;
    }
    if (this.finalMesh) {
      this.scene.remove(this.finalMesh);
      this.finalMesh.geometry.dispose();
      (this.finalMesh.material as THREE.Material).dispose();
      this.finalMesh = null;
    }
  }
}
