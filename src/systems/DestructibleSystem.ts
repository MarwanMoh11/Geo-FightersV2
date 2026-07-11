// --- DESTRUCTIBLE PROPS + FLOOR CONSUMABLES (Phase 1.95, Pillar P3) ---
// "Something good every ten seconds": ~120 instanced scrap crates scattered
// so a few are always on screen. Any projectile pops them for credit/XP
// scraps and an 8% consumable roll. Consumables are the genre staples:
// MEDKIT (heal 30), MAGNA-PULSE (vacuum all XP), LOGIC BOMB (screen wipe).
//
// Rendering is two InstancedMeshes total (solid + glow strip) — same
// discipline as the enemy horde. Matrices rebuild only when the set changes.

import * as THREE from 'three';
import { world, type Entity } from '../core/world';
import { uiState, announce } from '../core/UIState.svelte.ts';
import { spawnCredit, spawnXP } from '../core/factories';
import { getCurrentLevel, isPointInObstacle } from '../core/LevelData';
import { handleEnemyDeath } from './CollisionSystem';
import { playCollect, playLevelUp } from '../core/audio';
import { haptics } from '../core/haptics';

const MAX_CRATES = 120;
const SEED_NEAR_SPAWN = 4; // guaranteed first-screen teaching props
const BREAK_CHECK_RANGE = 75; // only crates near the player can be shot anyway
const RESPAWN_INTERVAL = 2.0; // trickle refills, always off-screen
const PICKUP_RADIUS = 1.7;
const PICKUP_DROP_CHANCE = 0.08;
const BOMB_RADIUS = 26;
const BOMB_DAMAGE = 60;

let solidMesh: THREE.InstancedMesh | null = null;
let glowMesh: THREE.InstancedMesh | null = null;
let dirty = true;
let respawnTimer = 0;
let seeded = false;

const _mat = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();

// Consumable pickup meshes, managed per entity id
const pickupMeshes = new Map<number, THREE.Group>();
const PICKUP_STYLE: Record<string, { color: number; label: string }> = {
  medkit: { color: 0x4dff88, label: 'MEDKIT' },
  magnet: { color: 0x36e6ff, label: 'MAGNA-PULSE' },
  bomb: { color: 0xff3d77, label: 'LOGIC BOMB' },
  key: { color: 0xffd75e, label: 'SKELETON KEY' },
};

function isHostOrSolo(): boolean {
  return !uiState.isMultiplayer || uiState.isHost;
}

function initMeshes(scene: THREE.Scene): void {
  const solidGeo = new THREE.BoxGeometry(1, 0.75, 1);
  const solidMat = new THREE.MeshStandardMaterial({
    color: 0x51493a,
    roughness: 0.6,
    metalness: 0.45,
  });
  solidMesh = new THREE.InstancedMesh(solidGeo, solidMat, MAX_CRATES);
  solidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  solidMesh.frustumCulled = false;
  scene.add(solidMesh);

  const glowGeo = new THREE.BoxGeometry(1.04, 0.1, 1.04);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffcc55,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  glowMesh = new THREE.InstancedMesh(glowGeo, glowMat, MAX_CRATES);
  glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glowMesh.frustumCulled = false;
  scene.add(glowMesh);
}

function clearFromObstacles(x: number, z: number): boolean {
  for (const obs of getCurrentLevel().obstacles) {
    if (obs.blocking && isPointInObstacle(x, z, obs)) return false;
  }
  return true;
}

function spawnCrate(x: number, z: number): void {
  world.add({
    isDestructible: true,
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    size: 0.9 + Math.random() * 0.5,
    rotationY: Math.random() * Math.PI,
  });
  dirty = true;
}

function trySpawnCrateAt(minDistFromPlayer: number, px: number, pz: number): void {
  const half = getCurrentLevel().mapWidth / 2 - 20;
  for (let attempt = 0; attempt < 6; attempt++) {
    const x = (Math.random() * 2 - 1) * half;
    const z = (Math.random() * 2 - 1) * half;
    const dx = x - px;
    const dz = z - pz;
    if (dx * dx + dz * dz < minDistFromPlayer * minDistFromPlayer) continue;
    if (!clearFromObstacles(x, z)) continue;
    spawnCrate(x, z);
    return;
  }
}

