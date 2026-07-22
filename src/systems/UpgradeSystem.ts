/**
 * UpgradeSystem - VS-Style Level-Up with Weapon/Passive Selection
 *
 * Features:
 * - Weighted random selection from available upgrades
 * - Weapon leveling (max level 8)
 * - Passive item leveling (max level 5)
 * - Slot limits (6 weapons, 6 passives)
 * - Filters out maxed items from pool
 */

import * as THREE from 'three';
import { setMusicDucked } from '../core/audio';
import { isWeaponUnlocked } from '../core/ProgressManager';
import { world } from '../core/world';
import type { WeaponSlot, PassiveSlot } from '../core/world';
import { WEAPONS, getWeaponStatsAtLevel, canLevelUp, getBaseWeapons } from '../core/WeaponRegistry';
import {
  PASSIVES,
  getPassiveBonusesAtLevel,
  canLevelUpPassive,
  getAllPassives,
} from '../core/PassiveRegistry';
import type { PlayerStats } from '../core/PlayerStats';
import { getDefaultStats } from '../core/PlayerStats';
import { getCharacter } from '../core/CharacterRegistry';
import { getProtocol } from '../core/ProtocolRegistry';

import { uiState } from '../core/UIState.svelte.ts';
import { getWeaponIcon, getPassiveIcon } from '../ui/icons';
import { dlog } from '../core/debug';
import { haptics } from '../core/haptics';

// --- CONSTANTS ---
const MAX_WEAPON_SLOTS = 6;
const MAX_PASSIVE_SLOTS = 6;
const UPGRADE_CHOICES = 3;

// --- UPGRADE TYPES ---
export type UpgradeType =
  | 'weapon_new'
  | 'weapon_level'
  | 'passive_new'
  | 'passive_level'
  | 'health';

export interface UpgradeOption {
  type: UpgradeType;
  id: string;
  name: string;
  description: string;
  currentLevel?: number;
  nextLevel?: number;
  weight: number;
  // Presentation (consumed by UpgradeModal)
  icon?: string;
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic';
}

// --- DOM (LEGACY - REMOVED) ---
// const modal = document.getElementById('upgrade-modal');
// const container = document.getElementById('cards-container');
export let isGamePaused = false;
let pendingUpgradesCount = 0;

/** Clear upgrade-modal state for a no-reload restart (dying mid-choice etc). */
export function resetUpgradeState(): void {
  isGamePaused = false;
  pendingUpgradesCount = 0;
  levelUpsDeferredByBreach = 0;
  setMusicDucked(false);
  uiState.showUpgrade = false;
  uiState.upgradeChoices = [];
}

// Level-ups rolled while the player is jacked into a breach are held back —
// the world keeps simulating during a breach and the modal would pause it
// (and bury the mini-game). BreachSystem flushes this on jack-out.
let levelUpsDeferredByBreach = 0;
export function flushDeferredLevelUps(): void {
  while (levelUpsDeferredByBreach > 0) {
    levelUpsDeferredByBreach--;
    triggerLevelUp();
  }
}

/** Balance harness (?debug only): grant a weapon directly, no modal. */
export function debugGrantWeapon(weaponId: string): void {
  const player = world.with('isLocalPlayer', 'weaponSlots').first;
  if (!player || !WEAPONS[weaponId]) return;
  if ((player.weaponSlots || []).some((s) => s.weaponId === weaponId)) return;
  addNewWeapon(player, weaponId);
  uiState.weaponSlots = [...(player.weaponSlots || [])];
}

/** ARMORY breach reward: +1 level to a random owned, non-maxed weapon. */
export function upgradeRandomOwnedWeapon(): string | null {
  const player = world.with('isLocalPlayer', 'weaponSlots').first;
  if (!player) return null;
  const candidates = (player.weaponSlots || []).filter((s) => canLevelUp(s.weaponId, s.level));
  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  levelUpWeapon(player, pick.weaponId);
  uiState.weaponSlots = [...(player.weaponSlots || [])];
  return WEAPONS[pick.weaponId]?.name ?? pick.weaponId;
}

