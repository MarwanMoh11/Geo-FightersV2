/**
 * DailyManager — the daily seeded run + daily quests.
 *
 * Daily run: everyone gets the same setup (character / corruption / protocol)
 * derived from the UTC date, one attempt per day, local best + streak. Quests:
 * three rotating goals that pay credits, evaluated when a run ends.
 */

import { uiState, showToast } from './UIState.svelte.ts';
import { CHARACTERS } from './CharacterRegistry';
import { PROTOCOLS } from './ProtocolRegistry';
import { recordDailyPlayed, getLifetimeStats } from './ProgressManager';

// --- SEEDED RNG (mulberry32) ---
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
}

function seedFromDate(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// --- DAILY RUN CONFIG ---
export interface DailyConfig {
  dateKey: string;
  characterId: string;
  corruption: number;
  protocolId: string;
}

export function getDailyConfig(): DailyConfig {
  const dateKey = todayKey();
  const rng = mulberry32(seedFromDate(dateKey));
  return {
    dateKey,
    characterId: CHARACTERS[Math.floor(rng() * CHARACTERS.length)].id,
    corruption: Math.floor(rng() * 4), // 0-3 (5 stays a self-set flex)
    protocolId: PROTOCOLS[Math.floor(rng() * PROTOCOLS.length)].id,
  };
}

interface DailyState {
  dateKey: string;
  attempted: boolean;
  score: number;
  bestScore: number; // all-time best daily score
}

const DAILY_KEY = 'geo_daily_state';

function loadDaily(): DailyState {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DailyState;
      if (parsed.dateKey === todayKey()) return parsed;
      return { dateKey: todayKey(), attempted: false, score: 0, bestScore: parsed.bestScore || 0 };
    }
  } catch {
    /* fresh */
  }
  return { dateKey: todayKey(), attempted: false, score: 0, bestScore: 0 };
}

let daily = loadDaily();

function saveDaily(): void {
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(daily));
  } catch {
    /* best-effort */
  }
}

export function isDailyAvailable(): boolean {
  daily = loadDaily(); // re-check date rollover
  return !daily.attempted;
}

export function getDailyState(): DailyState {
  daily = loadDaily();
  return { ...daily };
}

/** Configure uiState for the daily run. Call right before starting it. */
export function beginDailyRun(): void {
  const cfg = getDailyConfig();
  uiState.selectedCharacter = cfg.characterId;
  uiState.corruption = cfg.corruption;
  uiState.isDailyRun = true;
  daily.attempted = true;
  saveDaily();
  recordDailyPlayed(cfg.dateKey);
}

// --- DAILY QUESTS ---
export interface QuestDef {
  id: string;
  description: string;
  reward: number; // credits
  evaluate: (run: RunSummary) => boolean;
}

export interface RunSummary {
  kills: number;
  time: number;
  level: number;
  creditsCollected: number;
  chestsOpenedThisRun: number;
  victory: boolean;
  corruption: number;
  bestCombo: number;
}

const QUEST_POOL: QuestDef[] = [
  {
    id: 'q_kills_300',
    description: 'Destroy 300 enemies in one run',
    reward: 60,
    evaluate: (r) => r.kills >= 300,
  },
  {
    id: 'q_kills_600',
    description: 'Destroy 600 enemies in one run',
    reward: 100,
    evaluate: (r) => r.kills >= 600,
  },
  { id: 'q_time_4', description: 'Survive to 4:00', reward: 50, evaluate: (r) => r.time >= 240 },
  { id: 'q_time_7', description: 'Survive to 7:00', reward: 90, evaluate: (r) => r.time >= 420 },
  {
    id: 'q_level_12',
    description: 'Reach level 12 in one run',
    reward: 70,
    evaluate: (r) => r.level >= 12,
  },
  {
    id: 'q_credits_40',
    description: 'Collect 40 credits in one run',
    reward: 60,
    evaluate: (r) => r.creditsCollected >= 40,
  },
  {
    id: 'q_combo_50',
    description: 'Hit a ×50 kill combo',
    reward: 70,
    evaluate: (r) => r.bestCombo >= 50,
  },
  {
    id: 'q_corrupt_2',
    description: 'Survive to 3:00 at Corruption 2+',
    reward: 90,
    evaluate: (r) => r.time >= 180 && r.corruption >= 2,
  },
  { id: 'q_win', description: 'Win a run', reward: 150, evaluate: (r) => r.victory },
];

interface QuestState {
  dateKey: string;
  questIds: string[];
  claimed: string[]; // quest ids already paid out
}

const QUESTS_KEY = 'geo_daily_quests';

function rollQuests(): QuestState {
  const dateKey = todayKey();
  const rng = mulberry32(seedFromDate(dateKey) ^ 0xbeef);
  const pool = [...QUEST_POOL];
  const picks: string[] = [];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    picks.push(pool.splice(Math.floor(rng() * pool.length), 1)[0].id);
  }
  return { dateKey, questIds: picks, claimed: [] };
}

function loadQuests(): QuestState {
  try {
    const raw = localStorage.getItem(QUESTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as QuestState;
      if (parsed.dateKey === todayKey()) return parsed;
    }
  } catch {
    /* fresh */
  }
  return rollQuests();
}

let quests = loadQuests();

function saveQuests(): void {
  try {
    localStorage.setItem(QUESTS_KEY, JSON.stringify(quests));
  } catch {
    /* best-effort */
  }
}

export function getTodaysQuests(): { def: QuestDef; claimed: boolean }[] {
  quests = loadQuests();
  return quests.questIds
    .map((id) => QUEST_POOL.find((q) => q.id === id))
    .filter((q): q is QuestDef => !!q)
    .map((def) => ({ def, claimed: quests.claimed.includes(def.id) }));
}

/**
 * Evaluate quests + daily score at the end of a run. Wired into
 * GameManager's game-over/victory paths.
 */
export function onRunEnded(): void {
  const run: RunSummary = {
    kills: uiState.kills,
    time: uiState.gameTime,
    level: uiState.level,
    creditsCollected: uiState.creditsCollected,
    chestsOpenedThisRun: 0,
    victory: uiState.isVictory,
    corruption: uiState.corruption,
    bestCombo: uiState.bestCombo,
  };

  // Quests pay instantly on completion.
  quests = loadQuests();
  for (const id of quests.questIds) {
    if (quests.claimed.includes(id)) continue;
    const def = QUEST_POOL.find((q) => q.id === id);
    if (def && def.evaluate(run)) {
      quests.claimed.push(id);
      uiState.credits += def.reward;
      try {
        localStorage.setItem('geo_credits', JSON.stringify(uiState.credits));
      } catch {
        /* best-effort */
      }
      showToast(`✅ QUEST COMPLETE: ${def.description} (+${def.reward}¢)`);
    }
  }
  saveQuests();

  // Daily run score: survival time + kills, with a victory bonus.
  if (uiState.isDailyRun) {
    const score = Math.round(run.time * 10 + run.kills + (run.victory ? 2000 : 0));
    daily = loadDaily();
    daily.score = score;
    if (score > daily.bestScore) daily.bestScore = score;
    saveDaily();
    uiState.isDailyRun = false;
    const streak = getLifetimeStats().dailyStreak;
    showToast(`📅 DAILY SCORE: ${score}${streak > 1 ? ` — ${streak}-day streak!` : ''}`);
  }
}
