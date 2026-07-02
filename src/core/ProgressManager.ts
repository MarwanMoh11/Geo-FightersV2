/**
 * ProgressManager — lifetime stats, achievements, and the unlock carrot.
 *
 * Every achievement unlocks something (a character, a weapon, or an arena) and
 * has a numeric progress readout so the game-over screen can show "almost
 * there" teases. Stats persist in localStorage and accumulate across runs.
 */

import { showToast, uiState } from './UIState.svelte.ts';
import { playLevelUp } from './audio';

// --- LIFETIME STATS ---
export interface LifetimeStats {
  kills: number;
  damageDealt: number;
  chestsOpened: number;
  evolutions: number;
  creditsEarned: number;
  runs: number;
  wins: number;
  bestTime: number; // seconds survived in a single run
  bestLevel: number;
  bestKills: number; // kills in a single run
  vaultsCracked: number;
  dailiesPlayed: number;
  dailyStreak: number;
  lastDailyDate: string;
}

const STATS_KEY = 'geo_lifetime_stats';
const UNLOCKS_KEY = 'geo_unlocked_achievements';

const DEFAULT_STATS: LifetimeStats = {
  kills: 0,
  damageDealt: 0,
  chestsOpened: 0,
  evolutions: 0,
  creditsEarned: 0,
  runs: 0,
  wins: 0,
  bestTime: 0,
  bestLevel: 0,
  bestKills: 0,
  vaultsCracked: 0,
  dailiesPlayed: 0,
  dailyStreak: 0,
  lastDailyDate: '',
};

let stats: LifetimeStats = { ...DEFAULT_STATS };
let unlocked = new Set<string>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function load(): void {
  try {
    const s = localStorage.getItem(STATS_KEY);
    if (s) stats = { ...DEFAULT_STATS, ...JSON.parse(s) };
    const u = localStorage.getItem(UNLOCKS_KEY);
    if (u) unlocked = new Set(JSON.parse(u));
  } catch {
    /* fresh profile */
  }
}

function save(): void {
  // Debounced — kills/damage tick every frame during hordes.
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
      localStorage.setItem(UNLOCKS_KEY, JSON.stringify([...unlocked]));
    } catch {
      /* storage may be unavailable in some embeds */
    }
  }, 1000);
}

export function getLifetimeStats(): LifetimeStats {
  return { ...stats };
}

// --- ACHIEVEMENTS ---
export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  /** Current progress (numerator) toward `target`. */
  progress: (s: LifetimeStats) => number;
  target: number;
  /** What completing this unlocks. */
  unlock?: { type: 'character' | 'weapon' | 'arena'; id: string; label: string };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // --- Character unlocks ---
  {
    id: 'ach_damage_50k',
    name: 'HEAVY OUTPUT',
    description: 'Deal 50,000 lifetime damage',
    progress: (s) => s.damageDealt,
    target: 50000,
    unlock: { type: 'character', id: 'lash', label: 'LASH' },
  },
  {
    id: 'ach_survive_6',
    name: 'DEEP RUNNER',
    description: 'Survive to 6:00 in a single run',
    progress: (s) => s.bestTime,
    target: 360,
    unlock: { type: 'character', id: 'rail', label: 'RAIL' },
  },
  {
    id: 'ach_level_20',
    name: 'ESCALATION',
    description: 'Reach level 20 in a single run',
    progress: (s) => s.bestLevel,
    target: 20,
    unlock: { type: 'character', id: 'nova', label: 'NOVA' },
  },
  {
    id: 'ach_chests_20',
    name: 'LOOT PROTOCOL',
    description: 'Open 20 chests',
    progress: (s) => s.chestsOpened,
    target: 20,
    unlock: { type: 'character', id: 'byte', label: 'BYTE' },
  },
  {
    id: 'ach_survive_8',
    name: 'BOSS WITNESS',
    description: 'Survive to 8:00 in a single run',
    progress: (s) => s.bestTime,
    target: 480,
    unlock: { type: 'character', id: 'ghost', label: 'GHOST' },
  },
  {
    id: 'ach_kills_10k',
    name: 'EXTERMINATOR',
    description: 'Destroy 10,000 lifetime enemies',
    progress: (s) => s.kills,
    target: 10000,
    unlock: { type: 'character', id: 'titan', label: 'TITAN' },
  },
  {
    id: 'ach_win',
    name: 'SYSTEM CLEANSED',
    description: 'Win a run (survive to 10:00)',
    progress: (s) => s.wins,
    target: 1,
    unlock: { type: 'character', id: 'flux', label: 'FLUX' },
  },
  // --- Weapon unlocks ---
  {
    id: 'ach_kills_500',
    name: 'FIRST SWEEP',
    description: 'Destroy 500 lifetime enemies',
    progress: (s) => s.kills,
    target: 500,
    unlock: { type: 'weapon', id: 'arc_splitter', label: 'ARC SPLITTER' },
  },
  {
    id: 'ach_evolve',
    name: 'METAMORPHOSIS',
    description: 'Evolve any weapon',
    progress: (s) => s.evolutions,
    target: 1,
    unlock: { type: 'weapon', id: 'void_mortar', label: 'VOID MORTAR' },
  },
  {
    id: 'ach_kills_2500',
    name: 'STORM FRONT',
    description: 'Destroy 2,500 lifetime enemies',
    progress: (s) => s.kills,
    target: 2500,
    unlock: { type: 'weapon', id: 'gale_rotor', label: 'GALE ROTOR' },
  },
  {
    id: 'ach_credits_1k',
    name: 'CAPITAL RUNNER',
    description: 'Earn 1,000 lifetime credits',
    progress: (s) => s.creditsEarned,
    target: 1000,
    unlock: { type: 'weapon', id: 'beam_lancer', label: 'BEAM LANCER' },
  },
  {
    id: 'ach_vaults_5',
    name: 'SAFECRACKER',
    description: 'Crack 5 data vaults',
    progress: (s) => s.vaultsCracked,
    target: 5,
    unlock: { type: 'weapon', id: 'shard_mines', label: 'SHARD MINES' },
  },
  {
    id: 'ach_runkills_1k',
    name: 'ONE-RUN ARMY',
    description: 'Destroy 1,000 enemies in a single run',
    progress: (s) => s.bestKills,
    target: 1000,
    unlock: { type: 'weapon', id: 'echo_javelin', label: 'ECHO JAVELIN' },
  },
  // --- Arena unlock ---
  {
    id: 'ach_win_arena',
    name: 'CORE ACCESS',
    description: 'Win a run to access the Data Core arena',
    progress: (s) => s.wins,
    target: 1,
    unlock: { type: 'arena', id: 'data_core', label: 'DATA CORE ARENA' },
  },
  // --- Pure bragging rights (still show progress) ---
  {
    id: 'ach_kills_50k',
    name: 'SCOURGE OF THE SYSTEM',
    description: 'Destroy 50,000 lifetime enemies',
    progress: (s) => s.kills,
    target: 50000,
  },
  {
    id: 'ach_dailies_7',
    name: 'CREATURE OF HABIT',
    description: 'Hold a 7-day daily-run streak',
    progress: (s) => s.dailyStreak,
    target: 7,
  },
];