// --- PUBLIC API ---
export function triggerLevelUp() {
  const player = world.with('isLocalPlayer', 'weaponSlots', 'passiveSlots', 'stats').first;
  if (!player) return;

  if (uiState.breach) {
    levelUpsDeferredByBreach++;
    return;
  }

  // If the upgrade screen is already showing, queue this level-up instead of overwriting
  if (uiState.showUpgrade) {
    pendingUpgradesCount++;
    dlog(`[Upgrade] Level up queued. Pending upgrades: ${pendingUpgradesCount}`);
    return;
  }

  const options = generateUpgradePool(player);

  // Auto-pick if only Health is available
  if (options.length === 1 && options[0].type === 'health') {
    selectUpgrade(options[0]);
    return;
  }

  isGamePaused = true;
  setMusicDucked(true);
  const choices = selectWeightedChoices(options, UPGRADE_CHOICES);
  uiState.upgradeChoices = choices;
  uiState.showUpgrade = true;
}

// --- POOL GENERATION ---
function generateUpgradePool(player: any): UpgradeOption[] {
  const pool: UpgradeOption[] = [];
  const weaponSlots: WeaponSlot[] = player.weaponSlots || [];
  const passiveSlots: PassiveSlot[] = player.passiveSlots || [];

  const ownedWeaponIds = new Set(weaponSlots.map((s) => s.weaponId));
  const ownedPassiveIds = new Set(passiveSlots.map((s) => s.passiveId));

  // 1. Weapon level-ups (owned weapons not at max)
  for (const slot of weaponSlots) {
    if (canLevelUp(slot.weaponId, slot.level)) {
      const def = WEAPONS[slot.weaponId];
      const nextLevel = slot.level + 1;
      pool.push({
        type: 'weapon_level',
        id: slot.weaponId,
        name: def.name,
        description: getWeaponLevelUpDesc(slot.weaponId, slot.level),
        currentLevel: slot.level,
        nextLevel,
        weight: 70, // High priority for owned weapons
        icon: getWeaponIcon(slot.weaponId),
        rarity: nextLevel >= def.maxLevel ? 'epic' : nextLevel >= 5 ? 'rare' : 'common',
      });
    }
  }

  // 2. New weapons (if slots available). Locked weapons stay out of the pool
  // until their achievement is earned — the unlock carrot.
  if (weaponSlots.length < MAX_WEAPON_SLOTS) {
    for (const def of getBaseWeapons()) {
      if (!isWeaponUnlocked(def.id)) continue;
      if (!ownedWeaponIds.has(def.id)) {
        pool.push({
          type: 'weapon_new',
          id: def.id,
          name: def.name,
          description: def.description,
          weight: 30,
          icon: getWeaponIcon(def.id),
          rarity: 'rare',
        });
      }
    }
  }

  // 3. Passive level-ups (owned passives not at max)
  for (const slot of passiveSlots) {
    if (canLevelUpPassive(slot.passiveId, slot.level)) {
      const def = PASSIVES[slot.passiveId];
      const nextLevel = slot.level + 1;
      pool.push({
        type: 'passive_level',
        id: slot.passiveId,
        name: def.name,
        description: def.description,
        currentLevel: slot.level,
        nextLevel,
        weight: 60,
        icon: getPassiveIcon(slot.passiveId),
        rarity: nextLevel >= def.maxLevel ? 'rare' : 'common',
      });
    }
  }

  // 4. New passives (if slots available)
  if (passiveSlots.length < MAX_PASSIVE_SLOTS) {
    for (const def of getAllPassives()) {
      if (def.exclusive) continue; // map-exclusive items are found in the world
      if (!ownedPassiveIds.has(def.id)) {
        pool.push({
          type: 'passive_new',
          id: def.id,
          name: def.name,
          description: def.description,
          weight: 40,
          icon: getPassiveIcon(def.id),
          rarity: 'uncommon',
        });
      }
    }
  }

  // 5. Health heal (always available as fallback)
  pool.push({
    type: 'health',
    id: 'health_boost',
    name: 'HEALTH RECHARGE',
    description: 'Restore 20 HP',
    weight: 15, // Low priority - appears less often unless pool is small
    icon: '💚',
    rarity: 'common',
  });

  return pool.filter((opt) => !uiState.bannedUpgradeIds.includes(opt.id));
}

