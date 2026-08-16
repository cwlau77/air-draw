import * as THREE from "three";
import type { Vec3 } from "../tracking/types";
import type { SceneContext } from "./setup";

/**
 * Convert a view-relative hand position into world coordinates.
 *
 * `HandInput.tip` describes the hand relative to the VIEWER: x right, y up, z toward
 * the camera. Those axes only coincide with world axes at the default camera pose, so
 * once the user orbits, a world-space interpretation makes the cursor drift away from
 * the hand — moving the hand right would drive world-X, which no longer points right
 * on screen.
 *
 * Rotating the tip by the camera's orientation fixes that: the hand's directions always
 * match what is on screen, at any orbit angle.
 *
 * Anchored at `controls.target` rather than `camera.position` so zooming does not drag
 * the drawing volume around — the volume stays centred on whatever is being orbited.
 *
 * At the default camera pose the quaternion is identity and the target is the origin,
 * so this is the identity transform. That is the main correctness check: if the default
 * view behaves differently after this change, the transform is wrong.
 *
 * Writes into `out` and returns it, so the render loop allocates nothing per frame.
 */
export function viewToWorld(
  tip: Vec3,
  ctx: SceneContext,
  out: THREE.Vector3,
): THREE.Vector3 {
  return out
    .set(tip.x, tip.y, tip.z)
    .applyQuaternion(ctx.camera.quaternion)
    .add(ctx.controls.target);
}
