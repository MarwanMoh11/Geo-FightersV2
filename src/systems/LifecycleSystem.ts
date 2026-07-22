import { world } from '../core/world';
import * as THREE from 'three';
import { removeBody } from '../core/RapierWorld';

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
          // Ring FX clone their material for the fade-out; dispose it here
          if (entity.ringGrow !== undefined && entity.transform instanceof THREE.Mesh) {
            const material = entity.transform.material;
            if (material instanceof THREE.Material) material.dispose();
          }
        }
        // Free the Rapier body too — leaking one per expired bullet
        // degrades the physics step over the course of a run. Remove from the
        // world first so the rigidBody index doesn't strand a stale entity.
        const rb = entity.rigidBody;
        world.remove(entity);
        if (rb) {
          removeBody(rb);
          entity.rigidBody = undefined;
          entity.collider = undefined;
        }
      }
    }
  }
}
