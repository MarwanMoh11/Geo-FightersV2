/**
 * ChestSystem - Chest spawning, collection, and evolution resolution
 *
 * Chests:
 * - Spawn from elite enemy (FIREWALL) death
 * - Collect on player contact
 * - Trigger evolution scan if time >= 5 min
 * - Grant upgrades if no evolution valid
 */

import * as THREE from 'three';
import { world } from '../core/world';
import { scanForEvolutions, selectEvolution } from '../core/EvolutionRegistry';
import { WEAPONS, getWeaponStatsAtLevel } from '../core/WeaponRegistry';
import { triggerLevelUp } from './UpgradeSystem';
import { playLevelUp } from '../core/audio';
import { haptics } from '../core/haptics';
import { dlog } from '../core/debug';

// --- CONSTANTS ---
export const LEVEL_DURATION = 600; // 10 minutes for testing (boss at 8:00, escape at 10:00)
export const BOSS_SPAWN_TIME = 480; // 8:00
const CHEST_COLLECT_RADIUS = 1.5;
const CHEST_MAGNET_RADIUS = 4.0;
const CHEST_MAGNET_FORCE = 15.0;

// --- GAME TIME TRACKING ---
let gameTime = 0;

export function resetGameTime() {
  gameTime = 0;
}

export function getGameTime(): number {
  return gameTime;
}

// --- SHARED RESOURCES ---
const chestGeometry = new THREE.BoxGeometry(0.8, 0.6, 0.5);
// Brighter rarity colors that read instantly against the dark ground
const chestMaterials = {
  common: new THREE.MeshBasicMaterial({ color: 0xc9974b }), // Gold-brown
  rare: new THREE.MeshBasicMaterial({ color: 0x3fa7ff }), // Electric blue
  epic: new THREE.MeshBasicMaterial({ color: 0xc44dff }), // Vivid purple
};

// --- REUSABLE VECTORS ---
const _dir = new THREE.Vector3();

// --- PUBLIC API ---

/**
 * Spawn a chest at position
 */
export function spawnChest(
  scene: THREE.Scene,
  x: number,
  z: number,
  rarity: 'common' | 'rare' | 'epic' = 'common',
) {
  const mesh = new THREE.Mesh(chestGeometry, chestMaterials[rarity]);
  mesh.position.set(x, 0.4, z);
  mesh.castShadow = true;
  scene.add(mesh);

  return world.add({
    isChest: true,
    chestRarity: rarity,
    position: mesh.position,
    velocity: new THREE.Vector3(0, 0, 0),
    transform: mesh,
  });
}

/**
 * Main chest system update
 */
export function ChestSystem(dt: number, scene: THREE.Scene) {
  // Track game time
  gameTime += dt;

  const player = world.with('isPlayer', 'position', 'weaponSlots', 'passiveSlots', 'stats').first;
  if (!player) return;

  const chests = world.with('isChest', 'position', 'velocity', 'transform');

  for (const chest of chests) {
    const distSq = chest.position.distanceToSquared(player.position);

    // A. COLLECTION
    if (distSq < CHEST_COLLECT_RADIUS * CHEST_COLLECT_RADIUS) {
      collectChest(chest, player, scene);
      continue;
    }

    // B. MAGNETISM (eased in with proximity so the pull feels organic)
    const magnetRadiusSq = CHEST_MAGNET_RADIUS * CHEST_MAGNET_RADIUS;
    if (distSq < magnetRadiusSq) {
      _dir.subVectors(player.position, chest.position).normalize();
      const closeness = 1 - distSq / magnetRadiusSq;
      const pull = closeness * closeness * (3 - 2 * closeness); // smoothstep
      const force = CHEST_MAGNET_FORCE * (0.3 + 0.7 * pull);
      chest.velocity.x += _dir.x * force * dt;
      chest.velocity.z += _dir.z * force * dt;
      chest.velocity.multiplyScalar(0.92);
    } else {
      chest.velocity.multiplyScalar(0.95);
    }

    // C. MOVE
    chest.position.x += chest.velocity.x * dt;
    chest.position.z += chest.velocity.z * dt;

    // D. IDLE ANIMATION: slow spin + hover bob so chests beckon from afar
    if (chest.transform) {
      chest.transform.rotation.y += 1.5 * dt;
      chest.transform.position.y = 0.4 + Math.sin(gameTime * 3 + chest.position.x) * 0.08;
    }
  }
}

