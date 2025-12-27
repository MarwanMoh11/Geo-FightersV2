import { world } from '../core/world';
import * as THREE from 'three';

const ENEMY_SPEED = 4;
const SEPARATION_FORCE = 2.0;
const FRICTION = 0.9; // Slows down knockback

export function EnemySystem(dt: number) {
  const player = world.with('isPlayer', 'position').first;

  // If player is dead, enemies stop
  if (!player) {
    for (const enemy of world.with('isEnemy', 'velocity')) {
      enemy.velocity.set(0, 0, 0);
    }
    return;
  }

  for (const enemy of world.with('isEnemy', 'position', 'velocity')) {
    // 1. UPDATE EYES (Look at player)
    if (!enemy.aimTarget) enemy.aimTarget = new THREE.Vector3();
    enemy.aimTarget.copy(player.position);

    // --- JUICE: STUN LOGIC ---
    // If enemy was recently shot, do NOT run chase AI.
    // Instead, apply friction to the knockback force.
    if (enemy.stunTimer && enemy.stunTimer > 0) {
      enemy.stunTimer -= dt;

      // Slide physics
      enemy.velocity.multiplyScalar(FRICTION);

      // Skip the Chase/Separation logic below
      continue;
    }

    // 2. CHASE MOVEMENT (Normal AI)
    const direction = new THREE.Vector3().subVectors(player.position, enemy.position);
    direction.y = 0; // Don't fly up/down

    if (direction.lengthSq() > 0.1) {
      direction.normalize().multiplyScalar(ENEMY_SPEED);
      enemy.velocity.copy(direction);
    }

    // 3. SEPARATION (Don't stack)
    for (const otherEnemy of world.with('isEnemy', 'position')) {
      if (enemy === otherEnemy) continue;

      const dist = enemy.position.distanceToSquared(otherEnemy.position);

      if (dist < 1.0) {
        const push = new THREE.Vector3().subVectors(enemy.position, otherEnemy.position);
        push.y = 0;
        push.normalize().multiplyScalar(SEPARATION_FORCE);
        enemy.velocity.add(push);
      }
    }
  }
}
