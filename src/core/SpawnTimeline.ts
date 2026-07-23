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
  /** Contact-damage multiplier (enemies hit harder each wave) */
  dmgMult: number;
  /** Move-speed multiplier (enemies get faster each wave) */
  speedMult: number;
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

// THE PIT quota curve, VS-INSANITY+50% tune: peak 510 alive in a 140-unit
// room where EVERY enemy is on-screen. All minAlive values are the prior
// VS-INSANITY pass x1.5 (owner request: "increase everything by 50%").
// hpMult/interval/pool are UNCHANGED — this is a pure count/scale increase,
// not a toughness or spawn-rate change.
// VS-style scaling: HP doubles between minute 2→4 and again 5→7 and 7→9.
// Contact damage and speed scale with HP so the horde hits harder AND faster
// late-game — standing still at minute 5+ should be lethal without a build.
export const STAGE_1_WAVES: Wave[] = [
  {
    minute: 0,
    minAlive: 40,
    interval: 0.55,
    hpMult: 0.5,
    dmgMult: 0.5,
    speedMult: 0.85,
    pool: [{ type: EnemyType.VIRUS, weight: 100 }],
  },
  {
    minute: 1,
    minAlive: 80,
    interval: 0.5,
    hpMult: 0.65,
    dmgMult: 0.6,
    speedMult: 0.9,
    pool: [
      { type: EnemyType.VIRUS, weight: 70 },
      { type: EnemyType.GLITCH, weight: 35 },
    ],
  },
  {
    minute: 2,
    minAlive: 110,
    interval: 0.45,
    hpMult: 0.85,
    dmgMult: 0.75,
    speedMult: 0.95,
    pool: [
      { type: EnemyType.VIRUS, weight: 60 },
      { type: EnemyType.GLITCH, weight: 50 },
    ],
  },
  {
    minute: 3,
    minAlive: 200,
    interval: 0.4,
    hpMult: 1.2,
    dmgMult: 1.0,
    speedMult: 1.0,
    pool: [
      { type: EnemyType.VIRUS, weight: 50 },
      { type: EnemyType.GLITCH, weight: 55 },
      { type: EnemyType.FIREWALL, weight: 8 },
      { type: EnemyType.SPITTER, weight: 6 },
    ],
  },
  {
    minute: 4,
    minAlive: 300,
    interval: 0.35,
    hpMult: 1.7,
    dmgMult: 1.3,
    speedMult: 1.05,
    pool: [
      { type: EnemyType.VIRUS, weight: 45 },
      { type: EnemyType.GLITCH, weight: 60 },
      { type: EnemyType.FIREWALL, weight: 10 },
      { type: EnemyType.SPITTER, weight: 6 },
    ],
  },
  {
    minute: 5,
    minAlive: 400,
    interval: 0.3,
    hpMult: 2.5,
    dmgMult: 1.7,
    speedMult: 1.1,
    pool: [
      { type: EnemyType.VIRUS, weight: 40 },
      { type: EnemyType.GLITCH, weight: 65 },
      { type: EnemyType.FIREWALL, weight: 12 },
      { type: EnemyType.SPITTER, weight: 6 },
      { type: EnemyType.STALKER, weight: 5 },
    ],
  },
  {
    minute: 6,
    minAlive: 500,
    interval: 0.25,
    hpMult: 3.5,
    dmgMult: 2.2,
    speedMult: 1.15,
    pool: [
      { type: EnemyType.VIRUS, weight: 35 },
      { type: EnemyType.GLITCH, weight: 70 },
      { type: EnemyType.FIREWALL, weight: 14 },
      { type: EnemyType.SPITTER, weight: 6 },
      { type: EnemyType.STALKER, weight: 5 },
    ],
  },
  {
    minute: 7,
    minAlive: 620,
    interval: 0.22,
    hpMult: 5.0,
    dmgMult: 2.8,
    speedMult: 1.2,
    pool: [
      { type: EnemyType.VIRUS, weight: 30 },
      { type: EnemyType.GLITCH, weight: 70 },
      { type: EnemyType.FIREWALL, weight: 16 },
      { type: EnemyType.SPITTER, weight: 6 },
      { type: EnemyType.STALKER, weight: 5 },
    ],
  },
  {
    minute: 8,
    minAlive: 720,
    interval: 0.18,
    hpMult: 7.0,
    dmgMult: 3.5,
    speedMult: 1.25,
    pool: [
      { type: EnemyType.VIRUS, weight: 25 },
      { type: EnemyType.GLITCH, weight: 70 },
      { type: EnemyType.FIREWALL, weight: 18 },
      { type: EnemyType.SPITTER, weight: 6 },
      { type: EnemyType.STALKER, weight: 5 },
    ],
  },
  {
    minute: 9,
    minAlive: 820,
    interval: 0.14,
    hpMult: 10.0,
    dmgMult: 4.5,
    speedMult: 1.3,
    pool: [
      { type: EnemyType.VIRUS, weight: 20 },
      { type: EnemyType.GLITCH, weight: 70 },
      { type: EnemyType.FIREWALL, weight: 20 },
      { type: EnemyType.SPITTER, weight: 6 },
      { type: EnemyType.STALKER, weight: 5 },
    ],
  },
];

// Endless mode: the last wave keeps growing past 10:00
export const ENDLESS_GROWTH = {
  minAlivePerMinute: 60,
  minAliveCap: 950,
  hpMultPerMinute: 0.35,
  intervalFloor: 0.2,
};

