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
import { PIT_GATES, type ArenaGate } from '../core/LevelData';
import { pulseGate } from './LevelSystem';
import { uiState, announce } from '../core/UIState.svelte.ts';
import { partySpawnMultiplier } from '../core/difficulty';
import * as THREE from 'three';

// --- CONFIGURATION ---
// THE PIT: 600 (was 400, owner requested +50% across the board). The arena
// renders in ~30 static draw calls (vs ~120 in the old slums) and the P1.98
// pass held 330-340 alive at 60fps on the heavier map, so there was headroom
// to spend on the horde. FPS-VERIFY THIS CAP LIVE before shipping — if a
// low-end device dips at min 8-9, the fallback lever is lowering this and
// raising wave hpMult in SpawnTimeline.ts instead.
const MAX_ENEMIES = 600;
// Deficit refills spread across ticks (was 28/tick ~57/s @ fastest wave;
// scaled +50% to keep pace with the larger quotas). 45/tick was measured to
// visibly hitch (each spawn builds a Group + Rapier body) — 42 stays under
// that ceiling with headroom.
const MAX_FILL_PER_TICK = 42;
const STAGE_END = 600; // FinaleBoss owns 10:00

// --- THE PIT: GATE SPAWNING ---
// Enemies enter through the arena's eight wall gates (Isaac doors, cyberpunk
// skin) instead of materializing offscreen. Each spawn pulses its gate's
// telegraph so density reads as an INVASION pouring in, not soup appearing.

/** A spawn position just inside a gate, jittered across its opening. */
function gateSpawnPos(gate: ArenaGate): { x: number; z: number } {
  const lateral = (Math.random() - 0.5) * (gate.width - 2);
  const inward = 1.5 + Math.random() * 4;
  // Lateral axis is perpendicular to the inward normal
  return {
    x: gate.x + gate.nx * inward + gate.nz * lateral,
    z: gate.z + gate.nz * inward + gate.nx * lateral,
  };
}

/** Spawn one enemy through a gate (with telegraph pulse). */
function spawnThroughGate(
  scene: THREE.Scene,
  gateIdx: number,
  type: EnemyType,
  hpMult: number,
): ReturnType<typeof spawnEnemy> {
  const gate = PIT_GATES[gateIdx];
  const pos = gateSpawnPos(gate);
  pulseGate(gateIdx);
  return spawnEnemy(scene, pos.x, pos.z, type, hpMult);
}

/**
 * Ambient fills bias toward gates the player ISN'T camping: gates far from
 * the player get double weight, so pressure surrounds instead of feeding
 * into the player's guns at one door.
 */
function pickAmbientGate(playerPos: THREE.Vector3): number {
  const a = Math.floor(Math.random() * PIT_GATES.length);
  const b = Math.floor(Math.random() * PIT_GATES.length);
  const distSq = (g: ArenaGate) => {
    const dx = g.x - playerPos.x;
    const dz = g.z - playerPos.z;
    return dx * dx + dz * dz;
  };
  return distSq(PIT_GATES[a]) >= distSq(PIT_GATES[b]) ? a : b;
}

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
    // THE VS RULE: the quota is a floor. Fill the deficit now — poured
    // through the gates, spread so no single door clogs into a wall of HP.
    const deficit = Math.min(minAlive - alive, MAX_FILL_PER_TICK, MAX_ENEMIES - alive);
    for (let i = 0; i < deficit; i++) {
      spawnThroughGate(scene, pickAmbientGate(player.position), pickFromPool(wave.pool), hpMult);
    }
  } else {
    // At quota: one of each pool type per tick keeps pressure creeping up
    for (const entry of wave.pool) {
      if (world.count('isEnemy') >= MAX_ENEMIES) break;
      spawnThroughGate(scene, pickAmbientGate(player.position), entry.type, hpMult);
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
 * THE PIT swarms:
 *   ring → ALL GATES BREACH — every door floods at once; the closing circle
 *          becomes an eight-front invasion (announced, gates flare).
 *   line → WALL BREACH — one wall's full length flushes a picket of enemies
 *          that sweeps across the arena.
 */
function spawnSwarm(
  scene: THREE.Scene,
  _playerPos: THREE.Vector3,
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
    announce('BREACH — ALL GATES');
    for (let i = 0; i < n; i++) {
      const e = spawnThroughGate(scene, i % PIT_GATES.length, type, hpMult);
      e.moveSpeed = (e.moveSpeed ?? 1) * speedMult;
    }
  } else {
    // One wall flushes: enemies spread along its whole inner face
    const walls: ArenaGate['wall'][] = ['n', 's', 'e', 'w'];
    const wall = walls[Math.floor(Math.random() * walls.length)];
    const wallGates = PIT_GATES.filter((g) => g.wall === wall);
    const ref = wallGates[0];
    announce('WALL BREACH');
    wallGates.forEach((g) => pulseGate(PIT_GATES.indexOf(g)));
    for (let i = 0; i < n; i++) {
      // Spread across the wall length (±60 keeps clear of the corner vaults)
      const lateral = -60 + (i / Math.max(1, n - 1)) * 120;
      const inward = 1.5 + Math.random() * 3;
      const e = spawnEnemy(
        scene,
        ref.nx !== 0 ? ref.x + ref.nx * inward : lateral,
        ref.nz !== 0 ? ref.z + ref.nz * inward : lateral,
        type,
        hpMult,
      );
      e.moveSpeed = (e.moveSpeed ?? 1) * speedMult;
    }
  }
}

/** Elites stride in through a single gate — an announced arrival. */
function spawnElitePack(
  scene: THREE.Scene,
  playerPos: THREE.Vector3,
  type: EnemyType,
  count: number,
  hpMult: number,
): void {
  const gateIdx = pickAmbientGate(playerPos);
  for (let i = 0; i < count; i++) {
    spawnThroughGate(scene, gateIdx, type, hpMult);
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
