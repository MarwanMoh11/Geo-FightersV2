import type { WeaponSlot, PassiveSlot } from './world';

export const uiState = $state({
  // Player Stats
  health: { current: 100, max: 100 },
  xp: 0,
  xpMax: 100,
  level: 1,
  score: 0,

  // Inventory
  weaponSlots: [] as WeaponSlot[],
  passiveSlots: [] as PassiveSlot[],

  // Game Status
  gameState: 'MENU' as 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER',
  gameTime: 0,
  isPaused: false,
  isGameOver: false,
  bossHealth: { current: 0, max: 100, active: false },

  // UI Visibility
  showSettings: false,
  showUpgrade: false,
  activeSettingsTab: 'audio' as 'audio' | 'display' | 'gameplay',
  upgradeChoices: [] as any[],

  // Settings
  fps: 60,
  showFps: false,
});