// --- SCRIPTED SWARMS (every minute at :30, alternating trap shapes) ---
// Rings are the VS flower trap: a perfect closing circle you must break
// through. Lines are walls that sweep across the approach lane.
// Counts x1.5 (owner request). hpMult/speedMult untouched — swarms stay
// exactly as brittle/fast as before, there are just 50% more bodies in them.
export const STAGE_1_SWARMS: SwarmEvent[] = [
  { at: 60, kind: 'ring', type: EnemyType.VIRUS, count: 80, hpMult: 0.5, speedMult: 1.5 },
  { at: 90, kind: 'line', type: EnemyType.GLITCH, count: 65, hpMult: 0.5, speedMult: 1.4 },
  { at: 120, kind: 'ring', type: EnemyType.VIRUS, count: 120, hpMult: 0.5, speedMult: 1.5 },
  { at: 150, kind: 'line', type: EnemyType.GLITCH, count: 90, hpMult: 0.5, speedMult: 1.4 },
  { at: 180, kind: 'ring', type: EnemyType.VIRUS, count: 160, hpMult: 0.5, speedMult: 1.5 },
  { at: 210, kind: 'line', type: EnemyType.GLITCH, count: 120, hpMult: 0.5, speedMult: 1.4 },
  { at: 240, kind: 'ring', type: EnemyType.VIRUS, count: 200, hpMult: 0.5, speedMult: 1.5 },
  { at: 270, kind: 'line', type: EnemyType.GLITCH, count: 150, hpMult: 0.5, speedMult: 1.4 },
  { at: 300, kind: 'ring', type: EnemyType.VIRUS, count: 240, hpMult: 0.5, speedMult: 1.5 },
  { at: 330, kind: 'line', type: EnemyType.GLITCH, count: 180, hpMult: 0.5, speedMult: 1.4 },
  { at: 360, kind: 'ring', type: EnemyType.VIRUS, count: 280, hpMult: 0.5, speedMult: 1.5 },
  { at: 390, kind: 'line', type: EnemyType.GLITCH, count: 210, hpMult: 0.5, speedMult: 1.4 },
  { at: 420, kind: 'ring', type: EnemyType.VIRUS, count: 320, hpMult: 0.5, speedMult: 1.5 },
  { at: 450, kind: 'line', type: EnemyType.GLITCH, count: 240, hpMult: 0.5, speedMult: 1.4 },
  { at: 480, kind: 'ring', type: EnemyType.VIRUS, count: 360, hpMult: 0.5, speedMult: 1.5 },
  { at: 510, kind: 'line', type: EnemyType.GLITCH, count: 270, hpMult: 0.5, speedMult: 1.4 },
  { at: 540, kind: 'ring', type: EnemyType.VIRUS, count: 400, hpMult: 0.5, speedMult: 1.5 },
  { at: 570, kind: 'line', type: EnemyType.GLITCH, count: 300, hpMult: 0.5, speedMult: 1.4 },
];

// Endless: keep the ring traps coming every 60s after the authored list ends
export const ENDLESS_SWARM = {
  interval: 45,
  base: { kind: 'ring' as const, type: EnemyType.VIRUS, hpMult: 0.5, speedMult: 1.5 },
  count: 200,
  countPerMinute: 12,
  countCap: 450,
};

// --- ELITE SCHEDULE (chest bearers + minibosses) ---
export const STAGE_1_ELITES: EliteEvent[] = [
  { at: 90, type: EnemyType.ENFORCER, count: 1 },
  { at: 120, type: EnemyType.WARDEN, count: 1 },
  { at: 150, type: EnemyType.ENFORCER, count: 2 },
  { at: 180, type: EnemyType.HYDRA, count: 1, announce: 'PROXY HYDRA ONLINE' },
  { at: 210, type: EnemyType.COLOSSUS, count: 1 },
  { at: 240, type: EnemyType.WARDEN, count: 2 },
  { at: 270, type: EnemyType.ENFORCER, count: 2 },
  { at: 300, type: EnemyType.HYDRA, count: 1, announce: 'PROXY HYDRA ONLINE' },
  { at: 305, type: EnemyType.WEAVER, count: 1 },
  { at: 330, type: EnemyType.COLOSSUS, count: 2 },
  { at: 360, type: EnemyType.WARDEN, count: 3 },
  { at: 390, type: EnemyType.ENFORCER, count: 3 },
  { at: 395, type: EnemyType.WEAVER, count: 1 },
  { at: 420, type: EnemyType.HYDRA, count: 2, announce: 'PROXY HYDRA ONLINE' },
  { at: 450, type: EnemyType.COLOSSUS, count: 2 },
  { at: 480, type: EnemyType.WARDEN, count: 3 },
  { at: 485, type: EnemyType.WEAVER, count: 2 },
  { at: 510, type: EnemyType.ENFORCER, count: 4 },
  { at: 540, type: EnemyType.HYDRA, count: 2, announce: 'PROXY HYDRA ONLINE' },
];

// Endless: an elite pack every 45s, cycling types
export const ENDLESS_ELITES = {
  interval: 25,
  rotation: [
    EnemyType.ENFORCER,
    EnemyType.WARDEN,
    EnemyType.COLOSSUS,
    EnemyType.HYDRA,
    EnemyType.WEAVER,
  ],
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
