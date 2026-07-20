/**
 * BalanceHarness (Phase 1.98) — measurement instead of guesswork.
 *
 * Debug-only (?debug): a scripted bot player plus a metrics sampler so
 * balance changes are judged against numbers, not feel. Exposed as
 * window.__balance:
 *
 *   bot('kite' | 'still' | 'off')  — kite = flee the horde's local center of
 *                                    mass with tangential drift (a fair proxy
 *                                    for human play); still = tank everything
 *   grantBuild('mid' | 'late')     — representative weapon loadouts
 *   start() / stop() / report()    — 1 Hz sampling of alive-vs-quota, kills,
 *                                    player HP, level, fps
 *
 * The key derived metric is SATURATION: the fraction of samples where the
 * living horde sits at/above the wave quota. If the player's DPS keeps the
 * horde permanently below quota, weapons out-clear the spawner and the game
 * is too easy; the goldilocks band is a power fantasy early (low saturation)
 * that loses the race from mid-game on (high saturation).
 */

import * as THREE from 'three';
import { world } from './world';
import { uiState } from './UIState.svelte.ts';
import { updateVirtualJoystick, resetVirtualJoystick } from '../systems/InputSystem';
import { debugGrantWeapon, upgradeRandomOwnedWeapon } from '../systems/UpgradeSystem';
import { getSpawnerDebugInfo } from '../systems/TimelineSpawner';
import { spawnEnemy, EnemyType } from './factories';

/**
 * Synchronous spawn-cost microbench (no render loop needed). Times a burst of
 * real spawns the way the deficit-fill does, then cleans up. Returns total
 * and per-spawn ms so we can see the batch spike source directly.
 */
function benchSpawn(n = 28): object {
  const scene = world.with('isLocalPlayer', 'transform').first?.transform?.parent as
    | THREE.Scene
    | undefined;
  if (!scene) return { error: 'no scene' };
  const created: ReturnType<typeof spawnEnemy>[] = [];
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    created.push(spawnEnemy(scene, Math.cos(a) * 500, Math.sin(a) * 500, EnemyType.VIRUS));
  }
  const total = performance.now() - t0;
  // cleanup so the bench doesn't perturb the run
  for (const e of created) {
    if (e.transform?.parent) e.transform.parent.remove(e.transform);
    world.remove(e);
  }
  return { n, totalMs: +total.toFixed(2), perSpawnMs: +(total / n).toFixed(3) };
}

type BotMode = 'off' | 'kite' | 'still';

interface Sample {
  t: number;
  alive: number;
  quota: number;
  kills: number;
  hp: number;
  level: number;
  fps: number;
}

let botMode: BotMode = 'off';
let rafId = 0;
let sampleTimer: ReturnType<typeof setInterval> | null = null;
let samples: Sample[] = [];

function botTick(): void {
  rafId = requestAnimationFrame(botTick);
  if (botMode !== 'kite') return;

  const player = world.with('isLocalPlayer', 'position').first;
  if (!player) return;

  // Local horde center of mass (within ~20u)
  let cx = 0;
  let cz = 0;
  let n = 0;
  for (const e of world.with('isEnemy', 'position')) {
    const dx = e.position.x - player.position.x;
    const dz = e.position.z - player.position.z;
    if (dx * dx + dz * dz < 400) {
      cx += dx;
      cz += dz;
      n++;
    }
  }

  if (n === 0) {
    // Nothing near: drift in a slow circle so spawns keep finding us
    const a = performance.now() / 2400;
    updateVirtualJoystick(Math.cos(a), Math.sin(a), false);
    return;
  }

  // Flee the center of mass, blended with a tangent so the bot orbits the
  // blob the way a human kiter strafes around it
  const len = Math.hypot(cx, cz) || 1;
  const fleeX = -cx / len;
  const fleeZ = -cz / len;
  const ix = fleeX - fleeZ * 0.65;
  const iz = fleeZ + fleeX * 0.65;
  const il = Math.hypot(ix, iz) || 1;
  updateVirtualJoystick(ix / il, iz / il, false);
}

function bot(mode: BotMode): string {
  botMode = mode;
  if (mode === 'off' || mode === 'still') resetVirtualJoystick();
  return `bot: ${mode}`;
}

function grantBuild(tier: 'mid' | 'late'): string {
  const extraWeapons =
    tier === 'mid'
      ? ['monowire_lash', 'emp_pulse_node']
      : ['monowire_lash', 'emp_pulse_node', 'smart_rail_needles'];
  for (const id of extraWeapons) debugGrantWeapon(id);
  const levels = tier === 'mid' ? 8 : 20;
  const granted: string[] = [];
  for (let i = 0; i < levels; i++) {
    const name = upgradeRandomOwnedWeapon();
    if (name) granted.push(name);
  }
  return `${tier} build: +${extraWeapons.length} weapons, +${granted.length} levels`;
}

function start(): string {
  samples = [];
  if (sampleTimer) clearInterval(sampleTimer);
  sampleTimer = setInterval(() => {
    const player = world.with('isLocalPlayer', 'health', 'level').first;
    const info = getSpawnerDebugInfo();
    samples.push({
      t: Math.round(uiState.gameTime),
      alive: info.alive,
      quota: Math.round(info.minAlive),
      kills: uiState.kills,
      hp: player?.health ? Math.round(player.health.current) : -1,
      level: player?.level ?? -1,
      fps: uiState.fps,
    });
  }, 1000);
  return 'sampling at 1 Hz';
}

function stop(): void {
  if (sampleTimer) clearInterval(sampleTimer);
  sampleTimer = null;
}

function report(): object {
  if (samples.length < 3) return { error: 'not enough samples', samples };
  const first = samples[0];
  const last = samples[samples.length - 1];
  const spanMin = Math.max(1e-6, (last.t - first.t) / 60);
  const atQuota = samples.filter((s) => s.quota > 0 && s.alive >= s.quota * 0.95).length;
  return {
    windowSec: last.t - first.t,
    killsPerMin: Math.round((last.kills - first.kills) / spanMin),
    saturation: +(atQuota / samples.length).toFixed(2),
    aliveSeries: samples.map((s) => s.alive).join(','),
    quotaNow: last.quota,
    hpSeries: samples.map((s) => s.hp).join(','),
    minHp: Math.min(...samples.map((s) => s.hp)),
    levelNow: last.level,
    avgFps: Math.round(samples.reduce((a, s) => a + s.fps, 0) / samples.length),
    minFps: Math.min(...samples.map((s) => s.fps)),
  };
}

export function initBalanceHarness(): void {
  if (rafId) return;
  rafId = requestAnimationFrame(botTick);
  (window as unknown as { __balance: object }).__balance = {
    bot,
    grantBuild,
    start,
    stop,
    report,
    benchSpawn,
  };
}
