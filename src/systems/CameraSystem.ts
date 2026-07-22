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
// Velocity lookahead: leads the view into the direction of travel. This is the
// ONLY camera term that scales with velocity, and velocity is the only thing
// that differs between desktop (clean WASD unit vectors) and mobile (an analog
// thumb that never holds a steady vector). On the mobile rig the camera is a
// far, narrow-fov (35°) TELEPHOTO follow-cam — height 65, distance 26 — so any
// wobble in the lookahead is hugely magnified on screen, and distant props (a
// crate across the arena) swing the hardest. That is the "whole map shakes,
// only when I move" symptom. Desktop's close rig + clean input never shows it.
// So mobile gets almost no lookahead (the far cam already reveals plenty ahead);
// desktop keeps the full lead where it reads well and can't wobble.
const LOOKAHEAD_DESKTOP = 0.35; // seconds of velocity to lead by
const LOOKAHEAD_MOBILE = 0.06; // near-zero: kills the telephoto amplification
const MAX_LOOK = 2.0; // hard cap on the lookahead offset (units) — safety clamp
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

// Live on-screen half-extents in world units (x = horizontal, z = depth into
// the tilt), refreshed every frame from the real camera. Enemy spawning reads
// these to drop the horde JUST outside the visible rectangle — Vampire-Survivors
// edge spawns instead of the old fixed wall gates.
let _viewHalfX = 30;
let _viewHalfZ = 26;
export function getViewExtents(): { halfX: number; halfZ: number } {
  return { halfX: _viewHalfX, halfZ: _viewHalfZ };
}

export function CameraSystem(dt: number, camera: THREE.Camera) {
  const player = world.with('isLocalPlayer', 'transform').first;
  if (!player || !player.transform) return;

  const isMobile =
    typeof window !== 'undefined' &&
    (window.innerWidth < 768 || 'ontouchstart' in window || navigator.maxTouchPoints > 0);
  const cameraHeight = isMobile ? 65 : BASE_CAMERA_HEIGHT;
  const cameraDistance = isMobile ? 26 : BASE_CAMERA_DISTANCE;
  const lookahead = isMobile ? LOOKAHEAD_MOBILE : LOOKAHEAD_DESKTOP;

  // Ease the lookahead toward the current velocity instead of snapping to it,
  // so per-frame joystick noise can't shake the camera target.
  const lookT = 1 - Math.exp(-LOOK_DAMPING * dt);
  const vx = player.velocity ? player.velocity.x : 0;
  const vz = player.velocity ? player.velocity.z : 0;
  _look.x += (vx * lookahead - _look.x) * lookT;
  _look.z += (vz * lookahead - _look.z) * lookT;
  // Hard safety cap: the lookahead offset can never exceed MAX_LOOK, so no input
  // spike can ever throw the camera target far enough to read as a violent jump.
  const lookLen = Math.hypot(_look.x, _look.z);
  if (lookLen > MAX_LOOK) {
    _look.x = (_look.x / lookLen) * MAX_LOOK;
    _look.z = (_look.z / lookLen) * MAX_LOOK;
  }

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
    // Publish the visible half-extents for edge spawning. The +tilt term matches
    // the clampZ bias below (the camera sits +z of focus, so more far-side ground
    // is on screen); spawning must clear the FARTHEST visible edge.
    _viewHalfX = hExtent;
    _viewHalfZ = vExtent + cameraDistance * 0.45;
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

  frameDebug(dt, _focus, _look, player.velocity);
}

// --- ?fdebug ON-SCREEN FRAME DIAGNOSTIC (temporary) -------------------------
// Add ?fdebug to the URL to overlay live numbers, readable on a phone while the
// shake happens: dt (frame time), camera-target jump per frame (the actual
// visible shake — spikes here == the view lurching), lookahead offset, and
// input velocity. It reports the PEAK of each over a ~0.4s window so transient
// spikes are catchable in a screenshot. Costs nothing when the flag is absent.
const _fdOn =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('fdebug');
let _fdEl: HTMLDivElement | null = null;
let _fdPrevX = 0;
let _fdPrevZ = 0;
let _fdAcc = 0;
let _fdMaxDt = 0;
let _fdMaxJump = 0;
let _fdMaxLook = 0;
let _fdMaxVel = 0;
function frameDebug(
  dt: number,
  focus: THREE.Vector3,
  look: THREE.Vector3,
  vel?: THREE.Vector3,
): void {
  if (!_fdOn) return;
  const jump = Math.hypot(focus.x - _fdPrevX, focus.z - _fdPrevZ); // camera-target move this frame
  _fdPrevX = focus.x;
  _fdPrevZ = focus.z;
  _fdMaxDt = Math.max(_fdMaxDt, dt * 1000);
  _fdMaxJump = Math.max(_fdMaxJump, jump);
  _fdMaxLook = Math.max(_fdMaxLook, Math.hypot(look.x, look.z));
  _fdMaxVel = Math.max(_fdMaxVel, vel ? Math.hypot(vel.x, vel.z) : 0);
  _fdAcc += dt;
  if (_fdAcc < 0.4) return;
  _fdAcc = 0;
  if (!_fdEl) {
    _fdEl = document.createElement('div');
    _fdEl.style.cssText =
      'position:fixed;top:8px;left:8px;z-index:99999;background:rgba(0,0,0,.8);' +
      'color:#0f0;font:12px/1.4 monospace;padding:6px 8px;border-radius:4px;' +
      'pointer-events:none;white-space:pre;';
    document.body.appendChild(_fdEl);
  }
  _fdEl.textContent =
    `dt peak   ${_fdMaxDt.toFixed(1)} ms\n` +
    `cam jump  ${_fdMaxJump.toFixed(3)} u/frame\n` +
    `lookahead ${_fdMaxLook.toFixed(3)} u\n` +
    `velocity  ${_fdMaxVel.toFixed(2)} u/s`;
  _fdMaxDt = _fdMaxJump = _fdMaxLook = _fdMaxVel = 0;
}
