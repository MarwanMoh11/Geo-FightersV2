import { world, type Entity } from '../core/world';
import * as THREE from 'three';

const MAGNET_RADIUS = 5.0;
const MAGNET_FORCE = 25.0; // Slightly stronger pull
const FRICTION = 0.95; // Ground friction (when not magnetized)

export function LootSystem(dt: number, scene: THREE.Scene) {
  const player = world.with('isPlayer', 'position').first;
  if (!player) return;

  for (const xp of world.with('isXP', 'position', 'velocity', 'xpValue')) {
    const distSq = xp.position.distanceToSquared(player.position);

    // 1. COLLECTION
    // Increased range slightly (1.5) so you don't have to touch it pixel-perfectly
    if (distSq < 1.5) {
      if (xp.xpValue) {
        console.log(`%c +${xp.xpValue} DATA`, 'color: #00ff00; font-weight: bold;');
      }
      despawn(xp, scene);
      continue;
    }

    // 2. MAGNETISM
    if (distSq < MAGNET_RADIUS * MAGNET_RADIUS) {
      // Calculate Direction
      const direction = new THREE.Vector3().subVectors(player.position, xp.position).normalize();

      // Accelerate towards player
      xp.velocity.add(direction.multiplyScalar(MAGNET_FORCE * dt));

      // --- REFINEMENT: MAGNETIC DRAG ---
      // This is the fix. We dampen the velocity while magnetizing.
      // 0.92 means "lose 8% of speed every frame."
      // This prevents it from accelerating to infinity and overshooting.
      xp.velocity.multiplyScalar(0.92);
    } else {
      // Normal Ground Friction if far away
      xp.velocity.x *= FRICTION;
      xp.velocity.z *= FRICTION;
    }

    // 3. GRAVITY & BOUNCE
    // (Only apply gravity if it's not super close to player, to prevent weird jitter)
    if (xp.position.y > 0.3) {
      xp.velocity.y -= 20 * dt;
    } else {
      xp.position.y = 0.3;
      xp.velocity.y *= -0.5;
      if (Math.abs(xp.velocity.y) < 1) xp.velocity.y = 0;
    }

    // 4. APPLY VELOCITY
    xp.position.add(xp.velocity.clone().multiplyScalar(dt));

    // Sync Visuals
    if (xp.transform) {
      xp.transform.position.copy(xp.position);
      xp.transform.rotation.y += 3 * dt;
      xp.transform.rotation.x += 2 * dt;
    }
  }
}

function despawn(entity: Entity, scene: THREE.Scene) {
  if (entity.transform) {
    scene.remove(entity.transform);
  }
  world.remove(entity);
}
