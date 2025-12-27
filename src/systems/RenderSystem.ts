import { world } from '../core/world';
import * as THREE from 'three';

let time = 0;
const dummyObj = new THREE.Object3D();

export function RenderSystem(dt: number) {
  time += dt;

  for (const entity of world.with('position', 'transform')) {
    // 1. Sync Logic Position -> Visual Mesh
    entity.transform.position.copy(entity.position);

    // 2. Auto-Aim Rotation
    if (entity.aimTarget) {
      dummyObj.position.copy(entity.position);
      dummyObj.lookAt(entity.aimTarget);
      entity.transform.quaternion.slerp(dummyObj.quaternion, 0.2);
    }

    // 3. Apply "Walking Juice" (Bobbing)
    // FIX: We added "&& !entity.isProjectile" to stop bullets from dancing
    if (entity.velocity && !entity.isProjectile) {
      const isMoving = entity.velocity.lengthSq() > 0.1;

      if (isMoving) {
        // Bob up and down (Walking)
        const bobOffset = Math.sin(time * 15) * 0.2;
        entity.transform.position.y = entity.position.y + bobOffset;

        // Tilt forward (Leaning)
        entity.transform.rotateX(0.05);
      } else {
        // Idle Breathing
        const breathOffset = Math.sin(time * 2) * 0.05;
        entity.transform.position.y = entity.position.y + breathOffset;
      }
    }
  }
}
