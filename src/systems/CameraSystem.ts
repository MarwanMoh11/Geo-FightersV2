import { world } from '../core/world';
import * as THREE from 'three';
import { isScreenShakeEnabled } from '../core/SettingsManager';

// Global "Trauma" state
export let cameraTrauma = 0;

export function addTrauma(amount: number) {
  cameraTrauma = Math.min(cameraTrauma + amount, 1.0);
}

export function CameraSystem(dt: number, camera: THREE.Camera) {
  const player = world.with('isPlayer', 'transform').first;
  if (!player || !player.transform) return;

  // 1. Decay Trauma
  if (cameraTrauma > 0) {
    cameraTrauma = Math.max(cameraTrauma - dt * 2.5, 0);
  }

  // 2. Calculate Shake Power (only if enabled in settings)
  let offsetX = 0;
  let offsetZ = 0;

  if (isScreenShakeEnabled()) {
    const shake = cameraTrauma * cameraTrauma;
    const MAX_SHAKE_OFFSET = 0.5;
    offsetX = (Math.random() * 2 - 1) * shake * MAX_SHAKE_OFFSET;
    offsetZ = (Math.random() * 2 - 1) * shake * MAX_SHAKE_OFFSET;
  }

  // 3. HARD LOCK (The Fix)
  // We removed the smoothing (Lerp). The camera now snaps instantly to the player.
  // We still add the 'offset' so the screenshake works.

  // Set X Position (Player X + Shake)
  camera.position.x = player.transform.position.x + offsetX;

  // Set Z Position (Player Z + Distance + Shake)
  // Note: We maintain the +15 distance so we are looking from above
  camera.position.z = player.transform.position.z + 15 + offsetZ;

  // 4. Look at Player
  // We still look at the player's center (plus shake) to keep the view focused
  camera.lookAt(
    player.transform.position.x + offsetX,
    player.transform.position.y,
    player.transform.position.z + offsetZ,
  );
}
