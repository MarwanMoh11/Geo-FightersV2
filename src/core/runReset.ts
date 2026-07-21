/**
 * runReset — return to the main menu after a run WITHOUT reloading the page.
 *
 * The old "play again" was `location.reload()`: it re-downloaded and re-booted
 * the entire engine, dropped the multiplayer connection, and feels broken
 * inside a wrapped mobile app. This sweeps every run entity, resets each
 * stateful system, and lands back on the menu; the existing MENU→PLAYING
 * initializer (initializePlayerForRun) already rebuilds the player for the
 * next run.
 */

import type * as THREE from 'three';
import { world } from './world';
import { uiState } from './UIState.svelte';
import { setGameState } from './GameState';
import { removeBody } from './RapierWorld';
import { startMusic, resetMusicCue } from './audio';
import { disconnectNetwork } from './network';
import { resetRunSubmission } from './leaderboard';
import { resetFlowState } from './FlowStateManager';
import { resetGameTime } from '../systems/ChestSystem';
import { resetTimelineSpawner } from '../systems/TimelineSpawner';
import { resetFinaleBoss } from '../systems/FinaleBoss';
import { resetAnomalySystem } from '../systems/AnomalySystem';
import { resetShrineSystem } from '../systems/ShrineSystem';
import { resetDestructibles } from '../systems/DestructibleSystem';
import { resetMapEvents } from '../systems/MapEventSystem';
import { resetBreachSystem } from '../systems/BreachSystem';
import { resetGameFlags } from '../systems/GameManager';
import { resetUpgradeState } from '../systems/UpgradeSystem';
import { clearDamageNumbers } from '../systems/DamageNumberSystem';
import { resetCamera } from '../systems/CameraSystem';

export function resetRun(): void {
  const local = world.with('isLocalPlayer').first;
  const scene = (local?.transform?.parent ?? null) as THREE.Scene | null;

  // Multiplayer first: leaving the room tears down P2P peers and removes the
  // remote players + their weapons before the generic sweep below.
  if (uiState.isMultiplayer) {
    disconnectNetwork();
  }

  // Boss owns module refs — clear it via its own reset before the sweep.
  if (scene) resetFinaleBoss(scene);

  // Sweep every run entity. Keep only the local player shell — weapons,
  // enemies, projectiles, particles, loot, chests, orbitals, tears, anomalies
  // and mirrors all go; the run initializer recreates what the next run needs.
  // (every entity in this game carries a position vector, so this is total)
  for (const entity of [...world.with('position')]) {
    if (entity.isPlayer && entity.isLocalPlayer) continue;
    if (entity.transform && scene) scene.remove(entity.transform);
    if (entity.rigidBody) {
      removeBody(entity.rigidBody);
      entity.rigidBody = undefined;
      entity.collider = undefined;
    }
    world.remove(entity);
  }

  // Reset stateful systems/modules
  resetGameTime();
  resetTimelineSpawner();
  resetAnomalySystem();
  resetShrineSystem();
  resetDestructibles();
  resetMapEvents();
  resetBreachSystem();
  resetFlowState();
  resetGameFlags();
  resetUpgradeState();
  resetRunSubmission();
  clearDamageNumbers();

  // Reset the run-scoped UI state the modals key off
  uiState.isGameOver = false;
  uiState.isVictory = false;
  uiState.showSecondChance = false;
  uiState.secondChanceUsed = false;
  uiState.showVictoryChoice = false;
  uiState.showChestCeremony = false;
  uiState.showProtocolChoice = false;
  uiState.overloadActive = false;
  uiState.overloadTimer = 0;
  uiState.overloadCharge = 0;
  uiState.fluxEffect = '';
  uiState.endlessMode = false;
  uiState.gameTime = 0;
  uiState.combo = 0;
  uiState.bossHealth = { active: false, current: 0, max: 1 };

  // Re-center the camera rig so the next run doesn't pan in from the old spot
  resetCamera();
  // Return the soundtrack to the menu bed (MusicDirector re-scores from here)
  resetMusicCue();

  // Back to the menu; music re-arms (stopMusic tore the scheduler down on death)
  setGameState('MENU');
  startMusic();
}
