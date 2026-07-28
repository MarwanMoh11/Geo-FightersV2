/**
 * ShopRegistry — the permanent-upgrade catalogue and its cost curve.
 *
 * This table used to live inside MainMenu.svelte, which meant the economy
 * could only be reasoned about by reading a UI component. It is game balance,
 * not presentation, so it lives here and the menu renders whatever it finds.
 *
 * ---------------------------------------------------------------------------
 * WHY THE COST CURVE HAS A GLOBAL FEE
 *
 * The old curve was per-track only: `baseCost * costScale^rank`, capped at 3-5
 * ranks across 8 tracks. Every track therefore maxed out cheaply and in
 * isolation, and the whole shop totalled 28,678 credits — less than a single
 * strong run pays out. The meta-progression was exhausted in under one run by
 * exactly the players it was meant to reward.
 *
 * The fix, borrowed from Vampire Survivors, is a surcharge that scales with
 * how many ranks you have bought IN TOTAL, across every track:
 *
 *     cost = baseCost * costScale^rank  +  FEE_BASE * FEE_GROWTH^totalOwned
 *
 * Two properties make this the right shape:
 *
 *  1. The fee is additive and depends only on the COUNT of ranks owned, so the
 *     grand total is identical regardless of purchase order. Players can chase
 *     whatever they like without an optimal-order metagame punishing them.
 *  2. The fee, not the base cost, comes to dominate. Here the base costs sum to
 *     ~56k while the fees sum to ~166k, so the last ranks are the expensive
 *     ones and the tail is long without any individual price looking absurd.
 *
 * Tuning is these two constants. Raising FEE_GROWTH lengthens the endgame
 * sharply; raising FEE_BASE makes the early game costlier more evenly.
 * ---------------------------------------------------------------------------
 */

export type ShopCategory = 'power' | 'economy' | 'agency';

export interface ShopTrack {
  id: string;
  name: string;
  short: string;
  icon: string;
  desc: string;
  max: number;
  baseCost: number;
  costScale: number;
  category: ShopCategory;
}

/** Global surcharge constants. See the header for what they control. */
export const FEE_BASE = 28;
export const FEE_GROWTH = 1.1;

export const SHOP_CATEGORY_LABELS: Record<ShopCategory, string> = {
  power: 'CORE SYSTEMS',
  economy: 'YIELD',
  agency: 'CONTROL',
};

