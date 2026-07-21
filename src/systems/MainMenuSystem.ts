// --- MAIN MENU SYSTEM ---
// Handles menu navigation, settings UI, and pause functionality

import { getGameState, setGameState, onStateChange } from '../core/GameState';
import type { GameStateType } from '../core/GameState';
import type { GameSettings } from '../core/SettingsManager';
import { getSettings, loadSettings, onSettingsChange } from '../core/SettingsManager';
import {
  setMasterGain,
  setMusicGain,
  setSFXGain,
  resumeMusic,
  setMusicIntensity,
  setMusicDucked,
  setMusicUserEnabled,
} from '../core/audio';

import { uiState } from '../core/UIState.svelte.ts';

//MainMenu, settingsModal, pauseModal are now handled by Svelte
// const mobilePauseBtn = document.getElementById('mobile-pause-btn');

// --- INITIALIZATION ---
export function initMainMenuSystem(): void {
  // Load settings and apply to UI
  const settings = loadSettings();
  applySettingsToGame(settings);

  // Setup event listeners
  setupMenuListeners();
  setupSettingsListeners();
  setupPauseListeners();
  setupKeyboardListeners();

  // Listen to settings changes
  onSettingsChange(applySettingsToGame);

  // Listen to state changes
  onStateChange(handleStateChange);

  // Initial state check
  handleStateChange(getGameState(), 'MENU');
}

// --- STATE CHANGE HANDLER ---
function handleStateChange(newState: GameStateType, _oldState: GameStateType): void {
  // Sync to Svelte UIState
  uiState.gameState = newState;

  // Handle music based on state
  if (newState === 'PLAYING' && getSettings().musicEnabled) {
    resumeMusic();
  }

  // Menu plays a stripped ambient bed; UISystem ramps intensity during a run.
  if (newState === 'MENU') {
    setMusicIntensity(0.2);
  }

  // Muffle (don't stop) the soundtrack while paused.
  setMusicDucked(newState === 'PAUSED');
}

// --- MENU LISTENERS ---
function setupMenuListeners(): void {
  // Handled in Svelte now
}

// --- SETTINGS LISTENERS ---
function setupSettingsListeners(): void {
  // Handled in Svelte now
}

// --- PAUSE LISTENERS ---
function setupPauseListeners(): void {
  // Handled in Svelte now
}

// --- KEYBOARD LISTENERS ---
function setupKeyboardListeners(): void {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      const state = getGameState();

      // Close settings if open
      if (uiState.showSettings) {
        uiState.showSettings = false;
        return;
      }

      // Toggle pause
      if (state === 'PLAYING') {
        setGameState('PAUSED');
      } else if (state === 'PAUSED') {
        setGameState('PLAYING');
      }
    }
  });
}

// --- HELPERS (LEGACY - REMOVED) ---
// openSettings, closeSettings, applySettingsToUI are now handled by Svelte

function applySettingsToGame(settings: GameSettings): void {
  // Apply volume settings
  setMasterGain(settings.masterVolume / 100);
  setMusicGain(settings.musicVolume / 100);
  setSFXGain(settings.sfxVolume / 100);
  setMusicUserEnabled(settings.musicEnabled);

  // Apply control layout
  document.body.classList.toggle('inverted-controls', settings.invertControls);

  // Sync showFps setting to uiState
  uiState.showFps = settings.showFps;
}

// --- FPS TRACKING ---
let frameCount = 0;
let lastFpsUpdate = 0;

export function updateFPS(currentTime: number): void {
  frameCount++;

  if (currentTime - lastFpsUpdate >= 1000) {
    uiState.fps = frameCount;
    frameCount = 0;
    lastFpsUpdate = currentTime;
  }
}

// Initialize on module load
initMainMenuSystem();
