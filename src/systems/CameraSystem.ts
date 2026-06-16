import { world } from '../core/world';
import * as THREE from 'three';
import { isScreenShakeEnabled } from '../core/SettingsManager';

// Global "Trauma" state
export let cameraTrauma = 0;

export function addTrauma(amount: number) {
  cameraTrauma = Math.min(cameraTrauma + amount, 1.0);
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
let shakeTime = 0;

export function CameraSystem(dt: number, camera: THREE.Camera) {
  const player = world.with('isLocalPlayer', 'transform').first;
  if (!player || !player.transform) return;

  const isMobile = typeof window !== 'undefined' && (window.innerWidth < 768 || ('ontouchstart' in window) || navigator.maxTouchPoints > 0);
  const cameraHeight = isMobile ? 65 : BASE_CAMERA_HEIGHT;
  const cameraDistance = isMobile ? 26 : BASE_CAMERA_DISTANCE;

  // 1. Decay Trauma
  if (cameraTrauma > 0) {
    cameraTrauma = Math.max(cameraTrauma - dt * 2.5, 0);
  }

  // 2. Shake offsets (smooth layered sines read nicer than per-frame random)
  let offsetX = 0;
  let offsetZ = 0;

  if (isScreenShakeEnabled() && cameraTrauma > 0) {
    shakeTime += dt;
    const shake = cameraTrauma * cameraTrauma;
    const MAX_SHAKE_OFFSET = 0.55;
    offsetX = Math.sin(shakeTime * 41.7) * shake * MAX_SHAKE_OFFSET;
    offsetZ = Math.sin(shakeTime * 53.3 + 1.7) * shake * MAX_SHAKE_OFFSET;
  }

  // 3. Smooth follow with lookahead (frame-rate independent damping)
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

  camera.position.x = _focus.x + offsetX;
  camera.position.y = cameraHeight;
  camera.position.z = _focus.z + cameraDistance + offsetZ;

  // 4. Look at the focus point (plus shake) to keep the view centered
  camera.lookAt(_focus.x + offsetX, 0, _focus.z + offsetZ);
}
