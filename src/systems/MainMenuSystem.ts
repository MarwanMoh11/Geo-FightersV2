// --- MAIN MENU SYSTEM ---
// Handles menu navigation, settings UI, and pause functionality

import { getGameState, setGameState, onStateChange } from '../core/GameState';
import type { GameStateType } from '../core/GameState';
import type { GameSettings } from '../core/SettingsManager';
import {
  getSettings,
  loadSettings,
  onSettingsChange,
} from '../core/SettingsManager';
import { setMasterGain, setMusicGain, setSFXGain, resumeMusic } from '../core/audio';

import { uiState } from '../core/UIState.svelte.ts';

// --- DOM ELEMENTS ---
// mainMenu, settingsModal, pauseModal are now handled by Svelte
const fpsCounter = document.getElementById('fps-counter');
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
  } else if (newState === 'MENU' || newState === 'PAUSED') {
    // Keep music playing in menu/pause, just don't start it
  }
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

  // Apply control layout
  document.body.classList.toggle('inverted-controls', settings.invertControls);
}

// --- FPS TRACKING ---
let frameCount = 0;
let lastFpsUpdate = 0;

export function updateFPS(currentTime: number): void {
  frameCount++;

  if (currentTime - lastFpsUpdate >= 1000) {
    if (fpsCounter && !fpsCounter.classList.contains('hidden')) {
      fpsCounter.textContent = `FPS: ${frameCount}`;
    }
    frameCount = 0;
    lastFpsUpdate = currentTime;
  }
}

// Initialize on module load
initMainMenuSystem();
