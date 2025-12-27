// --- SETTINGS MANAGER ---
// Centralized settings with localStorage persistence

export interface GameSettings {
    // Audio
    masterVolume: number; // 0-100
    musicVolume: number; // 0-100
    sfxVolume: number; // 0-100
    musicEnabled: boolean;

    // Display
    screenShake: boolean;
    showFps: boolean;
    qualityLevel: 'low' | 'medium' | 'high';

    // Gameplay
    autoAimStrength: number; // 0-100
    showDamageNumbers: boolean;
    joystickSensitivity: number; // 25-150
}

const STORAGE_KEY = 'geofighters_settings';

const DEFAULT_SETTINGS: GameSettings = {
    // Audio
    masterVolume: 80,
    musicVolume: 60,
    sfxVolume: 80,
    musicEnabled: true,

    // Display
    screenShake: true,
    showFps: false,
    qualityLevel: 'medium',

    // Gameplay
    autoAimStrength: 50,
    showDamageNumbers: true,
    joystickSensitivity: 100,
};

// Current settings in memory
let settings: GameSettings = { ...DEFAULT_SETTINGS };

// Settings change listeners
type SettingsListener = (settings: GameSettings) => void;
const listeners: SettingsListener[] = [];

/**
 * Load settings from localStorage
 */
export function loadSettings(): GameSettings {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Merge with defaults to ensure all keys exist
            settings = { ...DEFAULT_SETTINGS, ...parsed };
        } else {
            settings = { ...DEFAULT_SETTINGS };
        }
    } catch (e) {
        console.warn('[Settings] Failed to load settings, using defaults:', e);
        settings = { ...DEFAULT_SETTINGS };
    }
    return settings;
}

/**
 * Save settings to localStorage
 */
export function saveSettings(): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.warn('[Settings] Failed to save settings:', e);
    }
}

/**
 * Get current settings
 */
export function getSettings(): GameSettings {
    return { ...settings };
}

/**
 * Update a single setting
 */
export function setSetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
    settings[key] = value;
    saveSettings();
    notifyListeners();
}

/**
 * Update multiple settings at once
 */
export function updateSettings(updates: Partial<GameSettings>): void {
    settings = { ...settings, ...updates };
    saveSettings();
    notifyListeners();
}

/**
 * Reset all settings to defaults
 */
export function resetSettings(): void {
    settings = { ...DEFAULT_SETTINGS };
    saveSettings();
    notifyListeners();
}

/**
 * Subscribe to settings changes
 */
export function onSettingsChange(listener: SettingsListener): () => void {
    listeners.push(listener);
    return () => {
        const index = listeners.indexOf(listener);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    };
}

/**
 * Notify all listeners of settings change
 */
function notifyListeners(): void {
    for (const listener of listeners) {
        listener(getSettings());
    }
}

// --- CONVENIENCE GETTERS ---

export function getMasterVolume(): number {
    return settings.masterVolume / 100;
}

export function getMusicVolume(): number {
    return (settings.musicVolume / 100) * getMasterVolume();
}

export function getSFXVolume(): number {
    return (settings.sfxVolume / 100) * getMasterVolume();
}

export function isMusicEnabled(): boolean {
    return settings.musicEnabled;
}

export function isScreenShakeEnabled(): boolean {
    return settings.screenShake;
}

export function shouldShowFps(): boolean {
    return settings.showFps;
}

export function getJoystickSensitivity(): number {
    return settings.joystickSensitivity / 100;
}

// Initialize on module load
loadSettings();
