/**
 * SpawnTimeline — Vampire Survivors wave data (Phase 1.97 HORDE)
 *
 * Faithful port of VS's documented spawn model
 * (https://vampire-survivors.fandom.com/wiki/Enemies):
 *
 *   • One WAVE per minute. Each wave defines a MINIMUM-ALIVE quota, a spawn
 *     tick interval, and a weighted enemy pool.
 *   • Below quota → the deficit is filled immediately (density is a
 *     guaranteed, escalating variable — the screen is never empty).
 *   • At/above quota → each tick spawns one of each pool type anyway, so the
 *     pressure always trickles upward.
 *   • Scripted SWARMS at fixed timestamps: perfect rings that close on the
 *     player (the VS "flower trap") and line walls that sweep in.
 *   • ELITES on a fixed schedule (chest bearers), minibosses at 5:00/9:00.
 *   • Later waves respawn the same enemies with more HP (wave hpMult), so
 *     player power growth races enemy bulk — the VS tension curve.
 *
 * The stage is authored for the 10-minute run (FinaleBoss owns 10:00);
 * endless mode extends the last wave with its own growth rules.
 */

import { EnemyType } from './factories';

// --- DATA STRUCTURES ---

export interface WavePoolEntry {
  type: EnemyType;
  weight: number;
}

export interface Wave {
  /** Wave index == minute of the run (0-based) */
  minute: number;
  /** Minimum enemies alive; deficits are filled instantly */
  minAlive: number;
  /** Seconds between spawn ticks */
  interval: number;
  /** Weighted pool for quota fills and at-quota trickle */
  pool: WavePoolEntry[];
  /** HP multiplier applied to everything spawned during this wave */
  hpMult: number;
}

export interface SwarmEvent {
  at: number; // seconds
  kind: 'ring' | 'line';
  type: EnemyType;
  count: number;
  /** Swarm bodies are brittle (VS bat swarms are near-1hp) */
  hpMult: number;
  /** Rings close faster than the ambient horde */
  speedMult: number;
}

export interface EliteEvent {
  at: number; // seconds
  type: EnemyType;
  count: number;
  announce?: string;
}

// --- STAGE 1: NEON BLOCK SLUMS, 10 MINUTES ---

export const STAGE_1_WAVES: Wave[] = [
  {
    minute: 0,
    minAlive: 14,
    interval: 0.6,
    hpMult: 1.0,
    pool: [{ type: EnemyType.VIRUS, weight: 100 }],
  },
  {
    minute: 1,
    minAlive: 26,
    interval: 0.55,
    hpMult: 1.0,
    pool: [
      { type: EnemyType.VIRUS, weight: 75 },
      { type: EnemyType.GLITCH, weight: 30 },
    ],
  },
  {
    minute: 2,
    minAlive: 40,
    interval: 0.5,
    hpMult: 1.15,
    pool: [
      { type: EnemyType.VIRUS, weight: 65 },
      { type: EnemyType.GLITCH, weight: 45 },
    ],
  },
  {
    minute: 3,
    minAlive: 58,
    interval: 0.5,
    hpMult: 1.3,
    pool: [
      { type: EnemyType.VIRUS, weight: 55 },
      { type: EnemyType.GLITCH, weight: 55 },
      { type: EnemyType.FIREWALL, weight: 6 },
    ],
  },
  {
    minute: 4,
    minAlive: 78,
    interval: 0.45,
    hpMult: 1.5,
    pool: [
      { type: EnemyType.VIRUS, weight: 50 },
      { type: EnemyType.GLITCH, weight: 60 },
      { type: EnemyType.FIREWALL, weight: 8 },
    ],
  },
  {
    minute: 5,
    minAlive: 100,
    interval: 0.45,
    hpMult: 1.7,
    pool: [
      { type: EnemyType.VIRUS, weight: 45 },
      { type: EnemyType.GLITCH, weight: 65 },
      { type: EnemyType.FIREWALL, weight: 10 },
    ],
  },
  {
    minute: 6,
    minAlive: 125,
    interval: 0.4,
    hpMult: 1.95,
    pool: [
      { type: EnemyType.VIRUS, weight: 40 },
      { type: EnemyType.GLITCH, weight: 70 },
      { type: EnemyType.FIREWALL, weight: 12 },
    ],
  },
  {
    minute: 7,
    minAlive: 150,
    interval: 0.4,
    hpMult: 2.2,
    pool: [
      { type: EnemyType.VIRUS, weight: 35 },
      { type: EnemyType.GLITCH, weight: 70 },
      { type: EnemyType.FIREWALL, weight: 14 },
    ],
  },
  {
    minute: 8,
    minAlive: 180,
    interval: 0.35,
    hpMult: 2.5,
    pool: [
      { type: EnemyType.VIRUS, weight: 30 },
      { type: EnemyType.GLITCH, weight: 70 },
      { type: EnemyType.FIREWALL, weight: 16 },
    ],
  },
  {
    minute: 9,
    minAlive: 210,
    interval: 0.35,
    hpMult: 2.9,
    pool: [
      { type: EnemyType.VIRUS, weight: 25 },
      { type: EnemyType.GLITCH, weight: 70 },
      { type: EnemyType.FIREWALL, weight: 18 },
    ],
  },
];

