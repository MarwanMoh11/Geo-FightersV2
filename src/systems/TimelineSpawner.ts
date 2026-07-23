/**
 * TimelineSpawner — Vampire Survivors quota engine (Phase 1.97 HORDE)
 *
 * The VS loop, ported exactly:
 *   1. Every wave tick, count the living horde.
 *   2. Below the wave's minimum-alive quota → fill the deficit IMMEDIATELY
 *      from the wave pool. Killing fast never empties the screen; it makes
 *      the game feed you more. (Far enemies despawn in EnemySystem and get
 *      recycled here next tick — VS's reposition behavior for free.)
 *   3. At/above quota → still spawn one of each pool type, so pressure
 *      trickles upward between waves.
 *   4. Scripted swarms (closing rings, line walls) and a fixed elite
 *      schedule fire on their own clocks.
 *
 * Corruption, curse, co-op party size and endless mode scale the quota and
 * tick rate — the same knobs VS's Curse and Hyper Mode turn.
 */

import { world } from '../core/world';
import { spawnEnemy, EnemyType } from '../core/factories';
import {
  getWave,
  pickFromPool,
  STAGE_1_SWARMS,
  STAGE_1_ELITES,
  ENDLESS_GROWTH,
  ENDLESS_SWARM,
  ENDLESS_ELITES,
} from '../core/SpawnTimeline';
import { getCurrentLevel } from '../core/LevelData';
import { getViewExtents } from './CameraSystem';
import { uiState, announce } from '../core/UIState.svelte.ts';
import { partySpawnMultiplier } from '../core/difficulty';
import { corruptionDensity } from '../core/corruption';
import * as THREE from 'three';

// --- CONFIGURATION ---
// THE PIT: 600 (was 400, owner requested +50% across the board). The arena
// renders in ~30 static draw calls (vs ~120 in the old slums) and the P1.98
// pass held 330-340 alive at 60fps on the heavier map, so there was headroom
// to spend on the horde. FPS-VERIFY THIS CAP LIVE before shipping — if a
// low-end device dips at min 8-9, the fallback lever is lowering this and
// raising wave hpMult in SpawnTimeline.ts instead.
const MAX_ENEMIES = 2500;
const MAX_FILL_PER_TICK = 120;
const STAGE_END = 600; // FinaleBoss owns 10:00

const _spawnerPlayers: any[] = [];

// --- VAMPIRE-SURVIVORS EDGE SPAWNING ---
// Enemies materialize just OUTSIDE the visible screen, all around the player,
// and immediately close in — the VS density feel. The camera publishes its live
// on-screen half-extents; we drop the horde on the ellipse just past that edge
// so it's always near you and on-screen within a step, never scattered across a
// far corner of the arena where it reads as empty.
const SPAWN_MARGIN = 4; // units just past the visible edge (off-screen, but close)

function clampToArena(v: number, half: number): number {
  const lim = half - 2; // keep off the walls
  return v < -lim ? -lim : v > lim ? lim : v;
}

/**
 * A point just outside the visible screen rectangle, around the player.
 * When a heading is given (the player's velocity), ~55% of spawns bias into it
 * (arc ±70°) so the screen you're running toward stays thick — you run INTO the
 * horde — while the rest surround from all sides.
 */
export function edgeSpawnPos(
  px: number,
  pz: number,
  biasX = 0,
  biasZ = 0,
): { x: number; z: number } {
  const { halfX, halfZ } = getViewExtents();
  const rx = halfX + SPAWN_MARGIN;
  const rz = halfZ + SPAWN_MARGIN;
  let ang = Math.random() * Math.PI * 2;
  if (Math.hypot(biasX, biasZ) > 0.05 && Math.random() < 0.55) {
    ang = Math.atan2(biasZ, biasX) + (Math.random() - 0.5) * (Math.PI * 0.78);
  }
  const level = getCurrentLevel();
  return {
    x: clampToArena(px + Math.cos(ang) * rx, level.mapWidth / 2),
    z: clampToArena(pz + Math.sin(ang) * rz, level.mapHeight / 2),
  };
}

/** Spawn one enemy just off-screen, biased into the player's heading. */
function spawnAtEdge(
  scene: THREE.Scene,
  player: { position: THREE.Vector3; velocity?: THREE.Vector3 },
  type: EnemyType,
  hpMult: number,
  speedMult: number = 1,
): ReturnType<typeof spawnEnemy> {
  const v = player.velocity;
  const p = edgeSpawnPos(player.position.x, player.position.z, v?.x ?? 0, v?.z ?? 0);
  return spawnEnemy(scene, p.x, p.z, type, hpMult, speedMult);
}

// --- STATE ---
let gameTime = 0;
let tickTimer = 0;
let swarmIdx = 0;
let eliteIdx = 0;
let nextEndlessSwarmAt = STAGE_END + 30;
let nextEndlessEliteAt = STAGE_END + 15;
let endlessEliteRotation = 0;

