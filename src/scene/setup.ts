import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import {
  CAMERA_FOV,
  CAMERA_START_Z,
  BLOOM_STRENGTH,
  BLOOM_RADIUS,
  BLOOM_THRESHOLD,
} from "../config";
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

  // Emissive strokes are the only bright thing in the scene, so bloom is what makes the
  // drawing read as a light source rather than a painted tube. The renderer keeps
  // alpha: true and its transparent clear colour, so the treated video still shows
  // through — the composer must not introduce an opaque background.
  // EffectComposer builds its own render target with samples unset, so routing the
  // scene through it would silently drop the multisampling `antialias: true` asks for
  // — leaving stroke tubes and the cursor visibly jaggier while still paying for a
  // multisampled backbuffer that now only receives OutputPass's fullscreen quad.
  // An explicit target with samples: 4 puts MSAA back where the scene is actually drawn.
  const composerTarget = new THREE.WebGLRenderTarget(
    renderer.getDrawingBufferSize(new THREE.Vector2()).x,
    renderer.getDrawingBufferSize(new THREE.Vector2()).y,
    { type: THREE.HalfFloatType, samples: 4 },
  );
  const composer = new EffectComposer(renderer, composerTarget);
  composer.addPass(new RenderPass(scene, camera));
  // The resolution argument is overwritten by addPass(), which sizes every pass from
  // the composer's own dimensions — do not try to tune bloom resolution here.
  composer.addPass(
    new UnrealBloomPass(
      new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
      BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD,
    ),
  );
  composer.addPass(new OutputPass());
  // REQUIRED, not optional. When given an explicit target, EffectComposer takes its
  // internal width from that target's DEVICE pixels, then addPass() multiplies by the
  // pixel ratio again — so without this the bloom mips would run at 4x area for the
  // whole session, since resize() never fires at startup.
  composer.setSize(canvas.clientWidth, canvas.clientHeight);

  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer.setSize(w, h);
  }

  function render(): void {
    controls.update();
    composer.render();
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
