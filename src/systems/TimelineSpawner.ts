/**
 * TimelineSpawner - Vampire Survivors Style Timeline-Driven Spawn System
 *
 * Core mechanics:
 * 1. Timeline-based spawn tables (enemies exist only in time windows)
 * 2. Budget-based spawning (stronger enemies cost more)
 * 3. Weighted random selection from active pool
 * 4. Off-screen ring positioning
 * 5. Formation geometry (swarm, line, encircle, pincer)
 * 6. Hard enemy cap with "dam breaking" effect
 * 7. Non-linear difficulty scaling
 */

import { world } from '../core/world';
import { spawnEnemy, EnemyType } from '../core/factories';
import {
  STAGE_1_TIMELINE,
  ENEMY_SPAWN_COST,
  getActiveEntries,
  selectEntryByWeight,
} from '../core/SpawnTimeline';
import type { FormationType, SpawnEntry } from '../core/SpawnTimeline';
import * as THREE from 'three';

// --- CONFIGURATION ---
const CONFIG = {
  // Spawn timing
  SPAWN_CHECK_INTERVAL: 0.8, // seconds between spawn attempts

  // Budget scaling: budget(t) ≈ BASE + (t/60)^1.3 * SCALE
  BASE_BUDGET: 8,
  BUDGET_SCALE: 12,
  BUDGET_EXPONENT: 1.3,

  // Off-screen ring positioning
  INNER_SPAWN_RADIUS: 18, // minimum distance from player
  OUTER_SPAWN_RADIUS: 28, // maximum distance from player

  // Hard enemy cap
  MAX_ENEMIES: 300,

  // Difficulty multipliers (can be modified by curse/hyper mode later)
  CURSE_MULTIPLIER: 1.0,
  STAGE_MULTIPLIER: 1.0,
};

// --- STATE ---
let spawnTimer = 0;
let gameTime = 0;
let accumulatedBudget = 0; // Budget builds up when at cap

// --- MAIN SYSTEM ---
export function TimelineSpawnerSystem(dt: number, scene: THREE.Scene): void {
  // 1. Find Player (Select a random player in multiplayer)
  const players = Array.from(world.with('isPlayer', 'position'));
  if (players.length === 0) return;
  const targetPlayer = players[Math.floor(Math.random() * players.length)];
  const player = targetPlayer;

  // 2. Track game time
  gameTime += dt;

  // 3. Update spawn timer
  spawnTimer -= dt;

  if (spawnTimer <= 0) {
    spawnTimer = CONFIG.SPAWN_CHECK_INTERVAL;

    // 4. Get active spawn entries from timeline
    const activeEntries = getActiveEntries(STAGE_1_TIMELINE, gameTime);
    if (activeEntries.length === 0) return;

    // 5. Count current enemies
    const enemyCount = Array.from(world.with('isEnemy')).length;

    // 6. Calculate spawn budget with scaling
    const minutesElapsed = gameTime / 60;
    let spawnBudget =
      CONFIG.BASE_BUDGET + Math.pow(minutesElapsed, CONFIG.BUDGET_EXPONENT) * CONFIG.BUDGET_SCALE;

    // Apply difficulty multipliers
    spawnBudget *= CONFIG.CURSE_MULTIPLIER * CONFIG.STAGE_MULTIPLIER;

    // Add accumulated budget (dam breaking effect)
    spawnBudget += accumulatedBudget;
    accumulatedBudget = 0;

    // 7. Check enemy cap
    if (enemyCount >= CONFIG.MAX_ENEMIES) {
      // Cap reached - accumulate budget for later flood
      accumulatedBudget += spawnBudget;
      return;
    }

    // 8. Spend budget spawning enemies
    spawnFromBudget(spawnBudget, activeEntries, player.position, scene, enemyCount);
  }
}

// --- BUDGET SPAWNER ---
function spawnFromBudget(
  budget: number,
  pool: SpawnEntry[],
  playerPos: THREE.Vector3,
  scene: THREE.Scene,
  currentCount: number,
): void {
  let remainingBudget = budget;
  let spawnedThisCycle = 0;
  const maxSpawnsPerCycle = CONFIG.MAX_ENEMIES - currentCount;

  while (remainingBudget > 0 && spawnedThisCycle < maxSpawnsPerCycle) {
    // Select enemy type by weight
    const entry = selectEntryByWeight(pool);
    if (!entry) break;

    const cost = ENEMY_SPAWN_COST[entry.enemyType];
    if (cost > remainingBudget) break;

    // Determine spawn count (within entry's min/max)
    const maxAffordable = Math.floor(remainingBudget / cost);
    const entryCount =
      entry.countMin + Math.floor(Math.random() * (entry.countMax - entry.countMin + 1));
    const actualCount = Math.min(entryCount, maxAffordable, maxSpawnsPerCycle - spawnedThisCycle);

    if (actualCount <= 0) break;

    // Spawn in formation
    spawnFormation(entry.formation, actualCount, entry.enemyType, playerPos, scene);

    remainingBudget -= actualCount * cost;
    spawnedThisCycle += actualCount;
  }
}