/**
 * Reset all spawner state for a fresh run.
 */
export function resetTimelineSpawner(): void {
  gameTime = 0;
  tickTimer = 0;
  swarmIdx = 0;
  eliteIdx = 0;
  nextEndlessSwarmAt = STAGE_END + 30;
  nextEndlessEliteAt = STAGE_END + 15;
  endlessEliteRotation = 0;
}

// --- MAIN SYSTEM ---
/**
 * Main spawner tick: fills the horde to the current wave's quota, fires scripted
 * swarms and elite schedules, and scales difficulty over time.
 *
 * @param {number} dt - delta time since last frame in seconds
 * @param {THREE.Scene} scene - the Three.js scene to spawn enemies into
 * @returns {void}
 */
export function TimelineSpawnerSystem(dt: number, scene: THREE.Scene): void {
  _spawnerPlayers.length = 0;
  for (const p of world.with('isPlayer', 'position')) _spawnerPlayers.push(p);
  if (_spawnerPlayers.length === 0) return;
  const player = _spawnerPlayers[Math.floor(Math.random() * _spawnerPlayers.length)];

  gameTime += dt;

  const isMaxMode = !!(window as any).__MAX_MODE;
  let minAlive: number;
  let interval: number;
  let hpMult: number;
  // Guard against TS "used before assigned" in the fill tick below (wave is
  // only assigned in the non-max branch, but never accessed in the max branch).
  const wave = getWave(Math.min(gameTime, STAGE_END - 1));
  if (isMaxMode) {
    // ?max stress-test: saturate the arena at MAX_ENEMIES immediately.
    minAlive = MAX_ENEMIES - 10;
    interval = 0.05;
    hpMult = 15.0;
  } else {
    const corruptionMult = corruptionDensity(uiState.corruption);
    const curseMult = (player as { stats?: { curse?: number } }).stats?.curse ?? 1.0;
    const partyMult = partySpawnMultiplier();
    const pressure = corruptionMult * curseMult * partyMult;

    const wave = getWave(Math.min(gameTime, STAGE_END - 1));
    minAlive = wave.minAlive;
    interval = wave.interval;
    hpMult = wave.hpMult;
    if (uiState.endlessMode && gameTime > STAGE_END) {
      const extraMin = (gameTime - STAGE_END) / 60;
      minAlive = Math.min(
        ENDLESS_GROWTH.minAliveCap,
        minAlive + extraMin * ENDLESS_GROWTH.minAlivePerMinute,
      );
      hpMult += extraMin * ENDLESS_GROWTH.hpMultPerMinute;
      interval = Math.max(ENDLESS_GROWTH.intervalFloor, interval - extraMin * 0.02);
    }
    minAlive = Math.min(MAX_ENEMIES - 20, Math.round(minAlive * pressure));
    interval = interval / Math.max(1, (pressure - 1) * 0.5 + 1);
  }

  if (!isMaxMode) {
    // Scripted swarms + elites run on their own clocks (skipped in max mode)
    fireScriptedEvents(scene, player.position, hpMult);
  }

  // Wave tick
  tickTimer -= dt;
  if (tickTimer > 0) return;
  tickTimer = interval;

  const alive = world.count('isEnemy');
  if (alive >= MAX_ENEMIES) return;

  if (alive < minAlive) {
    // THE VS RULE: the quota is a floor. Fill the deficit now — dropped just
    // off-screen all around the player so the horde is instantly ON you, not
    // trickling in from a far wall.
    const spd = isMaxMode ? 1 : wave.speedMult;
    const deficit = Math.min(minAlive - alive, MAX_FILL_PER_TICK, MAX_ENEMIES - alive);
    for (let i = 0; i < deficit; i++) {
      const type = isMaxMode
        ? ([EnemyType.VIRUS, EnemyType.GLITCH, EnemyType.VIRUS, EnemyType.FIREWALL][
            Math.floor(Math.random() * 4)
          ] as EnemyType)
        : pickFromPool(wave.pool);
      spawnAtEdge(scene, player, type, hpMult, spd);
    }
  } else {
    // At quota: one of each pool type per tick keeps pressure creeping up
    const spd = isMaxMode ? 1 : wave.speedMult;
    for (const entry of (wave ?? { pool: [{ type: EnemyType.VIRUS, weight: 100 }] }).pool) {
      if (world.count('isEnemy') >= MAX_ENEMIES) break;
      spawnAtEdge(scene, player, entry.type, hpMult, spd);
    }
  }
}

// --- SCRIPTED EVENTS ---

