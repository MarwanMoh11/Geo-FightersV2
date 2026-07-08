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
import { playCollect, playLevelUp, playCreditCollect } from '../core/audio';
import { recordCredits } from '../core/ProgressManager';
import { uiState } from '../core/UIState.svelte.ts';
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

let creditInstancedMesh: THREE.InstancedMesh | null = null;
const MAX_CREDIT_INSTANCES = 300;
const creditGeo = new THREE.OctahedronGeometry(1);
const creditBaseMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

const COLLECT_RADIUS_SQ = 1.5 * 1.5;
const MAGNET_FORCE = 32.0;
const FRICTION = 0.95;
const GRAVITY = 20.0;
const GROUND_Y = 0.3;

// Collect streak: rapid pickups climb in pitch (classic VS dopamine)
const STREAK_WINDOW = 1.0; // seconds between pickups to keep the streak
let collectStreak = 0;
let lastCollectTime = -Infinity;

const _activePlayers: any[] = [];

// Clock for client-side gem spin in LootRenderSystem
let lootRenderLast = performance.now();

// Reusable math objects to prevent per-frame allocations during rendering
const tempPosition = new THREE.Vector3();
const tempScale = new THREE.Vector3();
const tempRotation = new THREE.Euler();
const tempQuaternion = new THREE.Quaternion();
const tempMatrix = new THREE.Matrix4();
const tempColor = new THREE.Color();

