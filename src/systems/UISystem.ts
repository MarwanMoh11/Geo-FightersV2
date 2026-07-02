import { world } from '../core/world';
import { uiState } from '../core/UIState.svelte.ts';
import { setMusicIntensity } from '../core/audio';
import { getGameTime } from './ChestSystem';
import { isGamePaused as _isPauseGlobal } from './UpgradeSystem';
import { isGameOver as _isGameOverGlobal } from './GameManager';

export function UISystem() {
  // 1. Find Player Data
  const player = world.with(
    'isPlayer',
    'health',
    'xp',
    'xpMax',
    'level',
    'score',
    'weaponSlots',
    'passiveSlots',
  ).first;

  // On a multiplayer client (non-host) the authoritative game clock and boss state
  // arrive via host-state-update. The local ChestSystem clock never advances on a
  // client, so overwriting these here would freeze the run timer at 0:00 and hide
  // the boss bar. Trust the synced values instead.
  const isNetClient = uiState.isMultiplayer && !uiState.isHost;

  // 2. Update Global States
  if (!isNetClient) {
    uiState.gameTime = getGameTime();
  }
  uiState.isPaused = _isPauseGlobal;
  uiState.isGameOver = _isGameOverGlobal;

  // Soundtrack builds over the run: half-strength at spawn, everything in by
  // the boss at 8:00 (480s).
  if (uiState.gameState === 'PLAYING') {
    setMusicIntensity(0.55 + 0.45 * Math.min(1, uiState.gameTime / 480));
  }

  // Safety Check for player
  if (!player || !player.health) return;

  // 3. Sync Player Stats
  uiState.health.current = player.health.current;
  uiState.health.max = player.health.max;
  uiState.xp = player.xp || 0;
  uiState.xpMax = player.xpMax || 100;
  uiState.level = player.level || 1;
  uiState.score = player.score || 0;

  // 4. Update Inventory
  // We can optimize this by only assigning if different, but $state will handle basic checks
  uiState.weaponSlots = [...(player.weaponSlots || [])];
  uiState.passiveSlots = [...(player.passiveSlots || [])];

  // 4b. Weapon readiness (0 = just fired, 1 = ready) for cooldown sweeps
  uiState.weaponReadiness = (player.weaponSlots || []).map((slot) => {
    for (const entity of world.with('isWeapon', 'ownerId', 'weapon')) {
      if (entity.ownerId === player.id && entity.weaponId === slot.weaponId && entity.weapon) {
        const { cooldownTimer, fireRate } = entity.weapon;
        if (fireRate <= 0) return 1;
        return 1 - Math.min(Math.max(cooldownTimer / fireRate, 0), 1);
      }
    }
    return 1; // entity not found (e.g., starter weapon without weaponId): show ready
  });

  // 5. Boss Info
  // Skip on a network client: the boss does not exist as a local entity there,
  // its health is delivered through host-state-update. Recomputing it locally would
  // always resolve to "no boss" and hide the synced boss bar.
  if (!isNetClient) {
    const boss = world.with('isBoss', 'health').first;
    if (boss && boss.health) {
      uiState.bossHealth.active = true;
      uiState.bossHealth.current = boss.health.current;
      uiState.bossHealth.max = boss.health.max;
    } else {
      uiState.bossHealth.active = false;
    }
  }
}