// Endless mode: the last wave keeps growing past 10:00
export const ENDLESS_GROWTH = {
  minAlivePerMinute: 25,
  minAliveCap: 260, // headroom under MAX_ENEMIES for swarms/elites
  hpMultPerMinute: 0.4,
  intervalFloor: 0.3,
};

// --- SCRIPTED SWARMS (every minute at :30, alternating trap shapes) ---
// Rings are the VS flower trap: a perfect closing circle you must break
// through. Lines are walls that sweep across the approach lane.
export const STAGE_1_SWARMS: SwarmEvent[] = [
  { at: 90, kind: 'ring', type: EnemyType.VIRUS, count: 24, hpMult: 0.6, speedMult: 1.35 },
  { at: 150, kind: 'line', type: EnemyType.GLITCH, count: 18, hpMult: 0.6, speedMult: 1.2 },
  { at: 210, kind: 'ring', type: EnemyType.VIRUS, count: 32, hpMult: 0.6, speedMult: 1.35 },
  { at: 270, kind: 'line', type: EnemyType.GLITCH, count: 22, hpMult: 0.6, speedMult: 1.2 },
  { at: 330, kind: 'ring', type: EnemyType.VIRUS, count: 40, hpMult: 0.6, speedMult: 1.35 },
  { at: 390, kind: 'line', type: EnemyType.GLITCH, count: 26, hpMult: 0.6, speedMult: 1.2 },
  { at: 450, kind: 'ring', type: EnemyType.VIRUS, count: 48, hpMult: 0.6, speedMult: 1.4 },
  { at: 510, kind: 'line', type: EnemyType.GLITCH, count: 30, hpMult: 0.6, speedMult: 1.25 },
  // Pre-finale panic ring
  { at: 570, kind: 'ring', type: EnemyType.VIRUS, count: 56, hpMult: 0.6, speedMult: 1.45 },
];

// Endless: keep the ring traps coming every 60s after the authored list ends
export const ENDLESS_SWARM = {
  interval: 60,
  base: { kind: 'ring' as const, type: EnemyType.VIRUS, hpMult: 0.6, speedMult: 1.45 },
  count: 56,
  countPerMinute: 4,
  countCap: 90,
};

// --- ELITE SCHEDULE (chest bearers + minibosses) ---
export const STAGE_1_ELITES: EliteEvent[] = [
  { at: 90, type: EnemyType.ENFORCER, count: 1 },
  { at: 180, type: EnemyType.WARDEN, count: 1 },
  { at: 270, type: EnemyType.ENFORCER, count: 2 },
  { at: 300, type: EnemyType.HYDRA, count: 1, announce: 'PROXY HYDRA ONLINE' },
  { at: 360, type: EnemyType.COLOSSUS, count: 1 },
  { at: 450, type: EnemyType.WARDEN, count: 2 },
  { at: 510, type: EnemyType.COLOSSUS, count: 1 },
  { at: 512, type: EnemyType.ENFORCER, count: 1 },
  { at: 540, type: EnemyType.HYDRA, count: 1, announce: 'PROXY HYDRA ONLINE' },
];

// Endless: an elite pack every 45s, cycling types
export const ENDLESS_ELITES = {
  interval: 45,
  rotation: [EnemyType.ENFORCER, EnemyType.WARDEN, EnemyType.COLOSSUS, EnemyType.HYDRA],
};

// --- HELPERS ---

export function getWave(elapsedSeconds: number): Wave {
  const idx = Math.min(Math.floor(elapsedSeconds / 60), STAGE_1_WAVES.length - 1);
  return STAGE_1_WAVES[idx];
}

export function pickFromPool(pool: WavePoolEntry[]): EnemyType {
  let total = 0;
  for (const e of pool) total += e.weight;
  let roll = Math.random() * total;
  for (const e of pool) {
    if (roll < e.weight) return e.type;
    roll -= e.weight;
  }
  return pool[pool.length - 1].type;
}