export function LootSystem(dt: number, scene: THREE.Scene) {
  // Find all alive players using a pre-allocated array to prevent GC allocations
  _activePlayers.length = 0;
  for (const p of world.with('isPlayer', 'position', 'xp', 'xpMax', 'score', 'level', 'stats')) {
    if (!p.health || p.health.current > 0) {
      _activePlayers.push(p);
    }
  }
  if (_activePlayers.length === 0) return;

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

  // 1. UPDATE XP SHARDS
  for (const xp of world.with('isXP', 'position', 'velocity', 'xpValue')) {
    // Find closest player to this XP shard
    let closestPlayer: any = null;
    let minDistanceSq = Infinity;

    for (const player of _activePlayers) {
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
        // Corruption pays out: +20% XP per level.
        closestPlayer.xp += Math.ceil(xp.xpValue * (1 + uiState.corruption * 0.2));

        if (!uiState.overloadActive && closestPlayer.isLocalPlayer) {
          const maxXp = closestPlayer.xpMax || 100;
          const percent = (xp.xpValue / maxXp) * 100;
          uiState.overloadCharge = Math.min(100, uiState.overloadCharge + percent * 0.2);
        }

        closestPlayer.score += 1;

        if (closestPlayer.isLocalPlayer) {
          // Streak pickups climb in pitch, reset after a quiet second
          const now = performance.now() / 1000;
          collectStreak = now - lastCollectTime < STREAK_WINDOW ? collectStreak + 1 : 0;
          lastCollectTime = now;
          playCollect(1 + Math.min(collectStreak, 12) * 0.05);

          // Carry overflow instead of zeroing XP, and level up repeatedly so a
          // big pickup (e.g. an XP-bank delivery) grants every level it earns
          // rather than one — the extra level-ups queue in triggerLevelUp.
          let leveledUp = false;
          while (closestPlayer.xp >= (closestPlayer.xpMax || 100)) {
            closestPlayer.xp -= closestPlayer.xpMax || 100;
            closestPlayer.level = (closestPlayer.level || 1) + 1;
            closestPlayer.xpMax = Math.floor((closestPlayer.xpMax || 100) * 1.2);
            triggerLevelUp();
            leveledUp = true;
          }
          if (leveledUp) {
            playLevelUp();
            closestPlayer.levelUpFxTimer = 1.0; // celebratory rig flourish
          }
        } else {
          // If a remote player collected it, check if they level up (Host-side only)
          let remoteLeveled = false;
          while (closestPlayer.xp >= (closestPlayer.xpMax || 100)) {
            closestPlayer.xp -= closestPlayer.xpMax || 100;
            closestPlayer.level = (closestPlayer.level || 1) + 1;
            closestPlayer.xpMax = Math.floor((closestPlayer.xpMax || 100) * 1.2);
            remoteLeveled = true;
          }
          if (remoteLeveled) closestPlayer.levelUpFxTimer = 1.0; // host sees teammate flourish too
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

    // F. SYNC VISUALS (rotation properties directly on the entity)
    xp.rotationY = (xp.rotationY ?? 0) + 3 * dt;
    xp.rotationX = (xp.rotationX ?? 0) + 2 * dt;
  }

  // 2. UPDATE CYBER CREDITS
  for (const credit of world.with('isCredit', 'position', 'velocity', 'creditValue')) {
    let closestPlayer: any = null;
    let minDistanceSq = Infinity;

    for (const player of _activePlayers) {
      const dx = player.position.x - credit.position.x;
      const dz = player.position.z - credit.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDistanceSq) {
        minDistanceSq = distSq;
        closestPlayer = player;
      }
    }

    if (!closestPlayer) continue;

    const px = closestPlayer.position.x;
    const pz = closestPlayer.position.z;
    const dx = px - credit.position.x;
    const dz = pz - credit.position.z;
    const distSq = minDistanceSq;

    // A. DESPAWN CHECK
    if (distSq > XP_DESPAWN_RADIUS_SQ) {
      despawn(credit, scene);
      continue;
    }

    // B. COLLECTION
    if (distSq < COLLECT_RADIUS_SQ) {
      // Corruption pays out: +25% credits per level (rounded up).
      const val = Math.ceil((credit.creditValue || 1) * (1 + uiState.corruption * 0.25));
      if (closestPlayer.isLocalPlayer) {
        uiState.creditsCollected += val;
        uiState.credits += val;
        recordCredits(val);
        localStorage.setItem('geo_credits', JSON.stringify(uiState.credits));
        playCreditCollect();
      }
      despawn(credit, scene);
      continue;
    }

    // C. MAGNETISM
    const magnetMult = closestPlayer.stats?.magnet || 1.0;
    const effectiveMagnetRadiusSq = MAGNET_RADIUS_SQ * magnetMult * magnetMult;

    if (distSq < effectiveMagnetRadiusSq) {
      const invDist = 1.0 / Math.sqrt(distSq);
      const nx = dx * invDist;
      const nz = dz * invDist;

      const closeness = 1 - distSq / effectiveMagnetRadiusSq;
      const pull = closeness * closeness * (3 - 2 * closeness);
      const force = MAGNET_FORCE * (0.25 + 0.75 * pull) * 1.3; // Credits fly slightly faster

      credit.velocity.x += nx * force * dt;
      credit.velocity.z += nz * force * dt;
      credit.velocity.x *= 0.92;
      credit.velocity.z *= 0.92;
    } else {
      credit.velocity.x *= FRICTION;
      credit.velocity.z *= FRICTION;
    }

    // D. GRAVITY (Simple bounce)
    if (credit.position.y > GROUND_Y) {
      credit.velocity.y -= GRAVITY * dt;
    } else {
      credit.position.y = GROUND_Y;
      if (credit.velocity.y < 0) {
        credit.velocity.y *= -0.4;
        if (Math.abs(credit.velocity.y) < 1) credit.velocity.y = 0;
      }
    }

    // E. MOVE
    credit.position.x += credit.velocity.x * dt;
    credit.position.y += credit.velocity.y * dt;
    credit.position.z += credit.velocity.z * dt;

    // F. ROTATION
    credit.rotationY = (credit.rotationY ?? 0) + 4 * dt;
    credit.rotationX = (credit.rotationX ?? 0) + 3 * dt;
  }

  // Rendering of XP/credit instances is done by LootRenderSystem so it can run
  // on clients too (which don't simulate loot but must still draw the synced
  // gems). Host/solo calls it right after this simulation pass.
}

/**
 * Draw the XP + credit instanced meshes. Runs for EVERYONE — the joining
 * player mirrors the host's XP/credit entities but never runs LootSystem's
 * simulation, so without this they saw no orbs at all.
 */
export function LootRenderSystem(scene: THREE.Scene): void {
  // Clients don't run LootSystem, so the gems' idle spin isn't advanced there —
  // do it here (host/solo already spun them in the simulation pass above).
  const spinOnRender = uiState.isMultiplayer && !uiState.isHost;
  const now = performance.now();
  const rdt = Math.min(0.05, (now - lootRenderLast) / 1000);
  lootRenderLast = now;

  // Scene change check: clear cached InstancedMesh if scene changes
  if (xpInstancedMesh && xpInstancedMesh.parent !== scene) {
    xpInstancedMesh = null;
  }
  if (creditInstancedMesh && creditInstancedMesh.parent !== scene) {
    creditInstancedMesh = null;
  }

  // G. RENDER INSTANCED XP
  let xpCount = 0;
  for (const entity of world.with('isXP', 'particleColor')) {
    if (xpCount >= MAX_XP_INSTANCES) break;
    if (spinOnRender) {
      entity.rotationY = (entity.rotationY ?? 0) + 3 * rdt;
      entity.rotationX = (entity.rotationX ?? 0) + 2 * rdt;
    }

    if (!xpInstancedMesh) {
      xpInstancedMesh = new THREE.InstancedMesh(xpGeo, xpBaseMat, MAX_XP_INSTANCES);
      xpInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      xpInstancedMesh.frustumCulled = false; // Disable frustum culling

      const defaultColor = new THREE.Color(0xffffff);
      for (let i = 0; i < MAX_XP_INSTANCES; i++) {
        xpInstancedMesh.setColorAt(i, defaultColor);
      }

      scene.add(xpInstancedMesh);
    }

    tempPosition.copy(entity.position);
    tempScale.setScalar(entity.size ?? 0.6);
    tempRotation.set(entity.rotationX ?? 0, entity.rotationY ?? 0, 0);
    tempQuaternion.setFromEuler(tempRotation);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);

    xpInstancedMesh.setMatrixAt(xpCount, tempMatrix);
    tempColor.setHex(entity.particleColor ?? 0xffffff);
    xpInstancedMesh.setColorAt(xpCount, tempColor);
    xpCount++;
  }

  if (xpCount > 0 && xpInstancedMesh) {
    xpInstancedMesh.count = xpCount;
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

  // H. RENDER INSTANCED CREDITS
  let creditCount = 0;
  for (const entity of world.with('isCredit')) {
    if (creditCount >= MAX_CREDIT_INSTANCES) break;
    if (spinOnRender) {
      entity.rotationY = (entity.rotationY ?? 0) + 4 * rdt;
      entity.rotationX = (entity.rotationX ?? 0) + 3 * rdt;
    }

    if (!creditInstancedMesh) {
      creditInstancedMesh = new THREE.InstancedMesh(creditGeo, creditBaseMat, MAX_CREDIT_INSTANCES);
      creditInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      creditInstancedMesh.frustumCulled = false;
      scene.add(creditInstancedMesh);
    }

    tempPosition.copy(entity.position);
    tempScale.setScalar(entity.size ?? 0.45);
    tempRotation.set(entity.rotationX ?? 0, entity.rotationY ?? 0, 0);
    tempQuaternion.setFromEuler(tempRotation);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);

    creditInstancedMesh.setMatrixAt(creditCount, tempMatrix);
    creditCount++;
  }

  if (creditCount > 0 && creditInstancedMesh) {
    creditInstancedMesh.count = creditCount;
    creditInstancedMesh.instanceMatrix.needsUpdate = true;
    creditInstancedMesh.visible = true;
  } else {
    if (creditInstancedMesh) {
      creditInstancedMesh.count = 0;
      creditInstancedMesh.visible = false;
    }
  }
}

function despawn(entity: any, scene: THREE.Scene) {
  if (entity.transform) scene.remove(entity.transform);
  world.remove(entity);
}
