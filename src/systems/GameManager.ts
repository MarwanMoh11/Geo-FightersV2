import { world } from '../core/world';
import { setGameState } from '../core/GameState';
import { broadcastGameEvent } from '../core/network';
import { uiState, announce } from '../core/UIState.svelte.ts';
import { stopMusic, playExplosion, playGameOver, playVictory } from '../core/audio';
import { addTrauma } from './CameraSystem';
import { recordRunEnd } from '../core/ProgressManager';
import { onRunEnded } from '../core/DailyManager';
import { dlog } from '../core/debug';

export let isGameOver = false;
export let isVictory = false;

function captureFinalStats() {
  const player = world.with('isPlayer', 'level', 'score').first;
  uiState.level = player?.level || uiState.level;
  uiState.score = player?.score || uiState.score;
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
