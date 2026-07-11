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
import { uiState, announce } from '../core/UIState.svelte.ts';
import { partySpawnMultiplier } from '../core/difficulty';
import * as THREE from 'three';

// --- CONFIGURATION ---
const MAX_ENEMIES = 300; // proven at 60fps with the full map running
// Deficit refills spread across ticks: 20 spawns/tick (~57/s at the fastest
// wave) refills a screen-wipe in ~2s without the spawn burst dropping frames
// (each spawn builds a Group + Rapier body — 45/tick visibly hitched).
const MAX_FILL_PER_TICK = 20;
const INNER_SPAWN_RADIUS = 18; // just outside the visible screen
const OUTER_SPAWN_RADIUS = 26;
const RING_RADIUS = 21; // flower-trap rings close from screen edge
const STAGE_END = 600; // FinaleBoss owns 10:00

// --- STATE ---
let gameTime = 0;
let tickTimer = 0;
let swarmIdx = 0;
let eliteIdx = 0;
let nextEndlessSwarmAt = STAGE_END + 30;
let nextEndlessEliteAt = STAGE_END + 15;
let endlessEliteRotation = 0;

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
export function TimelineSpawnerSystem(dt: number, scene: THREE.Scene): void {
  const players = Array.from(world.with('isPlayer', 'position'));
  if (players.length === 0) return;
  const player = players[Math.floor(Math.random() * players.length)];

  gameTime += dt;

  // Pressure knobs (VS: Curse raises spawn frequency + quantity; Hyper raises
  // the minimum amount). Corruption is the player's chosen bet; curse comes
  // from characters/passives; co-op scales with living fighters.
  const corruptionMult = 1 + uiState.corruption * 0.2;
  const curseMult = (player as { stats?: { curse?: number } }).stats?.curse ?? 1.0;
  const partyMult = partySpawnMultiplier();
  const pressure = corruptionMult * curseMult * partyMult;

  // Resolve the current wave (endless mode extends the last authored wave)
  const wave = getWave(Math.min(gameTime, STAGE_END - 1));
  let minAlive = wave.minAlive;
  let interval = wave.interval;
  let hpMult = wave.hpMult;
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

  // Scripted swarms + elites run on their own clocks
  fireScriptedEvents(scene, player.position, hpMult);

  // Wave tick
  tickTimer -= dt;
  if (tickTimer > 0) return;
  tickTimer = interval;

  const alive = world.count('isEnemy');
  if (alive >= MAX_ENEMIES) return;

  if (alive < minAlive) {
    // THE VS RULE: the quota is a floor. Fill the deficit now.
    const deficit = Math.min(minAlive - alive, MAX_FILL_PER_TICK, MAX_ENEMIES - alive);
    for (let i = 0; i < deficit; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = INNER_SPAWN_RADIUS + Math.random() * (OUTER_SPAWN_RADIUS - INNER_SPAWN_RADIUS);
      spawnEnemy(
        scene,
        player.position.x + Math.cos(angle) * dist,
        player.position.z + Math.sin(angle) * dist,
        pickFromPool(wave.pool),
        hpMult,
      );
    }
  } else {
    // At quota: one of each pool type per tick keeps pressure creeping up
    for (const entry of wave.pool) {
      if (world.count('isEnemy') >= MAX_ENEMIES) break;
      const angle = Math.random() * Math.PI * 2;
      const dist = INNER_SPAWN_RADIUS + Math.random() * (OUTER_SPAWN_RADIUS - INNER_SPAWN_RADIUS);
      spawnEnemy(
        scene,
        player.position.x + Math.cos(angle) * dist,
        player.position.z + Math.sin(angle) * dist,
        entry.type,
        hpMult,
      );
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

/** Flower-trap ring (perfect closing circle) or line wall. */
function spawnSwarm(
  scene: THREE.Scene,
  playerPos: THREE.Vector3,
  kind: 'ring' | 'line',
  type: EnemyType,
  count: number,
  hpMult: number,
  speedMult: number,
): void {
  const room = MAX_ENEMIES + 40 - world.count('isEnemy'); // swarms may briefly exceed the cap
  const n = Math.min(count, Math.max(0, room));
  if (n <= 0) return;

  if (kind === 'ring') {
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      const e = spawnEnemy(
        scene,
        playerPos.x + Math.cos(angle) * RING_RADIUS,
        playerPos.z + Math.sin(angle) * RING_RADIUS,
        type,
        hpMult,
      );
      e.moveSpeed = (e.moveSpeed ?? 1) * speedMult;
    }
  } else {
    // Line wall sweeping in from a random side
    const centerAngle = Math.random() * Math.PI * 2;
    const perp = centerAngle + Math.PI / 2;
    const dist = OUTER_SPAWN_RADIUS;
    for (let i = 0; i < n; i++) {
      const offset = (i - (n - 1) / 2) * 1.6;
      const e = spawnEnemy(
        scene,
        playerPos.x + Math.cos(centerAngle) * dist + Math.cos(perp) * offset,
        playerPos.z + Math.sin(centerAngle) * dist + Math.sin(perp) * offset,
        type,
        hpMult,
      );
      e.moveSpeed = (e.moveSpeed ?? 1) * speedMult;
    }
  }
}

/** Elites arrive as a loose pincer so they read as an event, not noise. */
function spawnElitePack(
  scene: THREE.Scene,
  playerPos: THREE.Vector3,
  type: EnemyType,
  count: number,
  hpMult: number,
): void {
  const baseAngle = Math.random() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const angle = baseAngle + (i - (count - 1) / 2) * 0.8;
    spawnEnemy(
      scene,
      playerPos.x + Math.cos(angle) * (OUTER_SPAWN_RADIUS - 3),
      playerPos.z + Math.sin(angle) * (OUTER_SPAWN_RADIUS - 3),
      type,
      hpMult,
    );
  }
}

// --- DEBUG ---
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