export const SHOP_TRACKS: ShopTrack[] = [
  // --- POWER -------------------------------------------------------------
  // Per-rank magnitudes are unchanged from the original table; the tracks are
  // simply deeper, so there is somewhere to spend late-game credits.
  {
    id: 'might',
    name: 'Output Wattage',
    short: 'MIGHT',
    icon: '⚔️',
    desc: '+10% damage output per level',
    max: 8,
    baseCost: 150,
    costScale: 1.55,
    category: 'power',
  },
  {
    id: 'maxHealth',
    name: 'Armor Shell',
    short: 'HP',
    icon: '❤️',
    desc: '+10 max HP per level',
    max: 8,
    baseCost: 100,
    costScale: 1.5,
    category: 'power',
  },
  {
    id: 'armor',
    name: 'Reinforced Core',
    short: 'ARMOR',
    icon: '🛡️',
    desc: '+1 damage reduction per level',
    max: 6,
    baseCost: 200,
    costScale: 1.6,
    category: 'power',
  },
  {
    id: 'moveSpeed',
    name: 'Overclocked Thrusters',
    short: 'SPEED',
    icon: '💨',
    desc: '+5% move speed per level',
    max: 6,
    baseCost: 120,
    costScale: 1.5,
    category: 'power',
  },
  {
    id: 'magnet',
    name: 'Tractor Beam',
    short: 'MAGNET',
    icon: '🧲',
    desc: '+20% pickup range per level',
    max: 5,
    baseCost: 80,
    costScale: 1.5,
    category: 'power',
  },
  {
    id: 'luck',
    name: 'Precision Luck',
    short: 'LUCK',
    icon: '🎲',
    desc: '+10% crit and rarity chance',
    max: 6,
    baseCost: 150,
    costScale: 1.55,
    category: 'power',
  },

  // --- ECONOMY -----------------------------------------------------------
  // Self-referential sinks: they make the grind faster, which is what earns a
  // bigger grand total the right to exist. A player who feels the shop is slow
  // has something to buy that fixes it.
  {
    id: 'greed',
    name: 'Skim Protocol',
    short: 'GREED',
    icon: '🪙',
    desc: '+8% credits earned per level',
    max: 5,
    baseCost: 300,
    costScale: 1.6,
    category: 'economy',
  },
  {
    id: 'growth',
    name: 'Parallel Compile',
    short: 'GROWTH',
    icon: '📈',
    desc: '+5% XP gained per level',
    max: 5,
    baseCost: 300,
    costScale: 1.6,
    category: 'economy',
  },

  // --- AGENCY ------------------------------------------------------------
  // The category the shop was missing entirely. Six of the eight original
  // tracks were flat stats, so nothing purchasable could change WHICH items a
  // run offered — which is why a maxed shop still lost runs that rolled badly.
  // These buy steering, not power.
  {
    id: 'rerolls',
    name: 'Defrag Reroll',
    short: 'REROLL',
    icon: '🔄',
    desc: '+1 level-up reroll per run',
    max: 5,
    baseCost: 200,
    costScale: 1.7,
    category: 'agency',
  },
  {
    id: 'banishes',
    name: 'System Banish',
    short: 'BANISH',
    icon: '🚫',
    desc: '+1 level-up banish per run',
    max: 5,
    baseCost: 250,
    costScale: 1.7,
    category: 'agency',
  },
  {
    id: 'skips',
    name: 'Cold Storage',
    short: 'SKIP',
    icon: '⏭️',
    desc: '+1 level-up skip per run (bank the XP instead)',
    max: 5,
    baseCost: 180,
    costScale: 1.7,
    category: 'agency',
  },
  {
    id: 'purge',
    name: 'Blacklist Daemon',
    short: 'PURGE',
    icon: '🗑️',
    desc: 'Permanently bar 1 more item from every run',
    max: 3,
    baseCost: 1200,
    costScale: 2.0,
    category: 'agency',
  },
];

export const SHOP_TRACKS_BY_ID: Record<string, ShopTrack> = Object.fromEntries(
  SHOP_TRACKS.map((t) => [t.id, t]),
);

/** Every track at rank 0, for seeding a fresh save. */
export function getShopDefaults(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of SHOP_TRACKS) out[t.id] = 0;
  return out;
}

/** How many ranks the player owns across every track — drives the global fee. */
export function totalRanksOwned(owned: Record<string, number>): number {
  let n = 0;
  for (const t of SHOP_TRACKS) n += owned[t.id] || 0;
  return n;
}

/** The surcharge applied to the next purchase, whatever it is. */
export function purchaseFee(totalOwned: number): number {
  return Math.floor(FEE_BASE * Math.pow(FEE_GROWTH, totalOwned));
}

/**
 * Price of taking `track` from `rank` to `rank + 1`, given the player's total
 * rank count. Returns null when the track is already maxed.
 */
export function getTrackCost(track: ShopTrack, rank: number, totalOwned: number): number | null {
  if (rank >= track.max) return null;
  return Math.floor(track.baseCost * Math.pow(track.costScale, rank)) + purchaseFee(totalOwned);
}

/** Cost of buying every remaining rank from the given state. Used by tests/tuning. */
export function getRemainingCost(owned: Record<string, number>): number {
  let total = 0;
  let bought = totalRanksOwned(owned);
  for (const t of SHOP_TRACKS) {
    for (let r = owned[t.id] || 0; r < t.max; r++) {
      total += Math.floor(t.baseCost * Math.pow(t.costScale, r)) + purchaseFee(bought);
      bought++;
    }
  }
  return total;
}

// --- DERIVED MULTIPLIERS ----------------------------------------------------
// Read by the systems that actually pay out, so the shop description and the
// balance can never drift apart.

/** Credit payout multiplier from GREED. */
export function greedMultiplier(owned: Record<string, number>): number {
  return 1 + (owned.greed || 0) * 0.08;
}

/** XP gain multiplier from GROWTH. */
export function growthMultiplier(owned: Record<string, number>): number {
  return 1 + (owned.growth || 0) * 0.05;
}

/** How many items the player may permanently blacklist from the offer pool. */
export function purgeSlots(owned: Record<string, number>): number {
  return owned.purge || 0;
}
