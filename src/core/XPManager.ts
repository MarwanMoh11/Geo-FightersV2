// --- XP MANAGER ---
// Global XP banking system for screen-bound XP lifecycle
// When XP shards despawn or cap is reached, XP is banked here
// When buffer exceeds threshold, spawns a large shard near player

// --- CONSTANTS ---
export const XP_TIERS = {
  TIER_1: { threshold: 0, color: 0x4488ff, size: 0.25, name: 'blue' }, // 1-4 XP
  TIER_2: { threshold: 5, color: 0x44ff88, size: 0.35, name: 'green' }, // 5-19 XP
  TIER_3: { threshold: 20, color: 0xff4466, size: 0.5, name: 'red' }, // 20-99 XP
  TIER_4: { threshold: 100, color: 0xffcc00, size: 0.7, name: 'gold' }, // 100+ XP
};

export const MAX_ACTIVE_XP = 200;
export const XP_DESPAWN_RADIUS_SQ = 40 * 40;

// Bank delivery - spawn large shard when buffer exceeds this
export const XP_BANK_DELIVERY_THRESHOLD = 500;

// --- STATE ---
let globalXPBuffer = 0;

// --- BANKING API ---
export function bankXP(value: number): void {
  globalXPBuffer += value;
}

export function withdrawXP(amount: number): number {
  const withdrawn = Math.min(amount, globalXPBuffer);
  globalXPBuffer -= withdrawn;
  return withdrawn;
}

export function withdrawAllXP(): number {
  const amount = globalXPBuffer;
  globalXPBuffer = 0;
  return amount;
}

export function getBufferedXP(): number {
  return globalXPBuffer;
}

export function resetXPBuffer(): void {
  globalXPBuffer = 0;
}

// Check if bank should deliver XP (threshold reached)
export function shouldDeliverBankedXP(): boolean {
  return globalXPBuffer >= XP_BANK_DELIVERY_THRESHOLD;
}

// --- TIER HELPERS ---
export function getTierForValue(value: number): typeof XP_TIERS.TIER_1 {
  if (value >= XP_TIERS.TIER_4.threshold) return XP_TIERS.TIER_4;
  if (value >= XP_TIERS.TIER_3.threshold) return XP_TIERS.TIER_3;
  if (value >= XP_TIERS.TIER_2.threshold) return XP_TIERS.TIER_2;
  return XP_TIERS.TIER_1;
}
