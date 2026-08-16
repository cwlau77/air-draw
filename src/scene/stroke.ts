import * as THREE from "three";
import type { Vec3 } from "../tracking/types";
import {
  MAX_STROKE_POINTS,
  MIN_POINT_DISTANCE,
  TUBE_RADIUS,
  TUBE_SEGMENTS_PER_POINT,
  TUBE_RADIAL_SEGMENTS,
  STROKE_COLOR,
} from "../config";

export class Stroke {
  /** Raw points are retained deliberately — future export/recognition needs them. */
  readonly points: Vec3[] = [];

  private liveGeometry: THREE.BufferGeometry;
  private liveMaterial: THREE.LineBasicMaterial;
  private liveLine: THREE.Line;
  private positions: Float32Array;
  private finalMesh: THREE.Mesh | null = null;
  private finalized = false;

  constructor(private scene: THREE.Scene) {
    this.positions = new Float32Array(MAX_STROKE_POINTS * 3);
    this.liveGeometry = new THREE.BufferGeometry();
    this.liveGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3),
    );
    this.liveGeometry.setDrawRange(0, 0);
    // THREE.Line ignores linewidth > 1 on essentially every platform. That is fine —
    // thickness comes from the TubeGeometry built in finalize().
    this.liveMaterial = new THREE.LineBasicMaterial({ color: STROKE_COLOR });
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
    this.liveGeometry.attributes.position.needsUpdate = true;
    this.liveGeometry.computeBoundingSphere();
  }

  /** Builds the final geometry exactly once, then discards the live line. */
  finalize(): void {
    if (this.finalized) return;
    this.finalized = true;

    this.scene.remove(this.liveLine);
    this.liveGeometry.dispose();
    this.liveMaterial.dispose();

    // Fewer than 2 points is a tap, not a stroke — nothing to build.
    if (this.points.length < 2) return;

    const curve = new THREE.CatmullRomCurve3(
      this.points.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    );
    const segments = Math.max(8, this.points.length * TUBE_SEGMENTS_PER_POINT);
    const geometry = new THREE.TubeGeometry(
      curve,
      segments,
      TUBE_RADIUS,
      TUBE_RADIAL_SEGMENTS,
      false,
    );
    const material = new THREE.MeshStandardMaterial({
      color: STROKE_COLOR,
      roughness: 0.4,
      metalness: 0.1,
    });
    this.finalMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.finalMesh);
  }

  /** Frees GPU memory. Scene removal alone leaks (PLAN.md §6). */
  dispose(): void {
    if (!this.finalized) {
      this.scene.remove(this.liveLine);
      this.liveGeometry.dispose();
      this.liveMaterial.dispose();
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
