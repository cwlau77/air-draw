import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CAMERA_FOV, CAMERA_START_Z } from "../config";
import { ERROR_MESSAGES } from "../ui/errorDisplay";

/** Thrown with a user-facing message already chosen. */
export class SceneError extends Error {}

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  render(): void;
  resize(): void;
  resetView(): void;
}

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (err) {
    console.error("[air-draw] WebGL init failed", err);
    throw new SceneError(ERROR_MESSAGES.noWebGL);
  }

  renderer.setClearColor(0x000000, 0); // transparent: the video shows through
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    1000,
  );
  camera.position.set(0, 0, CAMERA_START_Z);

  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const dir = new THREE.DirectionalLight(0xffffff, 1.5);
  dir.position.set(2, 3, 4);
  scene.add(dir);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enableZoom = true;
  // Deliberate (spec §3): there is no ground plane or other spatial reference, so
  // panning can strand the user looking at empty space with no landmark to reorient
  // by. resetView() below recovers the camera pose, but not the user's sense of where
  // the drawing is — so the pan ban stays regardless of the reset control. Do not
  // re-enable.
  controls.enablePan = false;

  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function render(): void {
    controls.update();
    renderer.render(scene, camera);
  }

  /** Snap the camera back to the front-on drawing pose. The fingertip maps to
   *  world coordinates, so orbiting desynchronises hand and cursor; this restores
   *  the orientation the mapping assumes. */
  function resetView(): void {
    camera.position.set(0, 0, CAMERA_START_Z);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  return { scene, camera, controls, render, resize, resetView };
}
