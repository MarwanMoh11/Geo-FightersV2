import { uiState } from './UIState.svelte';

/**
 * PlayerStats - Global stat pool for Vampire Survivors-style scaling
 *
 * All weapons and systems read from this shared stat pool.
 * Stats are multiplicative by default (1.0 = 100% = no change).
 */

// --- STAT INTERFACE ---
export interface PlayerStats {
  // Offensive
  might: number; // Damage multiplier (1.0 = base damage)
  area: number; // Hitbox/AoE size multiplier
  cooldown: number; // Cooldown reduction (0.0 = none, 0.5 = 50% faster)
  projectileSpeed: number; // Bullet speed multiplier
  duration: number; // Projectile lifetime multiplier
  amount: number; // Extra projectiles (additive)

  // Defensive
  armor: number; // Flat damage reduction
  maxHealth: number; // Bonus max HP (additive)
  recovery: number; // HP regen per second

  // Utility
  moveSpeed: number; // Movement speed multiplier
  magnet: number; // XP pickup radius multiplier
  luck: number; // Affects rarity/crits

  // Self-imposed difficulty
  curse: number; // Enemy HP/speed/spawn multiplier (1.0 = normal)
}

// --- HARD CAPS ---
export const STAT_CAPS = {
  // Minimum cooldown multiplier (can't go below 30% of base cooldown)
  MIN_COOLDOWN_MULT: 0.3,

  // Maximum extra projectiles
  MAX_AMOUNT: 5,

  // Maximum area scaling
  MAX_AREA: 3.0,

  // Maximum might
  MAX_MIGHT: 5.0,

  // Armor can't reduce damage below 1
  MIN_DAMAGE_AFTER_ARMOR: 1,
};

// --- DEFAULT STATS ---
export function getDefaultStats(): PlayerStats {
  const up = uiState.permanentUpgrades || {
    might: 0,
    maxHealth: 0,
    armor: 0,
    moveSpeed: 0,
    magnet: 0,
    luck: 0,
  };
  return {
    // Offensive (all start at 1.0 = no bonus)
    might: 1.0 + up.might * 0.1, // +10% per level
    area: 1.0,
    cooldown: 0.0, // 0% reduction
    projectileSpeed: 1.0,
    duration: 1.0,
    amount: 0,

    // Defensive
    armor: up.armor * 1, // +1 Armor per level
    maxHealth: up.maxHealth * 10, // +10 Max Health per level
    recovery: 0,

    // Utility
    moveSpeed: 1.0 + up.moveSpeed * 0.05, // +5% speed per level
    magnet: 1.0 + up.magnet * 0.2, // +20% pickup area per level
    luck: 1.0 + up.luck * 0.1, // +10% luck per level

    // Difficulty
    curse: 1.0,
  };
}

// --- STAT APPLICATION HELPERS ---

// --- STAT CAP OVERFLOW TYPE ---
type OverflowAcc = Partial<Record<'cooldown' | 'might' | 'area' | 'amount', number>>;

/**
 * Calculate effective cooldown multiplier with hard cap.
 * Excess cooldown (beyond the 0.7 internal cap) converts to a might credit.
 */
export function getEffectiveCooldown(
  stats: PlayerStats,
  overflowAccumulator?: OverflowAcc,
): number {
  const acc = overflowAccumulator ?? {};
  const cooldownBonus = acc.cooldown || 0;
  const total = stats.cooldown + cooldownBonus;
  const capped = Math.min(total, 0.7);
  const over = total - capped;
  if (over > 0) {
    acc.might = (acc.might || 0) + over * 0.5;
  }
  const mult = 1.0 - capped;
  return Math.max(STAT_CAPS.MIN_COOLDOWN_MULT, mult);
}

/**
 * Calculate effective damage with might multiplier.
 * Excess might converts to a cooldown credit.
 */
export function getEffectiveDamage(
  baseDamage: number,
  stats: PlayerStats,
  overflowAccumulator?: OverflowAcc,
): number {
  const acc = overflowAccumulator ?? {};
  const mightBonus = acc.might || 0;
  const total = stats.might + mightBonus;
  const capped = Math.min(total, STAT_CAPS.MAX_MIGHT);
  const over = total - capped;
  if (over > 0) {
    acc.cooldown = (acc.cooldown || 0) + over * 0.1;
  }
  return Math.floor(baseDamage * capped);
}

/**
 * Calculate effective area with cap.
 * Excess area converts to an amount credit.
 */
export function getEffectiveArea(
  baseArea: number,
  stats: PlayerStats,
  overflowAccumulator?: OverflowAcc,
): number {
  const acc = overflowAccumulator ?? {};
  const areaBonus = acc.area || 0;
  const total = stats.area + areaBonus;
  const capped = Math.min(total, STAT_CAPS.MAX_AREA);
  const over = total - capped;
  if (over > 0) {
    acc.amount = (acc.amount || 0) + Math.floor(over / 0.5);
  }
  return baseArea * capped;
}

/**
 * Calculate effective projectile count.
 * Excess amount converts to an area credit.
 */
export function getEffectiveAmount(
  baseCount: number,
  stats: PlayerStats,
  overflowAccumulator?: OverflowAcc,
): number {
  const acc = overflowAccumulator ?? {};
  const amtBonus = acc.amount || 0;
  const total = stats.amount + amtBonus;
  const capped = Math.min(total, STAT_CAPS.MAX_AMOUNT);
  const over = total - capped;
  if (over > 0) {
    acc.area = (acc.area || 0) + over * 0.2;
  }
  return baseCount + capped;
}

/**
 * Calculate damage after armor reduction.
 */
export function getDamageAfterArmor(
  incomingDamage: number,
  stats: PlayerStats,
  _overflowAccumulator?: OverflowAcc,
): number {
  // TODO(@algo): armor overflow doesn't have a clean target
  const reduced = incomingDamage - stats.armor;
  return Math.max(STAT_CAPS.MIN_DAMAGE_AFTER_ARMOR, reduced);
}

/**
 * Apply curse to enemy stat
 */
export function applyCurse(baseStat: number, stats: PlayerStats): number {
  return baseStat * stats.curse;
}
