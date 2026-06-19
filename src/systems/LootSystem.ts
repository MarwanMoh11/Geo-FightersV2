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
import { dlog } from '../core/debug';

// --- PRECOMPUTED CONSTANTS ---
const MAGNET_RADIUS_SQ = 5.0 * 5.0;

let xpInstancedMesh: THREE.InstancedMesh | null = null;
const MAX_XP_INSTANCES = 500;
const xpGeo = new THREE.BoxGeometry(1, 1, 1);
const xpBaseMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

const COLLECT_RADIUS_SQ = 1.5 * 1.5;
const MAGNET_FORCE = 32.0;
const FRICTION = 0.95;
const GRAVITY = 20.0;
const GROUND_Y = 0.3;

// Collect streak: rapid pickups climb in pitch (classic VS dopamine)
const STREAK_WINDOW = 1.0; // seconds between pickups to keep the streak
let collectStreak = 0;
let lastCollectTime = -Infinity;

export function LootSystem(dt: number, scene: THREE.Scene) {
  // Find all alive players
  const players = Array.from(
    world.with('isPlayer', 'position', 'xp', 'xpMax', 'score', 'level', 'stats'),
  ).filter((p: any) => !p.health || p.health.current > 0);
  if (players.length === 0) return;

  // We still need the local player for bank delivery (only local player handles its own bank spawn)
  const localPlayer = world.with('isLocalPlayer', 'position').first;
  if (localPlayer) {
    const px = localPlayer.position.x;
    const pz = localPlayer.position.z;
    if (shouldDeliverBankedXP()) {
      const bankedAmount = withdrawAllXP();
      const offsetX = (Math.random() - 0.5) * 4;
      const offsetZ = (Math.random() - 0.5) * 4;
      spawnXP(scene, px + offsetX, pz + offsetZ, bankedAmount);
      dlog(`[XP BANK] Delivered ${bankedAmount} XP`);
    }
  }

  for (const xp of world.with('isXP', 'position', 'velocity', 'xpValue')) {
    // Find closest player to this XP shard
    let closestPlayer: any = null;
    let minDistanceSq = Infinity;

    for (const player of players) {
      const dx = player.position.x - xp.position.x;
      const dz = player.position.z - xp.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDistanceSq) {
        minDistanceSq = distSq;
        closestPlayer = player;
      }
    }

    if (!closestPlayer) continue;

    const px = closestPlayer.position.x;
    const pz = closestPlayer.position.z;
    const dx = px - xp.position.x;
    const dz = pz - xp.position.z;
    const distSq = minDistanceSq;

    // A. DESPAWN CHECK - Bank XP and remove shards too far from closest player
    if (distSq > XP_DESPAWN_RADIUS_SQ) {
      if (closestPlayer.isLocalPlayer) {
        bankXP(xp.xpValue || 0);
      }
      despawn(xp, scene);
      continue;
    }

    // B. COLLECTION (Early check)
    if (distSq < COLLECT_RADIUS_SQ) {
      if (xp.xpValue && closestPlayer.xp !== undefined && closestPlayer.score !== undefined) {
        closestPlayer.xp += xp.xpValue;
        closestPlayer.score += 1;

        if (closestPlayer.isLocalPlayer) {
          // Streak pickups climb in pitch, reset after a quiet second
          const now = performance.now() / 1000;
          collectStreak = now - lastCollectTime < STREAK_WINDOW ? collectStreak + 1 : 0;
          lastCollectTime = now;
          playCollect(1 + Math.min(collectStreak, 12) * 0.05);

          if (closestPlayer.xp >= (closestPlayer.xpMax || 100)) {
            closestPlayer.xp = 0;
            closestPlayer.level = (closestPlayer.level || 1) + 1;
            closestPlayer.xpMax = Math.floor((closestPlayer.xpMax || 100) * 1.2);
            playLevelUp();
            triggerLevelUp();
          }
        } else {
          // If a remote player collected it, check if they level up (Host-side only)
          if (closestPlayer.xp >= (closestPlayer.xpMax || 100)) {
            closestPlayer.xp = 0;
            closestPlayer.level = (closestPlayer.level || 1) + 1;
            closestPlayer.xpMax = Math.floor((closestPlayer.xpMax || 100) * 1.2);
          }
        }
      }
      despawn(xp, scene);
      continue;
    }

    // C. MAGNETISM (Only within radius - distance band optimization)
    const magnetMult = closestPlayer.stats?.magnet || 1.0;
    const effectiveMagnetRadiusSq = MAGNET_RADIUS_SQ * magnetMult * magnetMult;

    if (distSq < effectiveMagnetRadiusSq) {
      const invDist = 1.0 / Math.sqrt(distSq);
      const nx = dx * invDist;
      const nz = dz * invDist;

      // Ease the pull in with proximity (smoothstep)
      const closeness = 1 - distSq / effectiveMagnetRadiusSq; // 0 at edge, 1 at player
      const pull = closeness * closeness * (3 - 2 * closeness); // smoothstep
      const force = MAGNET_FORCE * (0.25 + 0.75 * pull);

      xp.velocity.x += nx * force * dt;
      xp.velocity.z += nz * force * dt;
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
      xp.transform.updateMatrix();
      xp.transform.updateMatrixWorld(true);
    }
  }

  // G. RENDER INSTANCED XP
  const xpEntities = Array.from(world.with('isXP', 'transform', 'particleColor'));
  if (xpEntities.length > 0) {
    if (!xpInstancedMesh) {
      xpInstancedMesh = new THREE.InstancedMesh(xpGeo, xpBaseMat, MAX_XP_INSTANCES);
      xpInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      xpInstancedMesh.frustumCulled = false;
      
      // Pre-allocate instanceColor array to maximum size
      const defaultColor = new THREE.Color(0xffffff);
      for (let i = 0; i < MAX_XP_INSTANCES; i++) {
        xpInstancedMesh.setColorAt(i, defaultColor);
      }
      
      scene.add(xpInstancedMesh);
    }

    const count = Math.min(xpEntities.length, MAX_XP_INSTANCES);
    xpInstancedMesh.count = count;

    const tempColor = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const entity = xpEntities[i];
      if (entity.transform && entity.particleColor !== undefined) {
        xpInstancedMesh.setMatrixAt(i, entity.transform.matrixWorld);
        tempColor.setHex(entity.particleColor);
        xpInstancedMesh.setColorAt(i, tempColor);
      }
    }

    xpInstancedMesh.instanceMatrix.needsUpdate = true;
    if (xpInstancedMesh.instanceColor) {
      xpInstancedMesh.instanceColor.needsUpdate = true;
    }
    xpInstancedMesh.visible = true;
  } else {
    if (xpInstancedMesh) {
      xpInstancedMesh.count = 0;
      xpInstancedMesh.visible = false;
    }
  }
}

function despawn(entity: any, scene: THREE.Scene) {
  if (entity.transform) scene.remove(entity.transform);
  world.remove(entity);
}
