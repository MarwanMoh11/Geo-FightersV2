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
import { applyRandomChestRewards } from './UpgradeSystem';
import { playChestOpen } from '../core/audio';
import { recordChestOpened, recordEvolution } from '../core/ProgressManager';
import { uiState, showToast } from '../core/UIState.svelte.ts';
import { spawnCredit } from '../core/factories';
import { haptics } from '../core/haptics';
import { dlog } from '../core/debug';
import { sendDirectEvent, broadcastGameEvent } from '../core/network';

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

// --- CHEST DROP GOVERNOR ---
// Standard elites (firewalls especially) spawn in packs late game; without a
// governor every kill drops a chest and the ceremony modal spams. Instead:
// at most one elite chest per cooldown window — denied drops pay credits so
// the kill still feels rewarding. Guaranteed drops (mini-bosses, vaults)
// bypass the gate but reset the clock so trash chests don't stack on top.
const ELITE_CHEST_COOLDOWN = 20; // seconds between standard-elite chests

let lastChestDropTime = -999;

/**
 * Rarity scales with run time (fewer chests late, but better ones) and is
 * nudged by luck and corruption. Early: mostly common. Past 6:00: mostly
 * rare with a real epic chance.
 */
export function rollChestRarity(luck: number = 1): 'common' | 'rare' | 'epic' {
  const t = gameTime;
  // Base odds per phase: [epic, rare] thresholds, remainder = common.
  let epicChance: number;
  let rareChance: number;
  if (t < 180) {
    epicChance = 0.02;
    rareChance = 0.18;
  } else if (t < 360) {
    epicChance = 0.08;
    rareChance = 0.32;
  } else {
    epicChance = 0.18;
    rareChance = 0.42;
  }
  // Luck (1.0 = neutral) and corruption sweeten the odds.
  const bonus = (luck - 1) * 0.1 + uiState.corruption * 0.02;
  epicChance += bonus;
  rareChance += bonus;

  const roll = Math.random();
  if (roll < epicChance) return 'epic';
  if (roll < epicChance + rareChance) return 'rare';
  return 'common';
}

/**
 * Gated chest drop for standard elites. Returns true if a chest dropped;
 * callers should pay a small credit consolation when it returns false.
 */
export function tryDropEliteChest(scene: THREE.Scene, x: number, z: number, luck = 1): boolean {
  if (gameTime - lastChestDropTime < ELITE_CHEST_COOLDOWN) return false;
  lastChestDropTime = gameTime;
  spawnChest(scene, x, z, rollChestRarity(luck));
  return true;
}

