import { world } from '../core/world';
import * as THREE from 'three';
import { triggerLevelUp } from './UpgradeSystem';
import { playCollect, playLevelUp } from '../core/audio';

const MAGNET_RADIUS = 5.0;
const MAGNET_FORCE = 25.0;
const FRICTION = 0.95;

export function LootSystem(dt: number, scene: THREE.Scene) {
  // 1. Get Player
  const player = world.with('isPlayer', 'position', 'xp', 'xpMax', 'score', 'level').first;
  if (!player) return;

  // 2. Iterate all XP Orbs
  for (const xp of world.with('isXP', 'position', 'velocity', 'xpValue')) {
    const distSq = xp.position.distanceToSquared(player.position);

    // A. COLLECTION (Close range)
    if (distSq < 1.5) {
      if (xp.xpValue && player.xp !== undefined && player.score !== undefined) {
        // Apply Stats
        player.xp += xp.xpValue;
        player.score += 1;

        playCollect(); // Sound

        // Level Up Check
        if (player.xp >= (player.xpMax || 100)) {
          player.xp = 0;
          player.level = (player.level || 1) + 1;
          player.xpMax = Math.floor((player.xpMax || 100) * 1.2);

          playLevelUp(); // Sound
          triggerLevelUp(); // Pause & Show Cards
        }
      }
      despawn(xp, scene);
      continue;
    }

    // B. MAGNETISM (Medium range)
    if (distSq < MAGNET_RADIUS * MAGNET_RADIUS) {
      const direction = new THREE.Vector3().subVectors(player.position, xp.position).normalize();

      // Accelerate towards player
      xp.velocity.add(direction.multiplyScalar(MAGNET_FORCE * dt));
      xp.velocity.multiplyScalar(0.92); // Drag to prevent orbiting
    } else {
      // Friction when idle
      xp.velocity.x *= FRICTION;
      xp.velocity.z *= FRICTION;
    }

    // C. BOUNCE (Gravity)
    if (xp.position.y > 0.3) {
      xp.velocity.y -= 20 * dt; // Gravity
    } else {
      xp.position.y = 0.3; // Floor
      xp.velocity.y *= -0.5; // Bounce dampening
      if (Math.abs(xp.velocity.y) < 1) xp.velocity.y = 0;
    }

    // D. APPLY MOVEMENT
    xp.position.add(xp.velocity.clone().multiplyScalar(dt));

    // Update Mesh
    if (xp.transform) {
      xp.transform.position.copy(xp.position);
      xp.transform.rotation.y += 3 * dt; // Spin
      xp.transform.rotation.x += 2 * dt;
    }
  }
}

function despawn(entity: any, scene: THREE.Scene) {
  if (entity.transform) scene.remove(entity.transform);
  world.remove(entity);
}