function checkAchievements(): void {
  for (const a of ACHIEVEMENTS) {
    if (unlocked.has(a.id)) continue;
    if (a.progress(stats) >= a.target) {
      unlocked.add(a.id);
      save();
      const suffix = a.unlock ? ` — ${a.unlock.label} UNLOCKED` : '';
      showToast(`🏆 ${a.name}${suffix}`);
      playLevelUp();
      uiState.unlocksThisRun.push(a.id);
    }
  }
}

export function isAchievementUnlocked(id: string): boolean {
  return unlocked.has(id);
}

/** Characters/weapons/arenas with no gating achievement are always unlocked. */
function isContentUnlocked(type: 'character' | 'weapon' | 'arena', id: string): boolean {
  const gate = ACHIEVEMENTS.find((a) => a.unlock?.type === type && a.unlock.id === id);
  return !gate || unlocked.has(gate.id);
}

export const isCharacterUnlocked = (id: string) => isContentUnlocked('character', id);
export const isWeaponUnlocked = (id: string) => isContentUnlocked('weapon', id);
export const isArenaUnlocked = (id: string) => isContentUnlocked('arena', id);

/** The gating achievement for a piece of content (for lock tooltips). */
export function getUnlockCondition(
  type: 'character' | 'weapon' | 'arena',
  id: string,
): AchievementDef | null {
  return ACHIEVEMENTS.find((a) => a.unlock?.type === type && a.unlock.id === id) ?? null;
}

/** Locked achievements sorted by closeness, for the game-over tease. */
export function getNearestLocked(count: number): { def: AchievementDef; pct: number }[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.has(a.id))
    .map((def) => ({ def, pct: Math.min(1, def.progress(stats) / def.target) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, count);
}

// --- EVENT HOOKS (called by game systems) ---

export function recordKill(): void {
  stats.kills++;
  if (uiState.kills > stats.bestKills) stats.bestKills = uiState.kills;
  // Achievements checked on the cheap events; kills tick constantly, so
  // sample every 25th to keep the hot path free.
  if (stats.kills % 25 === 0) {
    checkAchievements();
    save();
  }
}

export function recordDamage(amount: number): void {
  stats.damageDealt += amount;
}

export function recordChestOpened(): void {
  stats.chestsOpened++;
  checkAchievements();
  save();
}

export function recordEvolution(): void {
  stats.evolutions++;
  checkAchievements();
  save();
}

export function recordCredits(amount: number): void {
  stats.creditsEarned += amount;
}

export function recordVaultCracked(): void {
  stats.vaultsCracked++;
  checkAchievements();
  save();
}

export function recordDailyPlayed(dateKey: string): void {
  stats.dailiesPlayed++;
  // Streak: consecutive-day check against the previous daily date.
  const prev = stats.lastDailyDate;
  const prevDay = prev ? Date.parse(prev + 'T00:00:00Z') : 0;
  const thisDay = Date.parse(dateKey + 'T00:00:00Z');
  stats.dailyStreak = thisDay - prevDay === 86400000 ? stats.dailyStreak + 1 : 1;
  stats.lastDailyDate = dateKey;
  checkAchievements();
  save();
}

/** Call once when a run ends (victory or defeat). */
export function recordRunEnd(runTime: number, level: number, victory: boolean): void {
  stats.runs++;
  if (victory) stats.wins++;
  if (runTime > stats.bestTime) stats.bestTime = runTime;
  if (level > stats.bestLevel) stats.bestLevel = level;
  if (uiState.kills > stats.bestKills) stats.bestKills = uiState.kills;
  checkAchievements();
  save();
}

// Initialize on module load
load();
checkAchievements();
