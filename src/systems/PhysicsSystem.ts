import { world } from '../core/world';

export function PhysicsSystem(dt: number) {
  for (const entity of world.with('position', 'velocity')) {
    // 1. Move
    entity.position.add(entity.velocity.clone().multiplyScalar(dt));

    // 2. GROUND CLAMP (The Gravity Fix)
    // If it is NOT a bullet, force it to the floor.
    if (!entity.isProjectile) {
      entity.position.y = 0.5; // Hard lock to ground height
      entity.velocity.y = 0; // Cancel any vertical launch forces
    }
  }
}
