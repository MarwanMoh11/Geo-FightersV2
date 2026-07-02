import { world } from '../core/world';
import { setGameState } from '../core/GameState';
import { uiState } from '../core/UIState.svelte.ts';
import { stopMusic, playExplosion, playGameOver, playVictory } from '../core/audio';
import { addTrauma } from './CameraSystem';
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

  captureFinalStats();
  uiState.isVictory = false;

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
  isVictory = true;
  isGameOver = true; // Also stop game loop

  captureFinalStats();
  uiState.isVictory = true;
  playVictory();
  setGameState('GAME_OVER');

  dlog('[VICTORY] Player survived the corruption!');
}
