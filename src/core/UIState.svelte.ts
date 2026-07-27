import type { WeaponSlot, PassiveSlot } from './world';
import type { ExploitDef } from './ExploitRegistry';
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
  /** Payout breakdown for the run that just ended (set by bankRunCredits). */
  lastPayout: { collected: 0, bonus: 0, total: 0 },
  selectedCharacter: getLocalVal<string>('geo_selected_character', 'cypher'),
  permanentUpgrades: getUpgradeDefaults(),
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
  exploitSlots: [] as (ExploitDef | null)[],
  // ROOTKITS. The exploit row of the loadout bar stays completely hidden until
  // the player has earned one — three permanently-empty dashed slots taught
  // nothing except that something was missing. The first grant opens
  // ExploitUnlockModal, and dismissing it reveals the row for good.
  exploitsRevealed: getLocalVal('geo_exploits_revealed', false),
  exploitTutorial: null as null | {
    name: string;
    icon: string;
    desc: string;
    tag: string;
    rarity: string;
  },
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
    diving: boolean; // jacked into a breach dive — body kneeling, needs cover
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
    /** This vault can hand out a ROOTKIT on a won dive (the only exploit source). */
    rootkit?: boolean;
    opened?: boolean; // true when the node has been permanently breached
  },
  // Co-op defend-the-hacker meter (1 = intact; solo never drains)
  breachShield: 1,
  // SKELETON KEY consumables held this run (auto-complete a breach)
  skeletonKeys: 0,
  // RELAY TOWER reward: all enemies move at half speed while this ticks
  relaySlowTimer: 0,
  // BREACH DIVE: active dive session (the sub-scene runs in place of the
  // arena loop while this is non-null). Modeled on `breach` above — the
  // union literal is inlined to avoid a circular import with BreachSystem.
  dive: null as null | {
    nodeId: string;
    kind: 'depot' | 'armory' | 'bank' | 'relay' | 'substation' | 'stashden';
    name: string;
    verb: string; // verb name, e.g. "EXTRACTION"
    brief: string; // one-line briefing shown on entry
    icon: string;
    color: string;
    security: number; // 0-3
    overclock: boolean;
    // TRACE IS THE CLOCK: it fills over the verb's time budget, so `trace` and
    // `secondsLeft` are two views of the same number. `traceFloor` is the
    // scrub floor — trace can be pushed back by kills, but never below this.
    trace: number;
    traceMax: number;
    traceFloor: number;
    secondsLeft: number;
    stage: string; // big directive, e.g. "CONTESTED"
    objectiveText: string; // supporting line, e.g. "Crates 3/6"
    note: string; // optional third line, e.g. "NEXT PUSH — 35% BUST"
    health: number;
    healthMax: number;
    progress: number; // objective progress bar (0..progressMax)
    progressMax: number;
    iceCount: number;
    turretCount: number;
    hurt: number; // >0 while the damage vignette plays
    banner: string; // centre-screen callout (the arena HUD is hidden mid-dive)
    bannerSeq: number;
    // Packed radar frame: [nx, nz, kind, ...] with kind
    // 0 = objective, 1 = active objective, 2 = exit, 3 = ICE.
    radar: number[];
  },
  // Brief enter/exit transition overlay (driven by DiveHUD CSS animation)
  diveTransition: null as null | 'enter' | 'exit',
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
  // "How to Play" reference — always reachable from the menu and the pause
  // screen, so a player who skipped onboarding is never stranded.
  showHowTo: false,

  // Global leaderboard: rank of the run that just ended (0 = none/unranked)
  lastRunRank: 0,
  lastRunRankTotal: 0,

  // Co-op transport: 'p2p' = direct WebRTC to every peer, 'mixed' = some peers
  // on P2P, 'relay' = all traffic through the signaling server. netRtt is the
  // best measured P2P round-trip in ms (-1 = unknown).
  netTransport: 'relay' as 'relay' | 'p2p' | 'mixed',
  netRtt: -1,
  // True when the P2P link had to go through a TURN relay (CGNAT / symmetric
  // NAT). Surfaced in the HUD net chip so a TURN outage is visible rather than
  // showing up as "some players just can't connect".
  netRelayed: false,

  // Threat dial (0-10 risk/reward, persisted)
  // v3 key: LEVEL ZERO is the default again. The v2 key retired old zeroes to
  // force everyone onto 5; bumping to v3 retires those fives symmetrically, so
  // returning players land on the new default instead of keeping a dial they
  // never chose. Anyone who wants pressure raises it and that choice sticks.
  corruption: getLocalVal('geo_corruption_v3', CORRUPTION_DEFAULT),

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
