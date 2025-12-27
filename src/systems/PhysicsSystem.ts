import { world } from '../core/world';

export function PhysicsSystem(dt: number) {
  // Find ANYTHING with position and velocity (Player, Bullet, Enemy)
  for (const entity of world.with('position', 'velocity')) {
    // Simple Euler Integration: pos += vel * dt
    entity.position.add(entity.velocity.clone().multiplyScalar(dt));
  }
}
