import { world } from '../core/world';
import * as THREE from 'three';

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
const BASE_CAMERA_HEIGHT = 40;
const BASE_CAMERA_DISTANCE = 15;
const LOOKAHEAD = 0.35; // seconds of velocity to lead by
const FOLLOW_DAMPING = 6.0; // higher = tighter follow

const _focus = new THREE.Vector3();
const _desired = new THREE.Vector3();
let focusInitialized = false;

export function CameraSystem(dt: number, camera: THREE.Camera) {
  const player = world.with('isLocalPlayer', 'transform').first;
  if (!player || !player.transform) return;

  const isMobile =
    typeof window !== 'undefined' &&
    (window.innerWidth < 768 || 'ontouchstart' in window || navigator.maxTouchPoints > 0);
  const cameraHeight = isMobile ? 65 : BASE_CAMERA_HEIGHT;
  const cameraDistance = isMobile ? 26 : BASE_CAMERA_DISTANCE;

  // Smooth follow with lookahead (frame-rate independent damping)
  _desired.copy(player.transform.position);
  if (player.velocity) {
    _desired.x += player.velocity.x * LOOKAHEAD;
    _desired.z += player.velocity.z * LOOKAHEAD;
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
