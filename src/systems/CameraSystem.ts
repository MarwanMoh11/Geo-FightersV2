import { world } from '../core/world';
import * as THREE from 'three';
import { getCurrentLevel } from '../core/LevelData';

/**
 * Screen shake was removed deliberately: the whole-view offset made enemies
 * appear to vibrate and read as low FPS. Impact feedback lives in hit
 * flashes, knockback, the damage vignette, and haptics instead. addTrauma is
 * kept as a no-op so combat call sites don't need to change.
 */
export function addTrauma(_amount: number) {
  /* intentionally empty — see note above */
}

// Camera rig: fixed top-down offset, smoothed focus point with velocity
// lookahead so the view leads slightly into the direction of travel.
// THE PIT: desktop height raised 40 → 46 so more of the small arena is on
// screen at once (same FOV — no distortion change).
const BASE_CAMERA_HEIGHT = 46;
const BASE_CAMERA_DISTANCE = 15;
const LOOKAHEAD = 0.35; // seconds of velocity to lead by
const FOLLOW_DAMPING = 6.0; // higher = tighter follow
const LOOK_DAMPING = 4.0; // how fast the smoothed lookahead eases to velocity
// How much void past the wall the view may show before the focus clamps.
const CLAMP_MARGIN = 10;

const _focus = new THREE.Vector3();
const _desired = new THREE.Vector3();
// Smoothed lookahead offset. A touch joystick feeds a continuous, wobbling
// velocity every frame; multiplying raw velocity into the camera target made
// the whole screen vibrate on mobile (desktop WASD is a clean constant unit
// vector, so it never showed there). Low-passing the lookahead filters that
// noise out before it reaches the camera.
const _look = new THREE.Vector3();
let focusInitialized = false;

/** Re-center the rig on the next frame (call on run reset / teleport). */
export function resetCamera(): void {
  focusInitialized = false;
  _look.set(0, 0, 0);
}

export function CameraSystem(dt: number, camera: THREE.Camera) {
  const player = world.with('isLocalPlayer', 'transform').first;
  if (!player || !player.transform) return;

  const isMobile =
    typeof window !== 'undefined' &&
    (window.innerWidth < 768 || 'ontouchstart' in window || navigator.maxTouchPoints > 0);
  const cameraHeight = isMobile ? 65 : BASE_CAMERA_HEIGHT;
  const cameraDistance = isMobile ? 26 : BASE_CAMERA_DISTANCE;

  // Ease the lookahead toward the current velocity instead of snapping to it,
  // so per-frame joystick noise can't shake the camera target.
  const lookT = 1 - Math.exp(-LOOK_DAMPING * dt);
  const vx = player.velocity ? player.velocity.x : 0;
  const vz = player.velocity ? player.velocity.z : 0;
  _look.x += (vx * LOOKAHEAD - _look.x) * lookT;
  _look.z += (vz * LOOKAHEAD - _look.z) * lookT;

  _desired.copy(player.transform.position);
  _desired.x += _look.x;
  _desired.z += _look.z;

  // ARENA CLAMP: in a small bounded map the follow-cam must not waste half the
  // screen on the void past the walls. Clamp the DESIRED target (before the
  // follow lerp) so the camera EASES to the boundary. Clamping after the lerp
  // rectified the target at the edge — on mobile portrait clampZ sits ~30% into
  // the playable arena, so the noisy lookahead crossing it made the view
  // vibrate. Extents derive from the real fov/aspect so the clamp adapts to any
  // window shape; if the whole arena fits, the clamp collapses to 0 (pin center).
  const persp = camera as THREE.PerspectiveCamera;
  if (persp.isPerspectiveCamera) {
    const half = getCurrentLevel().mapWidth / 2;
    const vExtent = cameraHeight * Math.tan(((persp.fov / 2) * Math.PI) / 180);
    const hExtent = vExtent * persp.aspect;
    const clampX = Math.max(0, half + CLAMP_MARGIN - hExtent);
    // The tilt (camera sits +z of focus) shows extra far-side ground; bias for it
    const clampZ = Math.max(0, half + CLAMP_MARGIN - vExtent - cameraDistance * 0.45);
    _desired.x = Math.max(-clampX, Math.min(clampX, _desired.x));
    _desired.z = Math.max(-clampZ, Math.min(clampZ, _desired.z));
  }

  if (!focusInitialized) {
    _focus.copy(_desired);
    focusInitialized = true;
  } else {
    const t = 1 - Math.exp(-FOLLOW_DAMPING * dt);
    _focus.lerp(_desired, t);
  }

  camera.position.x = _focus.x;
  camera.position.y = cameraHeight;
  camera.position.z = _focus.z + cameraDistance;

  // Look at the focus point to keep the view centered
  camera.lookAt(_focus.x, 0, _focus.z);
}
