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
  return {
    // Offensive (all start at 1.0 = no bonus)
    might: 1.0,
    area: 1.0,
    cooldown: 0.0, // 0% reduction
    projectileSpeed: 1.0,
    duration: 1.0,
    amount: 0,

    // Defensive
    armor: 0,
    maxHealth: 0,
    recovery: 0,

    // Utility
    moveSpeed: 1.0,
    magnet: 1.0,
    luck: 1.0,

    // Difficulty
    curse: 1.0,
  };
}

// --- STAT APPLICATION HELPERS ---

/**
 * Calculate effective cooldown multiplier with hard cap
 */
export function getEffectiveCooldown(stats: PlayerStats): number {
  // cooldown stat is reduction (0.5 = 50% faster)
  // result is multiplier (0.5 = half the time)
  const mult = 1.0 - Math.min(stats.cooldown, 0.7);
  return Math.max(STAT_CAPS.MIN_COOLDOWN_MULT, mult);
}

/**
 * Calculate effective damage with might multiplier
 */
export function getEffectiveDamage(baseDamage: number, stats: PlayerStats): number {
  const might = Math.min(stats.might, STAT_CAPS.MAX_MIGHT);
  return Math.floor(baseDamage * might);
}

/**
 * Calculate effective area with cap
 */
export function getEffectiveArea(baseArea: number, stats: PlayerStats): number {
  const areaMult = Math.min(stats.area, STAT_CAPS.MAX_AREA);
  return baseArea * areaMult;
}

/**
 * Calculate effective projectile count
 */
export function getEffectiveAmount(baseCount: number, stats: PlayerStats): number {
  const extra = Math.min(stats.amount, STAT_CAPS.MAX_AMOUNT);
  return baseCount + extra;
}

/**
 * Calculate damage after armor reduction
 */
export function getDamageAfterArmor(incomingDamage: number, stats: PlayerStats): number {
  const reduced = incomingDamage - stats.armor;
  return Math.max(STAT_CAPS.MIN_DAMAGE_AFTER_ARMOR, reduced);
}

/**
 * Apply curse to enemy stat
 */
export function applyCurse(baseStat: number, stats: PlayerStats): number {
  return baseStat * stats.curse;
}
