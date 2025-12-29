/**
 * PassiveEffectsSystem - Applies passive stat bonuses to the player
 * 
 * Handles:
 * - Health recovery (HP regen per second)
 * - Max health bonus (applied once when passive is acquired)
 */

import { world } from '../core/world';

export function PassiveEffectsSystem(dt: number) {
    const player = world.with('isPlayer', 'health', 'stats').first;
    if (!player || !player.health || !player.stats) return;

    // 1. Health Recovery (HP Regen)
    const recovery = player.stats.recovery || 0;
    if (recovery > 0 && player.health.current < player.health.max) {
        const healAmount = recovery * dt;
        player.health.current = Math.min(
            player.health.max,
            player.health.current + healAmount
        );
    }

    // 2. Max Health Bonus (additive)
    // This is applied incrementally in UpgradeSystem when passive is acquired
    // We don't need to re-apply it every frame
}
