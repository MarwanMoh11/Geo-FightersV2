import * as THREE from 'three';
import { world } from '../core/world';
import { getCurrentLevel, isPointInObstacle } from '../core/LevelData';
import { spawnXP } from '../core/factories';
import { playCollect } from '../core/audio';
import { uiState } from '../core/UIState.svelte.ts';

const MAX_CRATES = 5;
const BREAK_CHECK_RANGE = 70;
const BREAK_HIT_RADIUS = 1.3;
const RESPAWN_INTERVAL = 15.0; // one crate every 15 seconds
const PICKUP_TYPES = ['medkit', 'magnet', 'bomb'] as const;

let solidMesh: THREE.InstancedMesh | null = null;
let glowMesh: THREE.InstancedMesh | null = null;
let dirty = true;
let respawnTimer = 0;

const _mat = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();

function isHostOrSolo(): boolean {
  return !uiState.isMultiplayer || uiState.isHost;
}

function initMeshes(scene: THREE.Scene): void {
  const solidGeo = new THREE.BoxGeometry(1, 0.7, 1);
  const solidMat = new THREE.MeshStandardMaterial({
    color: 0x51493a,
    roughness: 0.55,
    metalness: 0.5,
  });
  solidMesh = new THREE.InstancedMesh(solidGeo, solidMat, MAX_CRATES);
  solidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  solidMesh.frustumCulled = false;
  scene.add(solidMesh);

  const glowGeo = new THREE.BoxGeometry(1.04, 0.1, 1.04);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffcc55,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  glowMesh = new THREE.InstancedMesh(glowGeo, glowMat, MAX_CRATES);
  glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glowMesh.frustumCulled = false;
  scene.add(glowMesh);
}

function spawnCrate(x: number, z: number): void {
  world.add({
    isDestructible: true,
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    size: 0.85 + Math.random() * 0.5,
    rotationY: Math.random() * Math.PI,
  });
  dirty = true;
}

function rebuildMatrices(): void {
  if (!solidMesh || !glowMesh) return;
  let count = 0;
  for (const crate of world.with('isDestructible', 'position')) {
    if (count >= MAX_CRATES) break;
    const s = crate.size ?? 1;
    _pos.set(crate.position.x, s * 0.35, crate.position.z);
    _euler.set(0, crate.rotationY ?? 0, 0);
    _quat.setFromEuler(_euler);
    _scale.setScalar(s);
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

function breakCrate(crate: any, scene: THREE.Scene): void {
  const { x, z } = { x: crate.position!.x, z: crate.position!.z };
  world.remove(crate);
  dirty = true;
  playCollect(0.8);

  spawnXP(scene, x, z, 8);
  const type = PICKUP_TYPES[Math.floor(Math.random() * 3)];
  world.add({
    isPickup: true,
    pickupType: type,
    position: new THREE.Vector3(x, 0.4, z),
    velocity: new THREE.Vector3(),
  });
}

/**
 * Per-frame destructible crate tick: refill crates over time, detect projectile
 * hits, and rebuild instanced meshes when the set changes.
 *
 * @param {number} dt - delta time since last frame in seconds
 * @param {THREE.Scene} scene - the Three.js scene for instanced crate meshes
 */
export function DestructibleSystem(dt: number, scene: THREE.Scene): void {
  if (!isHostOrSolo()) return;
  if (!solidMesh) initMeshes(scene);

  const player = world.with('isLocalPlayer', 'position').first;
  if (!player) return;

  // Periodic refill — rare, one crate every RESPAWN_INTERVAL seconds
  const active = world.count('isDestructible');
  if (active < MAX_CRATES) {
    respawnTimer += dt;
    if (respawnTimer >= RESPAWN_INTERVAL) {
      respawnTimer = 0;
      const half = getCurrentLevel().mapWidth / 2 - 18;
      for (let a = 0; a < 6; a++) {
        const x = (Math.random() * 2 - 1) * half;
        const z = (Math.random() * 2 - 1) * half;
        const dx = x - player.position.x;
        const dz = z - player.position.z;
        if (dx * dx + dz * dz < 25 * 25) continue; // not on top of the player
        if (isPointInObstacle(x, z, getCurrentLevel().obstacles[0])) continue;
        spawnCrate(x, z);
        break;
      }
    }
  }

  // Projectile break check
  for (const p of world.with('isProjectile', 'position')) {
    const px = p.position.x;
    const pz = p.position.z;
    const dx = px - player.position.x;
    const dz = pz - player.position.z;
    if (dx * dx + dz * dz > (BREAK_CHECK_RANGE + 20) * (BREAK_CHECK_RANGE + 20)) continue;

    for (const crate of [...world.with('isDestructible', 'position')]) {
      const cdx = crate.position.x - px;
      const cdz = crate.position.z - pz;
      const hitR = BREAK_HIT_RADIUS * (crate.size ?? 1);
      if (cdx * cdx + cdz * cdz < hitR * hitR) {
        breakCrate(crate, scene);
        break;
      }
    }
  }

  if (dirty) {
    dirty = false;
    rebuildMatrices();
  }
}

/**
 * Reset all destructible state (meshes, timers) for a fresh run.
 */
export function resetDestructibles(): void {
  solidMesh = null;
  glowMesh = null;
  dirty = true;
  respawnTimer = 0;
}
