/**
 * LootSystem - VS-Style Optimized XP Shard System
 *
 * Features:
 * 1. Magnet attraction toward player
 * 2. Screen-bound despawning with XP banking
 * 3. Shard merging for reduced entity count
 * 4. Tiered visuals (color/size based on value)
 */

import { world } from '../core/world';
import * as THREE from 'three';
import { triggerLevelUp } from './UpgradeSystem';
import { playCollect, playLevelUp } from '../core/audio';
import {
  bankXP,
  getTierForValue,
  XP_DESPAWN_RADIUS_SQ,
  XP_MERGE_RADIUS_SQ,
  incrementFrameCounter,
  shouldCheckMerge,
} from '../core/XPManager';

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

  // Increment frame counter for staggered merge checks
  incrementFrameCounter();

  // Apply magnet stat multiplier (default 1.0)
  const magnetMult = player.stats?.magnet || 1.0;
  const effectiveMagnetRadiusSq = MAGNET_RADIUS_SQ * magnetMult * magnetMult;

  // Collect all XP shards for merge checking
  const xpShards = Array.from(world.with('isXP', 'position', 'velocity', 'xpValue', 'transform'));

  for (let i = 0; i < xpShards.length; i++) {
    const xp = xpShards[i];
    if (!xp.xpValue) continue; // Skip if already merged/removed

    // SQUARED DISTANCE (No sqrt)
    const dx = px - xp.position.x;
    const dz = pz - xp.position.z;
    const distSq = dx * dx + dz * dz;

    // A. DESPAWN CHECK - Bank XP and remove shards too far from player
    if (distSq > XP_DESPAWN_RADIUS_SQ) {
      bankXP(xp.xpValue);
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

    // C. MERGE CHECK (Staggered by shard ID to spread CPU cost)
    if (xp.id !== undefined && shouldCheckMerge(xp.id)) {
      for (let j = i + 1; j < xpShards.length; j++) {
        const other = xpShards[j];
        if (!other.xpValue) continue;

        const mdx = xp.position.x - other.position.x;
        const mdz = xp.position.z - other.position.z;
        const mergeDistSq = mdx * mdx + mdz * mdz;

        if (mergeDistSq < XP_MERGE_RADIUS_SQ) {
          // Higher value shard absorbs lower
          if (xp.xpValue >= other.xpValue) {
            xp.xpValue += other.xpValue;
            other.xpValue = 0; // Mark as absorbed
            updateTierVisual(xp);
            despawn(other, scene);
          } else {
            other.xpValue += xp.xpValue;
            xp.xpValue = 0;
            updateTierVisual(other);
            despawn(xp, scene);
            break; // This shard is gone, stop checking
          }
        }
      }
      if (!xp.xpValue) continue; // Was absorbed
    }

    // D. MAGNETISM (Only within radius - distance band optimization)
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

    // E. GRAVITY (Simple bounce)
    if (xp.position.y > GROUND_Y) {
      xp.velocity.y -= GRAVITY * dt;
    } else {
      xp.position.y = GROUND_Y;
      if (xp.velocity.y < 0) {
        xp.velocity.y *= -0.5;
        if (Math.abs(xp.velocity.y) < 1) xp.velocity.y = 0;
      }
    }

    // F. MOVE
    xp.position.x += xp.velocity.x * dt;
    xp.position.y += xp.velocity.y * dt;
    xp.position.z += xp.velocity.z * dt;

    // G. SYNC VISUALS
    if (xp.transform) {
      xp.transform.position.x = xp.position.x;
      xp.transform.position.y = xp.position.y;
      xp.transform.position.z = xp.position.z;
      xp.transform.rotation.y += 3 * dt;
      xp.transform.rotation.x += 2 * dt;
    }
  }
}

// Update shard visual to match current tier
function updateTierVisual(xp: any): void {
  if (!xp.transform || !xp.xpValue) return;

  const tier = getTierForValue(xp.xpValue);
  const mesh = xp.transform as THREE.Mesh;

  // Update color
  if (mesh.material && (mesh.material as THREE.MeshBasicMaterial).color) {
    (mesh.material as THREE.MeshBasicMaterial).color.setHex(tier.color);
  }

  // Update scale
  mesh.scale.setScalar(tier.size / 0.25); // Scale relative to base size
}

function despawn(entity: any, scene: THREE.Scene) {
  if (entity.transform) scene.remove(entity.transform);
  world.remove(entity);
}