function rebuildMatrices(): void {
  if (!solidMesh || !glowMesh) return;
  let count = 0;
  for (const crate of world.with('isDestructible', 'position')) {
    if (count >= MAX_CRATES) break;
    const size = crate.size ?? 1;
    _pos.set(crate.position.x, size * 0.38, crate.position.z);
    _euler.set(0, crate.rotationY ?? 0, 0);
    _quat.setFromEuler(_euler);
    _scale.setScalar(size);
    _mat.compose(_pos, _quat, _scale);
    solidMesh.setMatrixAt(count, _mat);
    glowMesh.setMatrixAt(count, _mat);
    count++;
  }
  solidMesh.count = count;
  glowMesh.count = count;
  solidMesh.instanceMatrix.needsUpdate = true;
  glowMesh.instanceMatrix.needsUpdate = true;
  solidMesh.visible = count > 0;
  glowMesh.visible = count > 0;
}

function breakCrate(crate: Entity, scene: THREE.Scene): void {
  const { x, z } = { x: crate.position!.x, z: crate.position!.z };
  world.remove(crate);
  dirty = true;
  playCollect(0.8);

  // Scrap payout: credits always, XP sometimes
  const credits = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < credits; i++) {
    spawnCredit(scene, x + (Math.random() - 0.5), z + (Math.random() - 0.5), 1);
  }
  if (Math.random() < 0.25) spawnXP(scene, x, z, 5);

  if (Math.random() < PICKUP_DROP_CHANCE) {
    const roll = Math.random();
    // The SKELETON KEY (Phase 1.96) rides the rare tail of the drop table —
    // roughly one crate in a hundred carries a free breach
    const type = roll < 0.4 ? 'medkit' : roll < 0.72 ? 'magnet' : roll < 0.88 ? 'bomb' : 'key';
    world.add({
      isPickup: true,
      pickupType: type,
      position: new THREE.Vector3(x, 0.8, z),
      velocity: new THREE.Vector3(),
    });
  }
}

function buildPickupMesh(scene: THREE.Scene, type: string): THREE.Group {
  const style = PICKUP_STYLE[type] ?? PICKUP_STYLE.medkit;
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.55),
    new THREE.MeshStandardMaterial({
      color: style.color,
      emissive: style.color,
      emissiveIntensity: 1.2,
    }),
  );
  group.add(core);
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.05, 24),
    new THREE.MeshBasicMaterial({
      color: style.color,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -0.6;
  group.add(halo);
  scene.add(group);
  return group;
}

function applyPickup(type: string, player: Entity, scene: THREE.Scene): void {
  const style = PICKUP_STYLE[type] ?? PICKUP_STYLE.medkit;
  haptics.reward();
  switch (type) {
    case 'medkit':
      if (player.health) {
        player.health.current = Math.min(player.health.current + 30, player.health.max);
      }
      playCollect(1.2);
      break;
    case 'magnet':
      // LootSystem treats the magnet radius as infinite while this ticks —
      // the every-gem-on-the-map vacuum moment
      uiState.magnaPulseTimer = 2.5;
      playLevelUp();
      break;
    case 'bomb': {
      playLevelUp();
      // Screen-wipe: heavy damage + stun in a big ring (host/solo authority)
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff3d77,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.2, 32), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(player.position!.x, 0.3, player.position!.z);
      scene.add(ring);
      world.add({
        isParticle: true,
        position: player.position!.clone(),
        velocity: new THREE.Vector3(),
        transform: ring,
        lifeTimer: 0,
        maxLife: 0.5,
        ringGrow: BOMB_RADIUS / 0.2 - 1,
      });
      for (const enemy of world.with('isEnemy', 'position', 'health')) {
        if (!enemy.health) continue;
        const dx = enemy.position.x - player.position!.x;
        const dz = enemy.position.z - player.position!.z;
        if (dx * dx + dz * dz > BOMB_RADIUS * BOMB_RADIUS) continue;
        enemy.health.current -= BOMB_DAMAGE;
        enemy.stunTimer = 1.5;
        enemy.hitFlashTimer = 0.15;
        if (enemy.health.current <= 0) handleEnemyDeath(enemy, scene);
      }
      break;
    }
    case 'key':
      // Phase 1.96: banked for any breach door — F (or the prompt button) skips
      // the mini-game and takes the reward
      uiState.skeletonKeys++;
      playLevelUp();
      break;
  }
  if (player.isLocalPlayer) {
    announce(type === 'key' ? 'SKELETON KEY — FREE BREACH BANKED' : style.label);
  }
}

