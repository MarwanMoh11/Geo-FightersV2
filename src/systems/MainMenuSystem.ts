// --- MAIN MENU SYSTEM ---
// Handles menu navigation, settings UI, and pause functionality

import { getGameState, setGameState, onStateChange } from '../core/GameState';
import type { GameStateType } from '../core/GameState';
import type { GameSettings } from '../core/SettingsManager';
import {
    getSettings,
    setSetting,
    resetSettings,
    loadSettings,
    onSettingsChange,
} from '../core/SettingsManager';
import { setMasterGain, setMusicGain, setSFXGain, stopMusic, resumeMusic } from '../core/audio';

// --- DOM ELEMENTS ---
const mainMenu = document.getElementById('main-menu');
const settingsModal = document.getElementById('settings-modal');
const pauseModal = document.getElementById('pause-modal');
const fpsCounter = document.getElementById('fps-counter');
const mobilePauseBtn = document.getElementById('mobile-pause-btn');

// Main Menu Buttons
const startBtn = document.getElementById('start-btn');
const settingsBtn = document.getElementById('settings-btn');

// Settings Elements
const closeSettingsBtn = document.getElementById('close-settings-btn');
const resetSettingsBtn = document.getElementById('reset-settings-btn');
const tabButtons = document.querySelectorAll('.tab-btn');
const settingsPanels = document.querySelectorAll('.settings-panel');

// Pause Modal Buttons
const resumeBtn = document.getElementById('resume-btn');
const pauseSettingsBtn = document.getElementById('pause-settings-btn');
const mainMenuBtn = document.getElementById('main-menu-btn');

// Settings Inputs
const masterVolumeInput = document.getElementById('master-volume') as HTMLInputElement;
const musicVolumeInput = document.getElementById('music-volume') as HTMLInputElement;
const sfxVolumeInput = document.getElementById('sfx-volume') as HTMLInputElement;
const musicEnabledInput = document.getElementById('music-enabled') as HTMLInputElement;
const screenShakeInput = document.getElementById('screen-shake') as HTMLInputElement;
const showFpsInput = document.getElementById('show-fps') as HTMLInputElement;
const qualityLevelInput = document.getElementById('quality-level') as HTMLSelectElement;
const damageNumbersInput = document.getElementById('damage-numbers') as HTMLInputElement;
const joystickSensitivityInput = document.getElementById('joystick-sensitivity') as HTMLInputElement;

// Value Displays
const masterVolumeVal = document.getElementById('master-volume-val');
const musicVolumeVal = document.getElementById('music-volume-val');
const sfxVolumeVal = document.getElementById('sfx-volume-val');
const joystickSensitivityVal = document.getElementById('joystick-sensitivity-val');

// Track where settings was opened from
let settingsOpenedFrom: 'menu' | 'pause' | 'playing' = 'menu';

// --- INITIALIZATION ---
export function initMainMenuSystem(): void {
    // Load settings and apply to UI
    const settings = loadSettings();
    applySettingsToUI(settings);
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
    // Update UI visibility based on state
    if (mainMenu) {
        mainMenu.classList.toggle('hidden', newState !== 'MENU');
    }
    if (pauseModal) {
        pauseModal.classList.toggle('hidden', newState !== 'PAUSED');
    }

    // Handle music based on state
    if (newState === 'PLAYING' && getSettings().musicEnabled) {
        resumeMusic();
    } else if (newState === 'MENU' || newState === 'PAUSED') {
        // Keep music playing in menu/pause, just don't start it
    }
}

// --- MENU LISTENERS ---
function setupMenuListeners(): void {
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            setGameState('PLAYING');
        });
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            settingsOpenedFrom = 'menu';
            openSettings();
        });
    }
}

