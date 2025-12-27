import { world } from '../core/world';
import * as THREE from 'three';
import { triggerLevelUp } from './UpgradeSystem';
import { playCollect, playLevelUp } from '../core/audio'; // <--- NEW IMPORT

const MAGNET_RADIUS = 5.0;
const MAGNET_FORCE = 25.0;
const FRICTION = 0.95;

export function LootSystem(dt: number, scene: THREE.Scene) {
  const player = world.with('isPlayer', 'position', 'xp', 'xpMax', 'score', 'level').first;
  if (!player) return;

  for (const xp of world.with('isXP', 'position', 'velocity', 'xpValue')) {
    const distSq = xp.position.distanceToSquared(player.position);

    // 1. COLLECTION
    if (distSq < 1.5) {
      if (xp.xpValue && player.xp !== undefined && player.score !== undefined) {
        // Update Stats
        player.xp += xp.xpValue;
        player.score += 1;

        playCollect(); // <--- PLAY SOUND

        // LEVEL UP LOGIC
        if (player.xp >= (player.xpMax || 100)) {
          player.xp = 0;
          player.level = (player.level || 1) + 1;
          player.xpMax = Math.floor((player.xpMax || 100) * 1.2);

          playLevelUp(); // <--- PLAY SOUND
          triggerLevelUp();
        }
      }
      despawn(xp, scene);
      continue;
    }

    // 2. MAGNETISM
    if (distSq < MAGNET_RADIUS * MAGNET_RADIUS) {
      const direction = new THREE.Vector3().subVectors(player.position, xp.position).normalize();

      xp.velocity.add(direction.multiplyScalar(MAGNET_FORCE * dt));
      xp.velocity.multiplyScalar(0.92);
    } else {
      xp.velocity.x *= FRICTION;
      xp.velocity.z *= FRICTION;
    }

    // 3. GRAVITY
    if (xp.position.y > 0.3) {
      xp.velocity.y -= 20 * dt;
    } else {
      xp.position.y = 0.3;
      xp.velocity.y *= -0.5;
      if (Math.abs(xp.velocity.y) < 1) xp.velocity.y = 0;
    }

    // 4. MOVE
    xp.position.add(xp.velocity.clone().multiplyScalar(dt));

    if (xp.transform) {
      xp.transform.position.copy(xp.position);
      xp.transform.rotation.y += 3 * dt;
      xp.transform.rotation.x += 2 * dt;
    }
  }
}

function despawn(entity: any, scene: THREE.Scene) {
  if (entity.transform) scene.remove(entity.transform);
  world.remove(entity);
}