/** Full reset for a no-reload restart (entities are swept by the run reset). */
export function resetDestructibles(): void {
  for (const mesh of pickupMeshes.values()) mesh.parent?.remove(mesh);
  pickupMeshes.clear();
  seeded = false;
  dirty = true;
  respawnTimer = 0;
}

export function DestructibleSystem(dt: number, scene: THREE.Scene): void {
  if (!isHostOrSolo()) return; // loot authority lives host-side
  if (!solidMesh) initMeshes(scene);

  const player = world.with('isLocalPlayer', 'position').first;
  if (!player) return;

  // Initial fill: a few teaching crates on the first screen, the rest spread
  if (!seeded) {
    seeded = true;
    const spawn = getCurrentLevel().spawnPoint;
    const offsets = [
      [14, 6],
      [-11, 12],
      [8, -14],
      [-16, -8],
    ];
    for (let i = 0; i < SEED_NEAR_SPAWN; i++) {
      const x = spawn.x + offsets[i][0];
      const z = spawn.z + offsets[i][1];
      if (clearFromObstacles(x, z)) spawnCrate(x, z);
    }
  }
  const active = world.count('isDestructible');
  if (active < MAX_CRATES) {
    // Burst-fill at run start (10/tick), then trickle respawns off-screen
    const burst = active < MAX_CRATES - 20 ? 10 : 0;
    for (let i = 0; i < burst; i++) {
      trySpawnCrateAt(30, player.position.x, player.position.z);
    }
    respawnTimer += dt;
    if (respawnTimer >= RESPAWN_INTERVAL) {
      respawnTimer = 0;
      trySpawnCrateAt(70, player.position.x, player.position.z);
    }
  }

  // Breaking: any projectile passing close pops a crate (checked only near
  // the player — everything shootable is on screen by definition)
  const projectiles: { x: number; z: number }[] = [];
  for (const p of world.with('isProjectile', 'position')) {
    const dx = p.position.x - player.position.x;
    const dz = p.position.z - player.position.z;
    if (dx * dx + dz * dz < 90 * 90) projectiles.push({ x: p.position.x, z: p.position.z });
  }
  if (projectiles.length) {
    for (const crate of [...world.with('isDestructible', 'position')]) {
      const dx = crate.position.x - player.position.x;
      const dz = crate.position.z - player.position.z;
      if (dx * dx + dz * dz > BREAK_CHECK_RANGE * BREAK_CHECK_RANGE) continue;
      const hitR = 1.3 * (crate.size ?? 1);
      for (const p of projectiles) {
        const px = p.x - crate.position.x;
        const pz = p.z - crate.position.z;
        if (px * px + pz * pz < hitR * hitR) {
          breakCrate(crate, scene);
          break;
        }
      }
    }
  }

  if (dirty) {
    dirty = false;
    rebuildMatrices();
  }

  // Consumables: manage meshes, bob, collect
  const now = performance.now() / 1000;
  for (const pickup of [...world.with('isPickup', 'position')]) {
    const id = pickup.id as number;
    let mesh = pickupMeshes.get(id);
    if (!mesh) {
      mesh = buildPickupMesh(scene, pickup.pickupType ?? 'medkit');
      pickupMeshes.set(id, mesh);
    }
    mesh.position.set(pickup.position.x, 0.9 + Math.sin(now * 3 + id) * 0.15, pickup.position.z);
    mesh.rotation.y = now * 1.5;

    // Any living player can grab it (host simulates for everyone)
    for (const p of world.with('isPlayer', 'position', 'health')) {
      if (!p.health || p.health.current <= 0) continue;
      const dx = p.position.x - pickup.position.x;
      const dz = p.position.z - pickup.position.z;
      if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
        applyPickup(pickup.pickupType ?? 'medkit', p, scene);
        mesh.parent?.remove(mesh);
        pickupMeshes.delete(id);
        world.remove(pickup);
        break;
      }
    }
  }
}