// --- SETTINGS LISTENERS ---
function setupSettingsListeners(): void {
    // Tab switching
    tabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            if (!tabName) return;

            // Update active tab
            tabButtons.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');

            // Update active panel
            settingsPanels.forEach((panel) => {
                panel.classList.toggle('active', panel.id === `${tabName}-panel`);
            });
        });
    });

    // Close settings
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', closeSettings);
    }

    // Reset settings
    if (resetSettingsBtn) {
        resetSettingsBtn.addEventListener('click', () => {
            resetSettings();
            const settings = getSettings();
            applySettingsToUI(settings);
        });
    }

    // Audio settings
    if (masterVolumeInput) {
        masterVolumeInput.addEventListener('input', () => {
            const value = parseInt(masterVolumeInput.value);
            setSetting('masterVolume', value);
            if (masterVolumeVal) masterVolumeVal.textContent = `${value}%`;
        });
    }

    if (musicVolumeInput) {
        musicVolumeInput.addEventListener('input', () => {
            const value = parseInt(musicVolumeInput.value);
            setSetting('musicVolume', value);
            if (musicVolumeVal) musicVolumeVal.textContent = `${value}%`;
        });
    }

    if (sfxVolumeInput) {
        sfxVolumeInput.addEventListener('input', () => {
            const value = parseInt(sfxVolumeInput.value);
            setSetting('sfxVolume', value);
            if (sfxVolumeVal) sfxVolumeVal.textContent = `${value}%`;
        });
    }

    if (musicEnabledInput) {
        musicEnabledInput.addEventListener('change', () => {
            setSetting('musicEnabled', musicEnabledInput.checked);
            if (musicEnabledInput.checked) {
                resumeMusic();
            } else {
                stopMusic();
            }
        });
    }

    // Display settings
    if (screenShakeInput) {
        screenShakeInput.addEventListener('change', () => {
            setSetting('screenShake', screenShakeInput.checked);
        });
    }

    if (showFpsInput) {
        showFpsInput.addEventListener('change', () => {
            setSetting('showFps', showFpsInput.checked);
            if (fpsCounter) {
                fpsCounter.classList.toggle('hidden', !showFpsInput.checked);
            }
        });
    }

    if (qualityLevelInput) {
        qualityLevelInput.addEventListener('change', () => {
            setSetting('qualityLevel', qualityLevelInput.value as 'low' | 'medium' | 'high');
        });
    }


    if (damageNumbersInput) {
        damageNumbersInput.addEventListener('change', () => {
            setSetting('showDamageNumbers', damageNumbersInput.checked);
        });
    }

    if (joystickSensitivityInput) {
        joystickSensitivityInput.addEventListener('input', () => {
            const value = parseInt(joystickSensitivityInput.value);
            setSetting('joystickSensitivity', value);
            if (joystickSensitivityVal) joystickSensitivityVal.textContent = `${value}%`;
        });
    }
}

// --- PAUSE LISTENERS ---
function setupPauseListeners(): void {
    if (resumeBtn) {
        resumeBtn.addEventListener('click', () => {
            setGameState('PLAYING');
        });
    }

    if (pauseSettingsBtn) {
        pauseSettingsBtn.addEventListener('click', () => {
            settingsOpenedFrom = 'pause';
            // Hide pause modal first, then open settings
            if (pauseModal) {
                pauseModal.classList.add('hidden');
            }
            openSettings();
        });
    }

    if (mainMenuBtn) {
        mainMenuBtn.addEventListener('click', () => {
            // Reload page to reset game completely
            location.reload();
        });
    }

    // Mobile Pause Button
    if (mobilePauseBtn) {
        mobilePauseBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent touch from propagating to game
            const state = getGameState();
            if (state === 'PLAYING') {
                setGameState('PAUSED');
            } else if (state === 'PAUSED') {
                setGameState('PLAYING');
            }
        });
    }
}

// --- KEYBOARD LISTENERS ---
function setupKeyboardListeners(): void {
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Escape') {
            const state = getGameState();

            // Close settings if open
            if (settingsModal && !settingsModal.classList.contains('hidden')) {
                closeSettings();
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

// --- SETTINGS HELPERS ---
function openSettings(): void {
    if (settingsModal) {
        settingsModal.classList.remove('hidden');
    }
}

function closeSettings(): void {
    if (settingsModal) {
        settingsModal.classList.add('hidden');
    }

    // Return to the appropriate screen based on where settings was opened from
    if (settingsOpenedFrom === 'pause') {
        // Show pause menu again
        if (pauseModal) {
            pauseModal.classList.remove('hidden');
        }
    }
    // If opened from menu, menu is still visible behind settings
    // If opened from playing (ESC), pause modal should show
}

function applySettingsToUI(settings: GameSettings): void {
    // Audio
    if (masterVolumeInput) {
        masterVolumeInput.value = settings.masterVolume.toString();
        if (masterVolumeVal) masterVolumeVal.textContent = `${settings.masterVolume}%`;
    }
    if (musicVolumeInput) {
        musicVolumeInput.value = settings.musicVolume.toString();
        if (musicVolumeVal) musicVolumeVal.textContent = `${settings.musicVolume}%`;
    }
    if (sfxVolumeInput) {
        sfxVolumeInput.value = settings.sfxVolume.toString();
        if (sfxVolumeVal) sfxVolumeVal.textContent = `${settings.sfxVolume}%`;
    }
    if (musicEnabledInput) {
        musicEnabledInput.checked = settings.musicEnabled;
    }

    // Display
    if (screenShakeInput) {
        screenShakeInput.checked = settings.screenShake;
    }
    if (showFpsInput) {
        showFpsInput.checked = settings.showFps;
        if (fpsCounter) {
            fpsCounter.classList.toggle('hidden', !settings.showFps);
        }
    }
    if (qualityLevelInput) {
        qualityLevelInput.value = settings.qualityLevel;
    }

    // Gameplay
    if (damageNumbersInput) {
        damageNumbersInput.checked = settings.showDamageNumbers;
    }
    if (joystickSensitivityInput) {
        joystickSensitivityInput.value = settings.joystickSensitivity.toString();
        if (joystickSensitivityVal) joystickSensitivityVal.textContent = `${settings.joystickSensitivity}%`;
    }
}

function applySettingsToGame(settings: GameSettings): void {
    // Apply volume settings
    setMasterGain(settings.masterVolume / 100);
    setMusicGain(settings.musicVolume / 100);
    setSFXGain(settings.sfxVolume / 100);
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
