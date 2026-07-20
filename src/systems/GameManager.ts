import { world } from '../core/world';
import { setGameState } from '../core/GameState';
import { broadcastGameEvent } from '../core/network';
import { uiState, announce } from '../core/UIState.svelte.ts';
import { stopMusic, playExplosion, playGameOver, playVictory, playLevelUp } from '../core/audio';
import { addTrauma } from './CameraSystem';
import { recordRunEnd } from '../core/ProgressManager';
import { onRunEnded } from '../core/DailyManager';
import { submitRunToLeaderboard } from '../core/leaderboard';
import { isRewardedAvailable } from '../core/portal';
import { dlog } from '../core/debug';

export let isGameOver = false;
export let isVictory = false;

/** Clear the end-of-run flags so a fresh run can start without a page reload. */
export function resetGameFlags(): void {
  isGameOver = false;
  isVictory = false;
}

function captureFinalStats() {
  const player = world.with('isPlayer', 'level', 'score').first;
  uiState.level = player?.level || uiState.level;
  uiState.score = player?.score || uiState.score;
}

/**
 * Death gate. On portal builds a solo player gets ONE rewarded-ad revive per
 * run, offered at the moment of death — BEFORE any of triggerGameOver's
 * bookkeeping (run stats, dailies, leaderboard submit), so a revived run is
 * never double-counted. The world freezes while the offer is up (main loop
 * gates on showSecondChance). Co-op has its own ghost/revive system and the
 * host ends the run for everyone, so the offer is solo-only.
 */
export function offerSecondChanceOrEnd(): void {
  if (isGameOver || isVictory) return;
  if (
    !uiState.isMultiplayer &&
    !uiState.secondChanceUsed &&
    !uiState.showSecondChance &&
    isRewardedAvailable()
  ) {
    uiState.showSecondChance = true;
    return;
  }
  triggerGameOver();
}

/** Rewarded ad completed: bring the player back and make it survivable. */
export function reviveSecondChance(): void {
  uiState.showSecondChance = false;
  uiState.secondChanceUsed = true;

  const player = world.with('isLocalPlayer', 'health', 'position').first;
  if (!player || !player.health) {
    triggerGameOver();
    return;
  }
  player.health.current = Math.ceil(player.health.max * 0.5);
  player.invulnTimer = 3.0; // breathing room while the horde re-converges
  uiState.health = { current: player.health.current, max: player.health.max };

  // Shockwave the pile that killed them: hard knockback + stun in a wide
  // ring (no kills — no XP/credit bookkeeping to double-count).
  for (const enemy of world.with('isEnemy', 'position', 'velocity')) {
    const dx = enemy.position.x - player.position.x;
    const dz = enemy.position.z - player.position.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > 625 || distSq < 1e-6) continue; // 25u radius
    const dist = Math.sqrt(distSq);
    const force = 24 * (1 - dist / 25) + 8;
    enemy.velocity.x += (dx / dist) * force;
    enemy.velocity.z += (dz / dist) * force;
    enemy.stunTimer = Math.max(enemy.stunTimer || 0, 2.0);
  }

  addTrauma(0.6);
  playExplosion();
  playLevelUp();
  announce('SECOND CHANCE — BACK ONLINE');
}

/**
 * Belt-and-suspenders death watchdog (runs each frame in solo): a 0-HP player
 * must never keep playing. The collision paths already call
 * offerSecondChanceOrEnd at the killing blow; this catches any exotic HP sink
 * that bypasses them so a "dead but still running" run is impossible.
 */
export function SoloDeathWatchdog(): void {
  if (isGameOver || isVictory || uiState.isMultiplayer || uiState.showSecondChance) return;
  const player = world.with('isLocalPlayer', 'health').first;
  if (player?.health && player.health.current <= 0) offerSecondChanceOrEnd();
}

/** Rewarded ad declined or failed: the death stands. */
export function declineSecondChance(): void {
  uiState.showSecondChance = false;
  uiState.secondChanceUsed = true;
  triggerGameOver();
}

export function triggerGameOver() {
  if (isGameOver || isVictory) return; // Prevent double trigger
  isGameOver = true;

  // Co-op: the host decides the run is over (all players down) and tells
  // every client so their game-over screens open in sync. No-op otherwise.
  broadcastGameEvent('game-over');

  captureFinalStats();
  // Dying in endless mode still counts as a victory — the 10:00 win already
  // happened; endless is a bonus score chase.
  uiState.isVictory = uiState.endlessMode;
  recordRunEnd(uiState.gameTime, uiState.level, uiState.endlessMode);
  onRunEnded();
  submitRunToLeaderboard();

  // Let the death land: explosion + heavy shake, music cuts out, somber sting
  addTrauma(1.0);
  playExplosion();
  stopMusic();
  playGameOver();

  // Drive the Svelte GameOverModal via the state machine
  setGameState('GAME_OVER');
}

export function triggerVictory() {
  if (isGameOver || isVictory) return;

  captureFinalStats();
  recordRunEnd(uiState.gameTime, uiState.level, true);
  playVictory();

  // First victory moment: offer to stay in the system (endless mode) instead
  // of ending immediately. The choice modal pauses via the same flag the
  // upgrade screen uses; resolveVictoryChoice() continues or ends the run.
  // Co-op skips the choice — one player picking endless while others wait
  // would desync the party, so a shared win extracts everyone together.
  if (!uiState.endlessMode && !uiState.isMultiplayer) {
    uiState.showVictoryChoice = true;
    return;
  }

  endRunAsVictory();
}

/** Player chose to extract (or died in endless): finish the run as a win. */
export function endRunAsVictory() {
  if (isGameOver || isVictory) return;
  isVictory = true;
  isGameOver = true; // Also stop game loop

  captureFinalStats();
  uiState.isVictory = true;
  onRunEnded();
  submitRunToLeaderboard();
  setGameState('GAME_OVER');

  dlog('[VICTORY] Player survived the corruption!');
}

/** Called by the victory-choice modal. */
export function resolveVictoryChoice(stay: boolean) {
  uiState.showVictoryChoice = false;
  if (stay) {
    uiState.endlessMode = true;
    announce('ENDLESS MODE — SURVIVE');
  } else {
    endRunAsVictory();
  }
}
