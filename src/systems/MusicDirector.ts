// --- MUSIC DIRECTOR ---
// The single brain that scores the game: it reads the live game state each
// frame and tells the audio engine which musical CUE to play and how intense
// it should be. The engine (audio.ts) owns the notes; this owns the "when."
//
// Cue priority during a run: BREACH (hacking a terminal) > BOSS > exploration.
// Outside a run: the MENU ambient bed, or the VICTORY fanfare on a win screen.
// Swaps are bar-aligned inside the engine, so this can poll freely.

import { uiState } from '../core/UIState.svelte.ts';
import { setMusicCue, setMusicIntensity } from '../core/audio';

let lastPoll = 0;
const POLL_INTERVAL = 0.12; // 8 Hz — cue swaps land on bar lines regardless

type CueName = 'menu' | 'explore' | 'boss' | 'breach' | 'victory';

function chooseCue(): { cue: CueName; intensity: number } {
  const s = uiState.gameState;

  // A live breach mini-game owns the score — "inside the machine."
  if (uiState.breach) return { cue: 'breach', intensity: 0.85 };

  if (s === 'PLAYING' || s === 'PAUSED') {
    // The finale boss commands its own dark, driving theme.
    if (uiState.bossHealth?.active) return { cue: 'boss', intensity: 1 };
    // Exploration groove builds over the run: half-strength at spawn, full by
    // the boss window (8:00 = 480s). Corruption nudges the floor up.
    const ramp = Math.min(1, uiState.gameTime / 480);
    const floor = 0.5 + Math.min(0.1, (uiState.corruption ?? 0) * 0.02);
    return { cue: 'explore', intensity: floor + (0.95 - floor) * ramp };
  }

  // Win screen: triumphant fanfare. Defeat stops the music elsewhere, so a
  // GAME_OVER without victory just leaves the last cue (already silenced).
  if (s === 'GAME_OVER' && uiState.isVictory) return { cue: 'victory', intensity: 1 };

  // Menus, lobby, loading: the calm ambient bed.
  return { cue: 'menu', intensity: 0.2 };
}

export function MusicDirector(dt: number): void {
  lastPoll += dt;
  if (lastPoll < POLL_INTERVAL) return;
  lastPoll = 0;

  const { cue, intensity } = chooseCue();
  setMusicCue(cue);
  setMusicIntensity(intensity);
}
