/**
 * LootSystem - VS-Style Optimized XP Shard System
 *
 * Features:
 * 1. Magnet attraction toward player
 * 2. Screen-bound despawning with XP banking
 * 3. Tiered visuals (color/size based on value)
 * 4. Bank delivery when threshold reached (500+ XP)
 */

import { world } from '../core/world';
import * as THREE from 'three';
import { triggerLevelUp } from './UpgradeSystem';
import { playCollect, playLevelUp } from '../core/audio';
import {
  bankXP,
  XP_DESPAWN_RADIUS_SQ,
  shouldDeliverBankedXP,
  withdrawAllXP,
} from '../core/XPManager';
import { spawnXP } from '../core/factories';

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

  // BANK DELIVERY - Spawn large shard when buffer exceeds threshold (500+ XP)
  if (shouldDeliverBankedXP()) {
    const bankedAmount = withdrawAllXP();
    // Spawn near player with slight offset
    const offsetX = (Math.random() - 0.5) * 4;
    const offsetZ = (Math.random() - 0.5) * 4;
    spawnXP(scene, px + offsetX, pz + offsetZ, bankedAmount);
    console.log(`[XP BANK] Delivered ${bankedAmount} XP`);
  }

  // Apply magnet stat multiplier (default 1.0)
  const magnetMult = player.stats?.magnet || 1.0;
  const effectiveMagnetRadiusSq = MAGNET_RADIUS_SQ * magnetMult * magnetMult;

  for (const xp of world.with('isXP', 'position', 'velocity', 'xpValue')) {
    // SQUARED DISTANCE (No sqrt)
    const dx = px - xp.position.x;
    const dz = pz - xp.position.z;
    const distSq = dx * dx + dz * dz;

    // A. DESPAWN CHECK - Bank XP and remove shards too far from player
    if (distSq > XP_DESPAWN_RADIUS_SQ) {
      bankXP(xp.xpValue || 0);
      despawn(xp, scene);
      continue;
    }

    // B. COLLECTION (Early check)
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

    // C. MAGNETISM (Only within radius - distance band optimization)
    if (distSq < effectiveMagnetRadiusSq) {
      const invDist = 1.0 / Math.sqrt(distSq);
      const nx = dx * invDist;
      const nz = dz * invDist;

      xp.velocity.x += nx * MAGNET_FORCE * dt;
      xp.velocity.z += nz * MAGNET_FORCE * dt;
      xp.velocity.x *= 0.92;
      xp.velocity.z *= 0.92;
    } else {
      xp.velocity.x *= FRICTION;
      xp.velocity.z *= FRICTION;
    }

    // D. GRAVITY (Simple bounce)
    if (xp.position.y > GROUND_Y) {
      xp.velocity.y -= GRAVITY * dt;
    } else {
      xp.position.y = GROUND_Y;
      if (xp.velocity.y < 0) {
        xp.velocity.y *= -0.5;
        if (Math.abs(xp.velocity.y) < 1) xp.velocity.y = 0;
      }
    }

    // E. MOVE
    xp.position.x += xp.velocity.x * dt;
    xp.position.y += xp.velocity.y * dt;
    xp.position.z += xp.velocity.z * dt;

    // F. SYNC VISUALS
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
