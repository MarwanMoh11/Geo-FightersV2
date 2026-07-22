/**
 * Corruption — the run's threat-level dial (single source of truth).
 *
 * The scale is 0–10. Level 5 is the NEW STANDARD: with the player touching
 * nothing, a run starts at 5, which is exactly the old maximum (full swarm
 * density + tankier enemies + richer payouts). Level 0 remains the old gentle
 * baseline for anyone who wants it very easy.
 *
 *   0 ─────────── 5 (default) ─────────── 10
 *   relaxed        standard                nightmare
 *
 * Levels 0–5 scale density, enemy HP and rewards (the original knobs). Levels
 * 6–10 additionally ramp enemy CONTACT DAMAGE and MOVE SPEED — teeth that only
 * engage past the standard, so "old corruption 5" is the base and everything
 * above it is genuinely new, harder territory.
 *
 * Every corruption effect in the game reads from the helpers below so the menu
 * description and the actual balance can never disagree.
 */

export const CORRUPTION_MAX = 10;
export const CORRUPTION_DEFAULT = 5; // the new standard threat level
export const CORRUPTION_STANDARD = 5; // where "new teeth" (damage/speed) begin

/** Spawn-quota (swarm density) multiplier. Saturates at the horde ceiling. */
export const corruptionDensity = (L: number): number => 1 + L * 0.2;

/** Enemy max-HP multiplier. */
export const corruptionHp = (L: number): number => 1 + L * 0.15;

/** XP payout multiplier (risk buys reward). */
export const corruptionXp = (L: number): number => 1 + L * 0.2;

/** Credit payout multiplier. */
export const corruptionCredits = (L: number): number => 1 + L * 0.25;

/** Enemy contact-damage multiplier — only bites above the standard (5). */
export const corruptionDamage = (L: number): number =>
  1 + Math.max(0, L - CORRUPTION_STANDARD) * 0.12;

/** Enemy move-speed multiplier — only quickens above the standard (5). */
export const corruptionSpeed = (L: number): number =>
  1 + Math.max(0, L - CORRUPTION_STANDARD) * 0.03;

/** Short tier name for the dial / leaderboard. */
export function corruptionTierName(L: number): string {
  if (L <= 0) return 'RELAXED';
  if (L < CORRUPTION_STANDARD) return 'BELOW STANDARD';
  if (L === CORRUPTION_STANDARD) return 'STANDARD';
  if (L >= CORRUPTION_MAX) return 'NIGHTMARE';
  return 'BRUTAL';
}
