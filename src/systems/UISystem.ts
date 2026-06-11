import { world } from '../core/world';
import { uiState } from '../core/UIState.svelte.ts';
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

  // 2. Update Global States
  uiState.gameTime = getGameTime();
  uiState.isPaused = _isPauseGlobal;
  uiState.isGameOver = _isGameOverGlobal;

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
  const boss = world.with('isBoss', 'health').first;
  if (boss && boss.health) {
    uiState.bossHealth.active = true;
    uiState.bossHealth.current = boss.health.current;
    uiState.bossHealth.max = boss.health.max;
  } else {
    uiState.bossHealth.active = false;
  }
}
