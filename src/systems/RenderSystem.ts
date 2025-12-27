import { world } from '../core/world';
import * as THREE from 'three';

let time = 0;
const dummyObj = new THREE.Object3D();
const upAxis = new THREE.Vector3(0, 1, 0);

export function RenderSystem(dt: number) {
  time += dt;

  for (const entity of world.with('position', 'transform')) {
    // 1. Sync Logic Position -> Visual Mesh
    entity.transform.position.copy(entity.position);

    // 2. Auto-Aim Rotation (The Head)
    if (entity.aimTarget) {
      dummyObj.position.copy(entity.position);
      dummyObj.lookAt(entity.aimTarget);
      // Slower turn speed (0.15) for weightier feel
      entity.transform.quaternion.slerp(dummyObj.quaternion, 0.15);
    }

    // 3. Subtle "Juice" (The Body)
    if (entity.velocity && !entity.isProjectile) {
      const speed = entity.velocity.length();
      const isMoving = speed > 0.1;

      if (isMoving) {
        // FREQUENCY: 10 (Standard run cadence)
        // AMPLITUDE: 0.06 (Subtle bounce)
        const runCycle = time * 10;
        const bobOffset = Math.sin(runCycle) * 0.06;

        // Apply Vertical Bob
        entity.transform.position.y = entity.position.y + Math.abs(bobOffset);

        // Apply Subtle Rocking (Side to Side)
        // We rotate around the Z axis slightly based on the sine wave
        // This mimics shifting weight from left foot to right foot
        const rockAngle = Math.cos(runCycle) * 0.05; // +/- 3 degrees
        entity.transform.rotateZ(rockAngle);

      } else {
        // Idle Breathing (Very slow, very small)
        const breathOffset = Math.sin(time * 2) * 0.02;
        entity.transform.position.y = entity.position.y + breathOffset;
      }
    }
  }
}