// --- WEIGHTED SELECTION ---
function selectWeightedChoices(pool: UpgradeOption[], count: number): UpgradeOption[] {
  if (pool.length <= count) return [...pool];

  const selected: UpgradeOption[] = [];
  const remaining = [...pool];

  for (let i = 0; i < count && remaining.length > 0; i++) {
    const totalWeight = remaining.reduce((sum, opt) => sum + opt.weight, 0);
    let roll = Math.random() * totalWeight;

    for (let j = 0; j < remaining.length; j++) {
      roll -= remaining[j].weight;
      if (roll <= 0) {
        selected.push(remaining[j]);
        remaining.splice(j, 1);
        break;
      }
    }
  }

  return selected;
}

// --- UPGRADE APPLICATION ---
function applyOptionEffect(player: any, option: UpgradeOption) {
  switch (option.type) {
    case 'weapon_new':
      addNewWeapon(player, option.id);
      break;
    case 'weapon_level':
      levelUpWeapon(player, option.id);
      break;
    case 'passive_new':
      addNewPassive(player, option.id);
      break;
    case 'passive_level':
      levelUpPassive(player, option.id);
      break;
    case 'health':
      applyHealthUpgrade(player);
      break;
  }

  // Recalculate stats from passives
  recalculateStats(player);
}

/**
 * Chest ceremony: roll `count` random upgrades from the current pool and
 * apply them immediately (VS-style — chests pick for you). Returns what was
 * granted so the ceremony modal can reveal it item by item.
 */
export function applyRandomChestRewards(
  count: number,
): { name: string; icon: string; detail: string }[] {
  const player = world.with('isLocalPlayer', 'weaponSlots', 'passiveSlots', 'stats').first;
  if (!player) return [];

  const granted: { name: string; icon: string; detail: string }[] = [];
  for (let i = 0; i < count; i++) {
    const pool = generateUpgradePool(player);
    // Chests prefer real upgrades; health only when nothing else remains.
    const nonHealth = pool.filter((o) => o.type !== 'health');
    const usable = nonHealth.length > 0 ? nonHealth : pool;
    if (usable.length === 0) break;

    const totalWeight = usable.reduce((sum, o) => sum + o.weight, 0);
    let roll = Math.random() * totalWeight;
    let picked = usable[0];
    for (const o of usable) {
      roll -= o.weight;
      if (roll <= 0) {
        picked = o;
        break;
      }
    }

    applyOptionEffect(player, picked);
    granted.push({
      name: picked.name,
      icon: picked.icon || '📦',
      detail:
        picked.type === 'health'
          ? 'HP restored'
          : picked.nextLevel
            ? `LV ${picked.currentLevel} → ${picked.nextLevel}`
            : 'NEW',
    });
  }

  // Keep the Svelte HUD inventory in sync with the silently-applied items.
  uiState.weaponSlots = [...(player.weaponSlots || [])];
  uiState.passiveSlots = [...(player.passiveSlots || [])];
  return granted;
}

export function selectUpgrade(option: UpgradeOption) {
  const player = world.with('isLocalPlayer', 'weaponSlots', 'passiveSlots', 'stats').first;
  if (!player) return;

  applyOptionEffect(player, option);

  if (pendingUpgradesCount > 0) {
    pendingUpgradesCount--;
    dlog(`[Upgrade] Opening next queued level up. Remaining: ${pendingUpgradesCount}`);
    const options = generateUpgradePool(player);
    // Auto-pick if only Health is available
    if (options.length === 1 && options[0].type === 'health') {
      selectUpgrade(options[0]);
      return;
    }
    const choices = selectWeightedChoices(options, UPGRADE_CHOICES);
    uiState.upgradeChoices = choices;
    uiState.showUpgrade = true;
  } else {
    isGamePaused = false;
    setMusicDucked(false);
    uiState.showUpgrade = false;
  }
}

