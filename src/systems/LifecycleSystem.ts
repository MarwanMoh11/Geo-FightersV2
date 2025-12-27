import { world } from '../core/world';
import * as THREE from 'three';

export function LifecycleSystem(dt: number, scene: THREE.Scene) {
  // Entities with lifeTimer (like bullets)
  for (const entity of world.with('lifeTimer', 'maxLife')) {
    // FIX: Ensure properties exist
    if (entity.lifeTimer !== undefined && entity.maxLife !== undefined) {
      entity.lifeTimer += dt;

      // If time is up, delete it
      if (entity.lifeTimer >= entity.maxLife) {
        if (entity.transform) {
          scene.remove(entity.transform);
        }
        world.remove(entity);
      }
    }
  }
}
