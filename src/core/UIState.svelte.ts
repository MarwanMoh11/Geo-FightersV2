import type { WeaponSlot, PassiveSlot } from './world';
import type { UpgradeOption } from '../systems/UpgradeSystem';
import { CORRUPTION_DEFAULT } from './corruption';

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

/**
 * Best-effort localStorage write. Older iOS Safari (private mode, low
 * storage, some webviews) THROWS on setItem — and a throw inside a tap
 * handler kills everything after it, which read as "menu buttons don't
 * work" on old iPhones. Pass the exact string you would have passed to
 * localStorage.setItem.
 */
export function saveLocal(key: string, value: string): void {
  if (!isClient) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — play on without persistence */
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
  selectedCharacter: getLocalVal<string>('geo_selected_character', 'cypher'),
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
  // Rewarded SECOND CHANCE (portal builds): offered once per solo run at the
  // moment of death, before the game-over bookkeeping runs.
  showSecondChance: false,
  secondChanceUsed: false,
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
    | 'in_lobby'
    | 'connected'
    | 'waiting_for_players',
  peerId: '',
  remotePlayersCount: 0,
  customServerUrl:
    typeof window !== 'undefined' ? localStorage.getItem('geo_server_url') || '' : '',

  // Chosen display name (persisted), used as this player's name in multiplayer
  playerName: typeof window !== 'undefined' ? localStorage.getItem('geo_player_name') || '' : '',

  // Party lobby roster (pre-game): who's in, chosen characters, ready states
  lobby: {
    players: [] as {
      connectionId: string;
      name: string;
      character: string;
      ready: boolean;
      isHost: boolean;
    }[],
    started: false,
  },

  // Live party roster (all players incl. self) — drives the co-op teammate HUD
  // and the end-of-run scoreboard
  party: [] as {
    connectionId: string;
    name: string;
    hp: number;
    maxHp: number;
    level: number;
    kills: number;
    dead: boolean;
    revivePct: number; // 0-100 while being revived
    character: string;
    isLocal: boolean;
  }[],

  // Settings
  fps: 60,
  showFps: false,

  // Anomalies
  insideOverclockZone: false,
  // Map 1 shrine buffs (seconds remaining; ticked by ShrineSystem)
  shrineFireTimer: 0,
  shrineArmorTimer: 0,
  shrineSpeedTimer: 0,
  // Phase 1.95: wayfinding arrows (written by WayfindingSystem at 10 Hz)
  poiArrows: [] as {
    id: number;
    icon: string;
    color: string;
    leftPct: number;
    topPct: number;
    angleDeg: number;
    dist: number;
  }[],
  // MAGNA-PULSE consumable: XP magnet radius is infinite while this ticks
  magnaPulseTimer: 0,
  // Phase 1.96 JACK IN: live breach session (opens the BreachOverlay modal)
  breach: null as null | {
    nodeId: string;
    kind: 'depot' | 'armory' | 'bank' | 'relay' | 'substation' | 'stashden';
    name: string;
    icon: string;
    color: string;
    security: number; // 0-3
    overclock: boolean;
  },
  // Door prompt shown while standing at a ready node (null = none nearby)
  breachPrompt: null as null | {
    nodeId: string;
    name: string;
    icon: string;
    color: string;
    security: number;
    hasKey: boolean;
  },
  // Co-op defend-the-hacker meter (1 = intact; solo never drains)
  breachShield: 1,
  // SKELETON KEY consumables held this run (auto-complete a breach)
  skeletonKeys: 0,
  // RELAY TOWER reward: all enemies move at half speed while this ticks
  relaySlowTimer: 0,
  // NEON SURGE event: double XP inside this district rect while it ticks
  neonSurge: null as {
    name: string;
    x1: number;
    z1: number;
    x2: number;
    z2: number;
    timer: number;
  } | null,
  insideDefragZone: false,
  insideLeakZone: false,

  // Progression & unlocks
  unlocksThisRun: [] as string[], // achievement ids earned during the current run
  showRecords: false, // achievements/stats modal

  // First-run tutorial overlay (shown once, then remembered)
  showOnboarding: false,

  // Global leaderboard: rank of the run that just ended (0 = none/unranked)
  lastRunRank: 0,
  lastRunRankTotal: 0,

  // Co-op transport: 'p2p' = direct WebRTC to every peer, 'mixed' = some peers
  // on P2P, 'relay' = all traffic through the signaling server. netRtt is the
  // best measured P2P round-trip in ms (-1 = unknown).
  netTransport: 'relay' as 'relay' | 'p2p' | 'mixed',
  netRtt: -1,

  // Corruption dial (0-5 risk/reward, persisted)
  // v2 key: the standard threat level is now 5 (was 0). Bumping the key retires
  // every old saved "0" so existing players also start at the new standard;
  // anyone who wants it easy dials down to 0.
  corruption: getLocalVal('geo_corruption_v2', CORRUPTION_DEFAULT),

  // FLUX Chaos Surge: which effect the roulette rolled ('' = none active)
  fluxEffect: '' as '' | 'nuke' | 'frenzy' | 'heal' | 'gold',

  // Data protocol (run modifier picked at run start)
  activeProtocolId: '' as string,
  showProtocolChoice: false,
  protocolChoices: [] as string[], // protocol ids offered

  // Kill combo + callouts
  combo: 0,
  comboTimer: 0,
  bestCombo: 0,
  callout: '', // transient HUD announcement ("COMBO x100", "BOSS INBOUND")
  calloutSeq: 0, // increments to restart the animation

  // Chest ceremony
  showChestCeremony: false,
  chestRewards: [] as { name: string; icon: string; detail: string }[],
  chestRarity: 'common' as 'common' | 'uncommon' | 'rare' | 'epic',

  // Endless mode (after victory)
  showVictoryChoice: false,
  endlessMode: false,

  // Daily run
  isDailyRun: false,

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

/** Flash a big HUD callout ("COMBO x100", "VAULT DETECTED"). */
export function announce(text: string): void {
  uiState.callout = text;
  uiState.calloutSeq++;
}