function fireScriptedEvents(scene: THREE.Scene, playerPos: THREE.Vector3, waveHp: number): void {
  // Authored swarm list
  while (swarmIdx < STAGE_1_SWARMS.length && gameTime >= STAGE_1_SWARMS[swarmIdx].at) {
    const s = STAGE_1_SWARMS[swarmIdx++];
    spawnSwarm(scene, playerPos, s.kind, s.type, s.count, waveHp * s.hpMult, s.speedMult);
  }
  // Authored elite list
  while (eliteIdx < STAGE_1_ELITES.length && gameTime >= STAGE_1_ELITES[eliteIdx].at) {
    const e = STAGE_1_ELITES[eliteIdx++];
    spawnElitePack(scene, playerPos, e.type, e.count, waveHp);
    if (e.announce) announce(e.announce);
  }

  // Endless continuations
  if (!uiState.endlessMode || gameTime <= STAGE_END) return;
  if (gameTime >= nextEndlessSwarmAt) {
    nextEndlessSwarmAt += ENDLESS_SWARM.interval;
    const extraMin = (gameTime - STAGE_END) / 60;
    const count = Math.min(
      ENDLESS_SWARM.countCap,
      Math.round(ENDLESS_SWARM.count + extraMin * ENDLESS_SWARM.countPerMinute),
    );
    const b = ENDLESS_SWARM.base;
    spawnSwarm(scene, playerPos, b.kind, b.type, count, waveHp * b.hpMult, b.speedMult);
  }
  if (gameTime >= nextEndlessEliteAt) {
    nextEndlessEliteAt += ENDLESS_ELITES.interval;
    const type = ENDLESS_ELITES.rotation[endlessEliteRotation++ % ENDLESS_ELITES.rotation.length];
    spawnElitePack(scene, playerPos, type, 1, waveHp);
  }
}

/**
 * Screen-relative swarms (VS):
 *   ring → THE HORDE CLOSES IN — a full circle of enemies drops evenly on the
 *          screen edge and squeezes inward from every direction at once.
 *   line → WALL OF STEEL — a solid picket spans one screen edge and marches
 *          across the view.
 */
function spawnSwarm(
  scene: THREE.Scene,
  playerPos: THREE.Vector3,
  kind: 'ring' | 'line',
  type: EnemyType,
  count: number,
  hpMult: number,
  speedMult: number,
): void {
  const room = MAX_ENEMIES + 150 - world.count('isEnemy'); // swarms may briefly exceed the cap
  const n = Math.min(count, Math.max(0, room));
  if (n <= 0) return;

  const { halfX, halfZ } = getViewExtents();
  const rx = halfX + SPAWN_MARGIN;
  const rz = halfZ + SPAWN_MARGIN;
  const level = getCurrentLevel();
  const halfW = level.mapWidth / 2;
  const halfH = level.mapHeight / 2;

  if (kind === 'ring') {
    announce('THE HORDE CLOSES IN');
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const e = spawnEnemy(
        scene,
        clampToArena(playerPos.x + Math.cos(ang) * rx, halfW),
        clampToArena(playerPos.z + Math.sin(ang) * rz, halfH),
        type,
        hpMult,
      );
      e.moveSpeed = (e.moveSpeed ?? 1) * speedMult;
    }
  } else {
    // A picket spanning the top OR bottom screen edge, sweeping across the view.
    const side = Math.random() < 0.5 ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const t = n <= 1 ? 0.5 : i / (n - 1);
      const e = spawnEnemy(
        scene,
        clampToArena(playerPos.x + (t - 0.5) * 2 * rx, halfW),
        clampToArena(playerPos.z + side * rz, halfH),
        type,
        hpMult,
      );
      e.moveSpeed = (e.moveSpeed ?? 1) * speedMult;
    }
  }
}

/** Elites stride in from just off-screen — an announced arrival at your edge. */
function spawnElitePack(
  scene: THREE.Scene,
  playerPos: THREE.Vector3,
  type: EnemyType,
  count: number,
  hpMult: number,
): void {
  for (let i = 0; i < count; i++) {
    const p = edgeSpawnPos(playerPos.x, playerPos.z);
    spawnEnemy(scene, p.x, p.z, type, hpMult);
  }
}

// --- DEBUG ---
/**
 * Return the current spawner debug info for the ?debug console.
 *
 * @returns {{ gameTime: number; minAlive: number; alive: number }} spawner state snapshot
 */
export function getSpawnerDebugInfo(): { gameTime: number; minAlive: number; alive: number } {
  const wave = getWave(Math.min(gameTime, STAGE_END - 1));
  return { gameTime, minAlive: wave.minAlive, alive: world.count('isEnemy') };
}

/** Debug (?debug console): jump the wave clock without replaying every
 *  scripted event in one burst. */
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) {
  (window as unknown as { __spawner: object }).__spawner = {
    info: getSpawnerDebugInfo,
    setTime: (t: number) => {
      gameTime = t;
      while (swarmIdx < STAGE_1_SWARMS.length && STAGE_1_SWARMS[swarmIdx].at < t) swarmIdx++;
      while (eliteIdx < STAGE_1_ELITES.length && STAGE_1_ELITES[eliteIdx].at < t) eliteIdx++;
    },
  };
}