/**
 * Collect chest and resolve rewards
 */
function collectChest(chest: any, player: any, scene: THREE.Scene) {
  playLevelUp();
  haptics.reward();

  // 1. EVOLUTION SCAN (only if time >= threshold)
  const candidates = scanForEvolutions(
    player.weaponSlots || [],
    player.passiveSlots || [],
    gameTime,
  );

  if (candidates.length > 0) {
    // Select and perform evolution
    const selected = selectEvolution(candidates);
    if (selected) {
      performEvolution(player, selected.weaponSlotIndex, selected.evolution.evolvedWeaponId, scene);
      despawnChest(chest, scene);
      return;
    }
  }

  // 2. FALLBACK: Grant upgrade selection
  triggerLevelUp();

  despawnChest(chest, scene);
}

/**
 * Transform weapon into evolved form
 */
function performEvolution(
  player: any,
  weaponSlotIndex: number,
  evolvedWeaponId: string,
  scene: THREE.Scene,
) {
  const slots = player.weaponSlots;
  if (!slots || weaponSlotIndex >= slots.length) return;

  const oldWeaponId = slots[weaponSlotIndex].weaponId;
  const oldDef = WEAPONS[oldWeaponId];
  const evolvedDef = WEAPONS[evolvedWeaponId];
  if (!evolvedDef) return;

  // Update slot to evolved weapon (level 1, since evolved weapons don't level)
  slots[weaponSlotIndex] = {
    weaponId: evolvedWeaponId,
    level: 1,
  };

  // Find and update the weapon entity
  const evolvedStats = getWeaponStatsAtLevel(evolvedWeaponId, 1)!;

  for (const entity of world.with('isWeapon', 'ownerId', 'weapon')) {
    if (entity.ownerId === player.id && entity.weapon) {
      // Find by matching old weapon ID or fallback to color
      if (
        entity.weaponId === oldWeaponId ||
        (!entity.weaponId && oldDef && entity.weapon.bulletColor === oldDef.color)
      ) {
        entity.weaponId = evolvedWeaponId;
        // Transform weapon stats
        entity.weapon.fireRate = evolvedStats.cooldown;
        entity.weapon.damage = evolvedStats.damage;
        entity.weapon.bulletSpeed = evolvedDef.baseSpeed;
        entity.weapon.bulletColor = evolvedDef.color;
        entity.weapon.bulletLifetime = evolvedDef.baseLifetime;
        entity.weapon.bulletWidth = evolvedDef.bulletWidth;
        entity.weapon.bulletLength = evolvedDef.bulletLength;
        entity.weapon.visualStyle = evolvedDef.visualStyle;
        entity.weapon.bulletCount = evolvedStats.projectiles;
        entity.weapon.bulletSpread = evolvedDef.baseSpread;
        entity.weapon.knockback = evolvedDef.baseKnockback;
        entity.weapon.bulletPierce = evolvedStats.pierce;
        entity.weapon.bulletExplodeRadius = evolvedDef.explodeRadius;

        // Clear old orbitals if evolving an orbital weapon
        if (oldDef && oldDef.category === 'orbit') {
          for (const orbital of world.with('isOrbital', 'orbitalData')) {
            if (orbital.orbitalData?.ownerId === player.id && orbital.weaponId === oldWeaponId) {
              orbital.lifeTimer = -1;
            }
          }
        }
        break;
      }
    }
  }

  dlog(`[Evolution] ${oldWeaponId} → ${evolvedWeaponId}`);

  // Spawn evolution VFX
  spawnEvolutionVFX(player.position, scene);
}

/**
 * Spawn evolution visual effect
 */
function spawnEvolutionVFX(pos: THREE.Vector3, scene: THREE.Scene) {
  const geo = new THREE.RingGeometry(0.5, 2.0, 32);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(pos);
  mesh.position.y = 0.5;
  scene.add(mesh);

  world.add({
    isParticle: true,
    position: pos.clone(),
    velocity: new THREE.Vector3(0, 0, 0),
    transform: mesh,
    lifeTimer: 0,
    maxLife: 0.6,
    ringGrow: 2.5, // expand outward as it fades (handled by ParticleSystem)
  });
}

/**
 * Remove chest from world
 */
function despawnChest(chest: any, scene: THREE.Scene) {
  if (chest.transform) scene.remove(chest.transform);
  world.remove(chest);
}
