import type { WeaponSlot, PassiveSlot } from './world';
import type { UpgradeOption } from '../systems/UpgradeSystem';

const isClient = typeof window !== 'undefined';

function getLocalVal<T>(key: string, fallback: T): T {
  if (!isClient) return fallback;
  try {
    const val = localStorage.getItem(key);
    if (val === null) return fallback;
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

function getUpgradeDefaults() {
  const defaults = {
    might: 0,
    maxHealth: 0,
    armor: 0,
    moveSpeed: 0,
    magnet: 0,
    luck: 0,
    rerolls: 0,
    banishes: 0,
  };
  const saved = getLocalVal<any>('geo_permanent_upgrades', {});
  return { ...defaults, ...saved };
}

export const uiState = $state({
  // Persistent Progression & Customization
  credits: getLocalVal('geo_credits', 0),
  creditsCollected: 0,
  selectedCharacter: getLocalVal<'cypher' | 'lash' | 'rail'>('geo_selected_character', 'cypher'),
  permanentUpgrades: getUpgradeDefaults(),
  showShop: false,
  showGrimoire: false,

  // Run Specific Defrag Modifiers
  runRerolls: 0,
  runBanishes: 0,
  bannedUpgradeIds: [] as string[],

  // Active Overload Ability
  overloadCharge: 0,
  overloadMax: 100,
  overloadActive: false,
  overloadTimer: 0,

  // Player Stats
  health: { current: 100, max: 100 },
  xp: 0,
  xpMax: 100,
  level: 1,
  score: 0,
  kills: 0,

  // Inventory
  weaponSlots: [] as WeaponSlot[],
  passiveSlots: [] as PassiveSlot[],
  // Weapon readiness (0 = just fired, 1 = ready), parallel to weaponSlots
  weaponReadiness: [] as number[],

  // Game Status
  gameState: 'MENU' as 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER',
  gameTime: 0,
  isPaused: false,
  isGameOver: false,
  isVictory: false,
  bossHealth: { current: 0, max: 100, active: false },

  // Feedback pulses (incrementing counters restart the CSS animations)
  damageFlash: 0,

  // UI Visibility
  showSettings: false,
  showUpgrade: false,
  activeSettingsTab: 'audio' as 'audio' | 'display' | 'gameplay',
  upgradeChoices: [] as UpgradeOption[],

  // Multiplayer
  isMultiplayer: false,
  isHost: false,
  roomCode: '',
  networkStatus: 'disconnected' as
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'waiting_for_players',
  peerId: '',
  remotePlayersCount: 0,
  customServerUrl:
    typeof window !== 'undefined' ? localStorage.getItem('geo_server_url') || '' : '',

  // Chosen display name (persisted), used as this player's name in multiplayer
  playerName: typeof window !== 'undefined' ? localStorage.getItem('geo_player_name') || '' : '',

  // Live party roster (all players incl. self) — drives the co-op teammate HUD
  party: [] as {
    connectionId: string;
    name: string;
    hp: number;
    maxHp: number;
    level: number;
    isLocal: boolean;
  }[],

  // Settings
  fps: 60,
  showFps: false,

  // Anomalies
  insideOverclockZone: false,
  insideDefragZone: false,
  insideLeakZone: false,

  // PWA / install
  canInstall: false,
  isStandalone: false,
  needsRefresh: false,

  // Transient notification banner (replaces alert(), which cross-origin
  // iframe embeds — i.e. game portals — silently block)
  toast: '' as string,
});

export function showToast(message: string): void {
  uiState.toast = message;
}