// --- WEAPON OPERATIONS ---
function addNewWeapon(player: any, weaponId: string) {
  const def = WEAPONS[weaponId];
  if (!def) return;

  const slots: WeaponSlot[] = player.weaponSlots || [];
  slots.push({ weaponId, level: 1 });
  player.weaponSlots = slots;

  // Spawn weapon entity
  const stats = getWeaponStatsAtLevel(weaponId, 1)!;
  world.add({
    isWeapon: true,
    weaponId: weaponId,
    ownerId: player.id,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    weapon: {
      cooldownTimer: 0.5,
      fireRate: stats.cooldown,
      damage: stats.damage,
      bulletSpeed: def.baseSpeed,
      bulletColor: def.color,
      bulletLifetime: def.baseLifetime,
      category: def.category, // For orbital weapon detection
      bulletWidth: def.bulletWidth,
      bulletLength: def.bulletLength,
      visualStyle: def.visualStyle,
      bulletCount: stats.projectiles,
      bulletSpread: def.baseSpread,
      knockback: def.baseKnockback,
      bulletPierce: stats.pierce,
      bulletExplodeRadius: def.explodeRadius,
    },
  });

  dlog(`[Upgrade] Added weapon: ${def.name}`);
}

function levelUpWeapon(player: any, weaponId: string) {
  const slots: WeaponSlot[] = player.weaponSlots || [];
  const slot = slots.find((s) => s.weaponId === weaponId);
  if (!slot) return;

  slot.level++;

  // Update existing weapon entity
  const def = WEAPONS[weaponId];
  const stats = getWeaponStatsAtLevel(weaponId, slot.level)!;

  for (const entity of world.with('isWeapon', 'ownerId', 'weapon')) {
    if (entity.ownerId === player.id && entity.weapon) {
      // Find matching weapon by ID (reliable) or fallback to color (legacy)
      if (
        entity.weaponId === weaponId ||
        (!entity.weaponId && entity.weapon.bulletColor === def.color)
      ) {
        entity.weapon.fireRate = stats.cooldown;
        entity.weapon.damage = stats.damage;
        entity.weapon.bulletCount = stats.projectiles;
        entity.weapon.bulletPierce = stats.pierce;

        // ORBITAL REFRESH FIX:
        // If this is an orbital weapon (Drone Halo, Photon Blades), we MUST clear existing orbitals.
        // WeaponSystem will automatically spawn new ones with updated stats in the next frame.
        if (def.category === 'orbit') {
          // Mark existing orbitals of this specific weapon type for death
          for (const orbital of world.with('isOrbital', 'orbitalData')) {
            if (orbital.orbitalData?.ownerId === player.id && orbital.weaponId === weaponId) {
              // Setting lifeTimer to -1 forces removal by LifecycleSystem
              orbital.lifeTimer = -1;
            }
          }
          dlog(`[Upgrade] Refreshed orbitals for ${def.name}`);
        }
        break;
      }
    }
  }

  dlog(`[Upgrade] Leveled up ${def.name} to ${slot.level}`);
}

// --- PASSIVE OPERATIONS ---
function addNewPassive(player: any, passiveId: string) {
  const def = PASSIVES[passiveId];
  if (!def) return;

  const slots: PassiveSlot[] = player.passiveSlots || [];
  slots.push({ passiveId, level: 1 });
  player.passiveSlots = slots;

  dlog(`[Upgrade] Added passive: ${def.name}`);
}

// --- HEALTH RECHARGE ---
function applyHealthUpgrade(player: any) {
  if (player.health) {
    // Heal 20 HP (capped at max)
    player.health.current = Math.min(player.health.current + 20, player.health.max);
  }
  dlog('[Upgrade] Health recharge applied (+20 HP)');
}