// --- FORMATION SPAWNING ---
function spawnFormation(
  formation: FormationType,
  count: number,
  enemyType: EnemyType,
  playerPos: THREE.Vector3,
  scene: THREE.Scene,
): void {
  const positions = calculateFormationPositions(formation, count, playerPos);

  for (const pos of positions) {
    spawnEnemy(scene, pos.x, pos.z, enemyType);
  }
}

function calculateFormationPositions(
  formation: FormationType,
  count: number,
  playerPos: THREE.Vector3,
): { x: number; z: number }[] {
  const positions: { x: number; z: number }[] = [];
  const centerAngle = Math.random() * Math.PI * 2;

  switch (formation) {
    case 'swarm':
      // Random arc spread (±30° from center angle)
      for (let i = 0; i < count; i++) {
        const angleOffset = (Math.random() - 0.5) * (Math.PI / 3);
        const angle = centerAngle + angleOffset;
        const distance = randomSpawnDistance();
        positions.push({
          x: playerPos.x + Math.cos(angle) * distance,
          z: playerPos.z + Math.sin(angle) * distance,
        });
      }
      break;

    case 'line': {
      // Straight line perpendicular to player direction
      const perpAngle = centerAngle + Math.PI / 2;
      const lineDistance = randomSpawnDistance();

      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * 1.5;
        const baseX = playerPos.x + Math.cos(centerAngle) * lineDistance;
        const baseZ = playerPos.z + Math.sin(centerAngle) * lineDistance;
        positions.push({
          x: baseX + Math.cos(perpAngle) * offset,
          z: baseZ + Math.sin(perpAngle) * offset,
        });
      }
      break;
    }

    case 'encircle': {
      // Evenly spaced around full circle
      const encircleDistance = randomSpawnDistance();
      for (let i = 0; i < count; i++) {
        const angle = centerAngle + (i / count) * Math.PI * 2;
        positions.push({
          x: playerPos.x + Math.cos(angle) * encircleDistance,
          z: playerPos.z + Math.sin(angle) * encircleDistance,
        });
      }
      break;
    }

    case 'pincer': {
      // Two opposing arcs (45° each side)
      const pincerDistance = randomSpawnDistance();
      const arcSpread = Math.PI / 4; // 45 degrees per arc

      for (let i = 0; i < count; i++) {
        // Alternate between front and back arc
        const arcSide = i % 2 === 0 ? 0 : Math.PI;
        const indexInArc = Math.floor(i / 2);
        const countPerArc = Math.ceil(count / 2);
        const offset = countPerArc > 1 ? (indexInArc / (countPerArc - 1) - 0.5) * arcSpread : 0;
        const angle = centerAngle + arcSide + offset;
        positions.push({
          x: playerPos.x + Math.cos(angle) * pincerDistance,
          z: playerPos.z + Math.sin(angle) * pincerDistance,
        });
      }
      break;
    }
  }

  return positions;
}

function randomSpawnDistance(): number {
  return (
    CONFIG.INNER_SPAWN_RADIUS +
    Math.random() * (CONFIG.OUTER_SPAWN_RADIUS - CONFIG.INNER_SPAWN_RADIUS)
  );
}

// --- RESET ---
export function resetTimelineSpawner(): void {
  spawnTimer = 0;
  gameTime = 0;
  accumulatedBudget = 0;
}

// --- DEBUG (optional) ---
export function getSpawnerDebugInfo(): {
  gameTime: number;
  accumulatedBudget: number;
  currentBudget: number;
} {
  const minutesElapsed = gameTime / 60;
  const currentBudget =
    CONFIG.BASE_BUDGET + Math.pow(minutesElapsed, CONFIG.BUDGET_EXPONENT) * CONFIG.BUDGET_SCALE;

  return {
    gameTime,
    accumulatedBudget,
    currentBudget,
  };
}
