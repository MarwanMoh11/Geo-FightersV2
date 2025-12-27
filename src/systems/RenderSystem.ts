import { world } from '../core/world';
import * as THREE from 'three';

let time = 0;
const dummyObj = new THREE.Object3D();

export function RenderSystem(dt: number) {
  time += dt;

  for (const entity of world.with('position', 'transform')) {
    // 1. Sync Position
    entity.transform.position.copy(entity.position);

    // 2. Rotation (Look at Target)
    // Only rotate on Y axis (Left/Right), never look Up/Down
    if (entity.aimTarget) {
      dummyObj.position.copy(entity.position);
      dummyObj.lookAt(entity.aimTarget.x, entity.position.y, entity.aimTarget.z);
      entity.transform.quaternion.slerp(dummyObj.quaternion, 0.15);
    }

    // 3. Visual Hover (The "Gentle" part)
    // We only touch the VISUAL mesh (transform), not the logic position.
    if (!entity.isProjectile) {
      const hoverFreq = 3;  // Slow, gentle speed
      const hoverAmp = 0.1; // Small height difference

      // Simple Sine Wave: float up and down
      const hoverOffset = Math.sin(time * hoverFreq) * hoverAmp;

      // Add to the base height
      entity.transform.position.y = entity.position.y + hoverOffset;
    }
  }
}