function levelUpPassive(player: any, passiveId: string) {
  const slots: PassiveSlot[] = player.passiveSlots || [];
  const slot = slots.find((s) => s.passiveId === passiveId);
  if (!slot) return;

  slot.level++;

  const def = PASSIVES[passiveId];
  dlog(`[Upgrade] Leveled up ${def.name} to ${slot.level}`);
}

// --- STAT RECALCULATION ---
function recalculateStats(player: any) {
  // Start from the run's *base* stats — permanent shop upgrades folded in by
  // getDefaultStats(), then the selected character's identity modifiers — and
  // layer passive bonuses on top. Previously this reset to vanilla constants,
  // which silently wiped every shop upgrade and character bonus the moment the
  // player picked any level-up or opened a chest.
  const stats: PlayerStats = getDefaultStats();
  const character = getCharacter(uiState.selectedCharacter);
  character.applyStats(stats);

  // Re-apply the run's active Data Protocol. Its stat effects (glass_kernel's
  // +80% might, vampiric_cache's +2 recovery, etc.) live only inside player.stats,
  // so without this they were wiped on the first level-up/chest — the healing
  // "stopped" and the damage buff vanished. (HP-max changes are written straight
  // to health.max in selectProtocol and persist on their own.) Applied before
  // passives so multiplicative protocol effects scale the base, not the passives.
  const protocol = getProtocol(uiState.activeProtocolId);
  if (protocol) protocol.apply(stats);

  // Apply all passive bonuses
  const passiveSlots: PassiveSlot[] = player.passiveSlots || [];
  for (const slot of passiveSlots) {
    const bonuses = getPassiveBonusesAtLevel(slot.passiveId, slot.level);
    for (const [key, value] of Object.entries(bonuses)) {
      const statKey = key as keyof PlayerStats;
      if (typeof stats[statKey] === 'number' && typeof value === 'number') {
        (stats as any)[statKey] += value;
      }
    }
  }

  player.stats = stats;
}

// --- HELPERS ---
function getWeaponLevelUpDesc(weaponId: string, currentLevel: number): string {
  const current = getWeaponStatsAtLevel(weaponId, currentLevel);
  const next = getWeaponStatsAtLevel(weaponId, currentLevel + 1);
  if (!current || !next) return 'Improve weapon stats';

  const changes: string[] = [];
  if (next.damage > current.damage) {
    const diff = Math.round(next.damage - current.damage);
    changes.push(`+${diff} DMG`);
  }
  if (next.projectiles > current.projectiles) {
    changes.push(`+${next.projectiles - current.projectiles} Projectile`);
  }
  if (next.cooldown < current.cooldown) {
    const pct = Math.round((1 - next.cooldown / current.cooldown) * 100);
    changes.push(`-${pct}% Cooldown`);
  }

  return changes.join(', ') || 'Improve stats';
}

export function rerollUpgradeChoices() {
  if (uiState.runRerolls <= 0) return;
  uiState.runRerolls--;

  const player = world.with('isLocalPlayer', 'weaponSlots', 'passiveSlots', 'stats').first;
  if (!player) return;

  const options = generateUpgradePool(player);
  const choices = selectWeightedChoices(options, UPGRADE_CHOICES);
  uiState.upgradeChoices = choices;
  haptics.select();
}

export function banishUpgradeOption(optionId: string) {
  if (uiState.runBanishes <= 0) return;
  uiState.runBanishes--;

  uiState.bannedUpgradeIds.push(optionId);

  // Trigger a free reroll to refresh the choices
  const player = world.with('isLocalPlayer', 'weaponSlots', 'passiveSlots', 'stats').first;
  if (!player) return;

  const options = generateUpgradePool(player);
  const choices = selectWeightedChoices(options, UPGRADE_CHOICES);
  uiState.upgradeChoices = choices;
  haptics.select();
}