/** Mark that a guaranteed chest (boss/vault) just dropped — resets the gate. */
export function registerGuaranteedChestDrop(): void {
  lastChestDropTime = gameTime;
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

  // Co-op: ANY alive player can open a chest — each chest homes toward and is
  // collected by whichever alive player is nearest (was: only the first player
  // entity, so clients could never open chests).
  const players: any[] = [];
  for (const p of world.with('isPlayer', 'position')) {
    if (!p.health || p.health.current > 0) players.push(p);
  }
  if (players.length === 0) return;

  const chests = world.with('isChest', 'position', 'velocity', 'transform');

  for (const chest of chests) {
    let nearest: any = players[0];
    let nearestSq = Infinity;
    for (const p of players) {
      const dSq = chest.position.distanceToSquared(p.position);
      if (dSq < nearestSq) {
        nearestSq = dSq;
        nearest = p;
      }
    }
    const distSq = nearestSq;

    // A. COLLECTION
    if (distSq < CHEST_COLLECT_RADIUS * CHEST_COLLECT_RADIUS) {
      collectChest(chest, nearest, scene);
      continue;
    }

    // B. MAGNETISM (eased in with proximity so the pull feels organic)
    const magnetRadiusSq = CHEST_MAGNET_RADIUS * CHEST_MAGNET_RADIUS;
    if (distSq < magnetRadiusSq) {
      _dir.subVectors(nearest.position, chest.position).normalize();
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
 * Collect chest and resolve rewards.
 * - Opener is the local player → full local ceremony (evolution scan + rewards).
 * - Opener is a remote player (host only) → the opener's own machine rolls the
 *   rewards: send them a targeted 'chest-opened' event. Their build lives on
 *   their client and syncs back via client-update.
 */
function collectChest(chest: any, player: any, scene: THREE.Scene) {
  const rarity: 'common' | 'rare' | 'epic' = chest.chestRarity || 'common';

  if (!player.isLocalPlayer) {
    // Remote opener (we are the host): hand the ceremony to their client.
    if (player.connectionId) {
      sendDirectEvent(player.connectionId, 'chest-opened', { rarity });
      broadcastGameEvent('chest-toast', {
        connectionId: player.connectionId,
        name: player.playerName || 'PLAYER',
        rarity,
      });
      showToast(`📦 ${player.playerName || 'PLAYER'} opened a ${rarity} chest`);
    }
    despawnChest(chest, scene);
    return;
  }

  playChestOpen();
  haptics.reward();
  openChestLocally(rarity, scene, chest.position);
  if (uiState.isMultiplayer && uiState.isHost) {
    broadcastGameEvent('chest-toast', {
      connectionId: player.connectionId,
      name: uiState.playerName || 'HOST',
      rarity,
    });
  }
  despawnChest(chest, scene);
}

/**
 * Resolve a chest's rewards for the LOCAL player. Used by the normal solo/host
 * path and by clients receiving a targeted 'chest-opened' event from the host.
 */
export function openChestLocally(
  rarity: 'common' | 'rare' | 'epic',
  scene?: THREE.Scene,
  position?: THREE.Vector3,
) {
  const player = world.with(
    'isLocalPlayer',
    'position',
    'weaponSlots',
    'passiveSlots',
    'stats',
  ).first;
  if (!player) return;

  recordChestOpened();

  // 1. EVOLUTION SCAN (only if time >= threshold). Clients use the synced
  // uiState.gameTime (their local ChestSystem clock never ticks).
  const timeNow = uiState.isMultiplayer && !uiState.isHost ? uiState.gameTime : gameTime;
  const candidates = scanForEvolutions(
    player.weaponSlots || [],
    player.passiveSlots || [],
    timeNow,
  );

  if (candidates.length > 0 && scene) {
    const selected = selectEvolution(candidates);
    if (selected) {
      performEvolution(player, selected.weaponSlotIndex, selected.evolution.evolvedWeaponId, scene);
      recordEvolution();
      return;
    }
  }

  // 2. CHEST CEREMONY: jackpot roll of 1/3/5 instant upgrades (VS-style —
  // the chest picks for you, the modal reveals them one by one).
  const luck = player.stats?.luck || 1;
  const jackpotBoost = (luck - 1) * 0.1; // luck nudges the good rolls
  const roll = Math.random();
  let count = 1;
  if (rarity === 'epic') {
    count = roll < 0.25 + jackpotBoost ? 5 : 3;
  } else if (rarity === 'rare') {
    count = roll < 0.08 + jackpotBoost ? 5 : roll < 0.4 + jackpotBoost ? 3 : 1;
  } else {
    count = roll < 0.03 + jackpotBoost ? 5 : roll < 0.18 + jackpotBoost ? 3 : 1;
  }

  const rewards = applyRandomChestRewards(count);
  if (rewards.length > 0) {
    uiState.chestRewards = rewards;
    uiState.chestRarity = rarity;
    uiState.showChestCeremony = true;
  } else if (scene) {
    // Build is fully maxed — pay out credits instead so chests never whiff.
    const px = position?.x ?? player.position.x;
    const pz = position?.z ?? player.position.z;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      spawnCredit(scene, px + Math.cos(a), pz + Math.sin(a), 5);
    }
  }
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
