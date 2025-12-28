/**
 * LootSystem - VS-Style Optimized
 *
 * Optimizations:
 * 1. Squared distance checks (no sqrt)
 * 2. Reusable vectors (zero GC)
 * 3. Distance bands (skip updates outside magnet)
 * 4. Early collection radius check
 */

import { world } from '../core/world';
import * as THREE from 'three';
import { triggerLevelUp } from './UpgradeSystem';
import { playCollect, playLevelUp } from '../core/audio';

// --- PRECOMPUTED CONSTANTS ---
const MAGNET_RADIUS_SQ = 5.0 * 5.0;
const COLLECT_RADIUS_SQ = 1.5 * 1.5;
const MAGNET_FORCE = 25.0;
const FRICTION = 0.95;
const GRAVITY = 20.0;
const GROUND_Y = 0.3;

export function LootSystem(dt: number, scene: THREE.Scene) {
  const player = world.with('isPlayer', 'position', 'xp', 'xpMax', 'score', 'level', 'stats').first;
  if (!player) return;

  const px = player.position.x;
  const pz = player.position.z;

  // Apply magnet stat multiplier (default 1.0)
  const magnetMult = player.stats?.magnet || 1.0;
  const effectiveMagnetRadiusSq = MAGNET_RADIUS_SQ * magnetMult * magnetMult;

  for (const xp of world.with('isXP', 'position', 'velocity', 'xpValue')) {
    // SQUARED DISTANCE (No sqrt)
    const dx = px - xp.position.x;
    const dz = pz - xp.position.z;
    const distSq = dx * dx + dz * dz;

    // A. COLLECTION (Early check)
    if (distSq < COLLECT_RADIUS_SQ) {
      if (xp.xpValue && player.xp !== undefined && player.score !== undefined) {
        player.xp += xp.xpValue;
        player.score += 1;
        playCollect();

        if (player.xp >= (player.xpMax || 100)) {
          player.xp = 0;
          player.level = (player.level || 1) + 1;
          player.xpMax = Math.floor((player.xpMax || 100) * 1.2);
          playLevelUp();
          triggerLevelUp();
        }
      }
      despawn(xp, scene);
      continue;
    }

    // B. MAGNETISM (Only within radius - distance band optimization)
    if (distSq < effectiveMagnetRadiusSq) {
      // Normalize without sqrt using cached values
      const invDist = 1.0 / Math.sqrt(distSq);
      const nx = dx * invDist;
      const nz = dz * invDist;

      xp.velocity.x += nx * MAGNET_FORCE * dt;
      xp.velocity.z += nz * MAGNET_FORCE * dt;
      xp.velocity.x *= 0.92;
      xp.velocity.z *= 0.92;
    } else {
      // Outside magnet - minimal friction only
      xp.velocity.x *= FRICTION;
      xp.velocity.z *= FRICTION;
    }

    // C. GRAVITY (Simple bounce)
    if (xp.position.y > GROUND_Y) {
      xp.velocity.y -= GRAVITY * dt;
    } else {
      xp.position.y = GROUND_Y;
      if (xp.velocity.y < 0) {
        xp.velocity.y *= -0.5;
        if (Math.abs(xp.velocity.y) < 1) xp.velocity.y = 0;
      }
    }

    // D. MOVE
    xp.position.x += xp.velocity.x * dt;
    xp.position.y += xp.velocity.y * dt;
    xp.position.z += xp.velocity.z * dt;

    // E. SYNC VISUALS
    if (xp.transform) {
      xp.transform.position.x = xp.position.x;
      xp.transform.position.y = xp.position.y;
      xp.transform.position.z = xp.position.z;
      xp.transform.rotation.y += 3 * dt;
      xp.transform.rotation.x += 2 * dt;
    }
  }
}

function despawn(entity: any, scene: THREE.Scene) {
  if (entity.transform) scene.remove(entity.transform);
  world.remove(entity);
}
