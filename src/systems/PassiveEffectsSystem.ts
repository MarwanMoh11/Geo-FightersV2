/**
 * PassiveEffectsSystem - Applies passive stat bonuses to players
 *
 * Handles:
 * - Health recovery (HP regen per second) for EVERY player, using each
 *   player's own synced stats (previously only the first player regenerated)
 * - Skipped on multiplayer clients: the host is authoritative for health and
 *   already applies each player's recovery stat host-side
 */

import { world } from '../core/world';
import { uiState } from '../core/UIState.svelte.ts';

export function PassiveEffectsSystem(dt: number) {
  if (uiState.isMultiplayer && !uiState.isHost) return;

  for (const player of world.with('isPlayer', 'health', 'stats')) {
    const health = player.health;
    const stats = player.stats;
    if (!health || !stats) continue;

    // Ghosts don't regenerate — they need a teammate revive
    if (health.current <= 0) continue;

    const recovery = stats.recovery || 0;
    if (recovery > 0 && health.current < health.max) {
      health.current = Math.min(health.max, health.current + recovery * dt);
    }
  }
}
