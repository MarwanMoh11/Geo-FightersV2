import { world } from '../core/world';
import { uiState } from '../core/UIState.svelte.ts';
import { getGameTime } from './ChestSystem';
import { tickCombo } from './CollisionSystem';
import { isGamePaused as _isPauseGlobal } from './UpgradeSystem';
import { isGameOver as _isGameOverGlobal } from './GameManager';

// Change-detection signatures so the HUD $state arrays are only replaced
// when a weapon/passive is actually gained or leveled
let _lastWeaponSig = '';
let _lastPassiveSig = '';

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

  // (Soundtrack intensity + cue selection now live in MusicDirector.)

  // Expire the kill-combo chain when the window lapses.
  tickCombo();

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
  // Only reassign the $state arrays when the contents actually changed —
  // replacing them every frame forces Svelte to re-diff the HUD at 60fps.
  const weaponSlots = player.weaponSlots || [];
  const passiveSlots = player.passiveSlots || [];

  let weaponSig = '';
  for (const s of weaponSlots) weaponSig += `${s.weaponId}:${s.level};`;
  if (weaponSig !== _lastWeaponSig) {
    _lastWeaponSig = weaponSig;
    uiState.weaponSlots = [...weaponSlots];
  }

  let passiveSig = '';
  for (const s of passiveSlots) passiveSig += `${s.passiveId}:${s.level};`;
  if (passiveSig !== _lastPassiveSig) {
    _lastPassiveSig = passiveSig;
    uiState.passiveSlots = [...passiveSlots];
  }

  // 4b. Weapon readiness (0 = just fired, 1 = ready) for cooldown sweeps.
  // Written element-wise into the existing $state array (with a small epsilon)
  // so unchanged values don't wake Svelte's reactivity every frame.
  if (uiState.weaponReadiness.length !== weaponSlots.length) {
    uiState.weaponReadiness = new Array(weaponSlots.length).fill(1);
  }
  for (let i = 0; i < weaponSlots.length; i++) {
    const slot = weaponSlots[i];
    let readiness = 1; // entity not found (e.g., starter weapon without weaponId): show ready
    for (const entity of world.with('isWeapon', 'ownerId', 'weapon')) {
      if (entity.ownerId === player.id && entity.weaponId === slot.weaponId && entity.weapon) {
        const { cooldownTimer, fireRate } = entity.weapon;
        readiness = fireRate <= 0 ? 1 : 1 - Math.min(Math.max(cooldownTimer / fireRate, 0), 1);
        break;
      }
    }
    if (Math.abs(uiState.weaponReadiness[i] - readiness) > 0.01) {
      uiState.weaponReadiness[i] = readiness;
    }
  }

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
