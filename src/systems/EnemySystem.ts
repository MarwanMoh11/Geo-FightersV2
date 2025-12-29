/**
 * EnemySystem - VS-Style Optimized
 *
 * Optimizations:
 * 1. Enemies have NO AI - just move toward player
 * 2. Reusable vectors (zero allocations)
 * 3. Squared distance for separation
 * 4. Limited separation checks (only nearby enemies)
 * 5. Early-out on stunned enemies
 * 
 * Signal Hijacker: Confused enemies attack other enemies
 */

import { world } from '../core/world';

// --- PRECOMPUTED CONSTANTS ---
const SEPARATION_RADIUS_SQ = 1.0 * 1.0;
const SEPARATION_STRENGTH = 20.0;
const STEER_STRENGTH = 8.0;
const STUN_FRICTION = 0.9;
const CONFUSED_ATTACK_RANGE_SQ = 2.0 * 2.0; // Range for confused enemy attacks

// --- MAX SEPARATION CHECKS PER ENEMY (Performance cap) ---
const MAX_SEPARATION_CHECKS = 10;

export function EnemySystem(dt: number) {
  const player = world.with('isPlayer', 'position').first;
  if (!player) return;

  const px = player.position.x;
  const pz = player.position.z;

  // Convert to array once per frame
  const enemies = Array.from(world.with('isEnemy', 'position', 'velocity', 'health'));
  const enemyCount = enemies.length;

  for (let i = 0; i < enemyCount; i++) {
    const enemy = enemies[i];

    // Tick confusion timer
    if (enemy.confusedTimer && enemy.confusedTimer > 0) {
      enemy.confusedTimer -= dt;
    }

    // STUN CHECK (Early processing)
    if (enemy.stunTimer && enemy.stunTimer > 0) {
      enemy.stunTimer -= dt;
      enemy.velocity.x *= STUN_FRICTION;
      enemy.velocity.z *= STUN_FRICTION;
    } else {
      // Determine target based on confusion state
      let targetX = px;
      let targetZ = pz;

      // CONFUSED: Target nearest non-confused enemy instead of player
      if (enemy.confusedTimer && enemy.confusedTimer > 0) {
        let nearestDistSq = Infinity;
        let nearestEnemy = null;

        for (let j = 0; j < enemyCount; j++) {
          if (j === i) continue;
          const other = enemies[j];
          // Don't target other confused enemies or dead enemies
          if (other.confusedTimer && other.confusedTimer > 0) continue;
          if (!other.health || other.health.current <= 0) continue;

          const dx = other.position.x - enemy.position.x;
          const dz = other.position.z - enemy.position.z;
          const distSq = dx * dx + dz * dz;

          if (distSq < nearestDistSq) {
            nearestDistSq = distSq;
            nearestEnemy = other;
          }
        }

        if (nearestEnemy) {
          targetX = nearestEnemy.position.x;
          targetZ = nearestEnemy.position.z;

          // ATTACK: Deal damage to nearby non-confused enemies
          if (nearestDistSq < CONFUSED_ATTACK_RANGE_SQ) {
            // Do 5 damage per second to nearby enemies
            nearestEnemy.health!.current -= 5 * dt;
            nearestEnemy.hitFlashTimer = 0.1;
          }
        } else {
          // No valid target, stay still
          enemy.velocity.x *= 0.9;
          enemy.velocity.z *= 0.9;
          continue;
        }
      }

      // 1. MOVE TOWARD TARGET (No pathfinding, no AI)
      const dx = targetX - enemy.position.x;
      const dz = targetZ - enemy.position.z;
      const invLen = 1.0 / Math.sqrt(dx * dx + dz * dz + 0.001);

      const speed = enemy.moveSpeed || 2.0;
      const targetVx = dx * invLen * speed;
      const targetVz = dz * invLen * speed;

      // 2. STEERING (Soft turn toward target velocity)
      const steerFactor = STEER_STRENGTH * dt;
      enemy.velocity.x += (targetVx - enemy.velocity.x) * steerFactor;
      enemy.velocity.z += (targetVz - enemy.velocity.z) * steerFactor;
    }

    // 3. SEPARATION (Limited checks for performance)
    // Only check nearby enemies, cap at MAX_SEPARATION_CHECKS
    let checksRemaining = MAX_SEPARATION_CHECKS;

    for (let j = i + 1; j < enemyCount && checksRemaining > 0; j++) {
      const other = enemies[j];

      const dx = enemy.position.x - other.position.x;
      const dz = enemy.position.z - other.position.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < SEPARATION_RADIUS_SQ && distSq > 0.0001) {
        checksRemaining--;

        // Inverse distance force (stronger when closer)
        const force = (1.0 - distSq / SEPARATION_RADIUS_SQ) * SEPARATION_STRENGTH * dt;
        const invDist = 1.0 / Math.sqrt(distSq);
        const fx = dx * invDist * force;
        const fz = dz * invDist * force;

        // Apply to both enemies (Newton's 3rd law)
        enemy.velocity.x += fx;
        enemy.velocity.z += fz;
        other.velocity.x -= fx;
        other.velocity.z -= fz;
      }
    }

    // 4. MOVE
    enemy.position.x += enemy.velocity.x * dt;
    enemy.position.z += enemy.velocity.z * dt;

    // 5. SYNC VISUALS
    if (enemy.transform) {
      enemy.transform.position.x = enemy.position.x;
      enemy.transform.position.z = enemy.position.z;
    }
  }
}
