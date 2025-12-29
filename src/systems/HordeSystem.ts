/**
 * HordeSystem - Vampire Survivors Style Spawner
 *
 * Spawns HUNDREDS of slow shambling enemies.
 * Time-based scaling keeps you ALWAYS on edge.
 * The longer you survive, the harder it gets.
 */

import { world } from '../core/world';
import { spawnEnemy, EnemyType } from '../core/factories';
import {
  getPressure,
  getFlowMomentum,
  isInComebackMode,
  updateFlowState,
  reportNearMiss,
} from '../core/FlowStateManager';
import * as THREE from 'three';

// --- CONFIGURATION ---
const CONFIG = {
  // Base spawn rate - MASSIVE for VS feel (enemies per second)
  baseSpawnRate: 8.0,

  // Spawn rate multipliers based on pressure (less extreme since base is high)
  spawnRateMultipliers: {
    low: 0.7,
    optimal: 1.0,
    high: 0.85,
    comeback: 0.5,
  },

  // Distance from player to spawn enemies
  minSpawnDistance: 12,
  maxSpawnDistance: 30,

  // Maximum enemies - HUNDREDS for VS feel
  maxEnemies: 300,

  // Wave burst settings - constant waves
  waveChance: 0.4, // 40% chance per spawn to trigger wave
  waveSize: { min: 5, max: 12 },

  // Flanking less important when surrounded anyway
  flankingChance: {
    low: 0.05,
    optimal: 0.1,
    high: 0.1,
  },

  // HORDE WEIGHTS: Almost all fodder
  enemyWeights: {
    low: { [EnemyType.VIRUS]: 0.75, [EnemyType.GLITCH]: 0.25, [EnemyType.FIREWALL]: 0.0 },
    optimal: { [EnemyType.VIRUS]: 0.65, [EnemyType.GLITCH]: 0.32, [EnemyType.FIREWALL]: 0.03 },
    high: { [EnemyType.VIRUS]: 0.55, [EnemyType.GLITCH]: 0.4, [EnemyType.FIREWALL]: 0.05 },
  },

  // TIME SCALING (VS-style)
  timeScaling: {
    spawnRatePerMinute: 1.0, // +100% spawn rate per minute
    hpPerTwoMinutes: 0.5, // +50% HP every 2 minutes
  },
};

// --- STATE ---
let spawnTimer = 0;
let gameTime = 0; // Track total game time for scaling
let lastPressureZone: 'low' | 'optimal' | 'high' = 'optimal';
const recentNearMisses = new Set<number>();

// --- MAIN SYSTEM ---
export function HordeSystem(dt: number, scene: THREE.Scene): void {
  // 1. Find Player
  const player = world.with('isPlayer', 'position', 'health').first;
  if (!player || !player.health) return;

  // 2. Track game time for scaling
  gameTime += dt;
  const minutesElapsed = gameTime / 60;

  // 3. Update Flow State
  const healthPercent = player.health.current / player.health.max;
  updateFlowState(dt, healthPercent);

  // 4. Check near-misses (enemies close to player)
  checkNearMisses(player.position);

  // 5. Get current pressure and determine spawn behavior
  const pressure = getPressure();
  const momentum = getFlowMomentum();
  const comebackMode = isInComebackMode();

  // Determine pressure zone
  const pressureZone: 'low' | 'optimal' | 'high' =
    comebackMode || pressure < 0.3 ? 'low' : pressure > 0.7 ? 'high' : 'optimal';

  if (pressureZone !== lastPressureZone) {
    lastPressureZone = pressureZone;
  }

  // 6. Calculate spawn rate WITH TIME SCALING
  const rateMultiplier = comebackMode
    ? CONFIG.spawnRateMultipliers.comeback
    : CONFIG.spawnRateMultipliers[pressureZone];

  const momentumAdjust = momentum > 0 ? 0.95 : 1.0;

  // TIME SCALING: +100% spawn rate per minute
  const timeScaleMultiplier = 1 + minutesElapsed * CONFIG.timeScaling.spawnRatePerMinute;

  const spawnRate = CONFIG.baseSpawnRate * rateMultiplier * momentumAdjust * timeScaleMultiplier;
  const spawnInterval = 1.0 / spawnRate;

  // 7. Count current enemies
  const enemyCount = Array.from(world.with('isEnemy')).length;

  // 8. Spawn Logic
  spawnTimer -= dt;

  if (spawnTimer <= 0 && enemyCount < CONFIG.maxEnemies) {
    spawnTimer = spawnInterval;

    // Wave chance increases with time
    const adjustedWaveChance = Math.min(0.8, CONFIG.waveChance + minutesElapsed * 0.05);
    const isWave = Math.random() < adjustedWaveChance;

    if (isWave) {
      spawnWave(player.position, scene, pressureZone);
    } else {
      spawnSingleEnemy(player.position, scene, pressureZone);
    }
  }
}

// --- SPAWN HELPERS ---

function spawnSingleEnemy(
  playerPos: THREE.Vector3,
  scene: THREE.Scene,
  zone: 'low' | 'optimal' | 'high',
): void {
  const type = selectEnemyType(zone);
  const position = calculateSpawnPosition(playerPos, zone);
  spawnEnemy(scene, position.x, position.z, type);
}

function spawnWave(
  playerPos: THREE.Vector3,
  scene: THREE.Scene,
  zone: 'low' | 'optimal' | 'high',
): void {
  const waveSize =
    CONFIG.waveSize.min +
    Math.floor(Math.random() * (CONFIG.waveSize.max - CONFIG.waveSize.min + 1));

  // Waves spawn in an arc
  const centerAngle = Math.random() * Math.PI * 2;
  const arcSpread = Math.PI / 3; // 60 degree arc

  for (let i = 0; i < waveSize; i++) {
    const angleOffset = (i / waveSize - 0.5) * arcSpread;
    const angle = centerAngle + angleOffset;
    const distance =
      CONFIG.minSpawnDistance + Math.random() * (CONFIG.maxSpawnDistance - CONFIG.minSpawnDistance);

    const x = playerPos.x + Math.cos(angle) * distance;
    const z = playerPos.z + Math.sin(angle) * distance;

    const type = selectEnemyType(zone);
    spawnEnemy(scene, x, z, type);
  }
}

function selectEnemyType(zone: 'low' | 'optimal' | 'high'): EnemyType {
  const weights = CONFIG.enemyWeights[zone];
  const roll = Math.random();
  let cumulative = 0;

  for (const [type, weight] of Object.entries(weights)) {
    cumulative += weight;
    if (roll <= cumulative) {
      return type as EnemyType;
    }
  }

  return EnemyType.GLITCH; // Fallback
}

function calculateSpawnPosition(
  playerPos: THREE.Vector3,
  zone: 'low' | 'optimal' | 'high',
): { x: number; z: number } {
  const angle = Math.random() * Math.PI * 2;
  const distance =
    CONFIG.minSpawnDistance + Math.random() * (CONFIG.maxSpawnDistance - CONFIG.minSpawnDistance);

  let x = playerPos.x + Math.cos(angle) * distance;
  let z = playerPos.z + Math.sin(angle) * distance;

  // Flanking: occasionally spawn behind player (based on velocity)
  const flankChance = CONFIG.flankingChance[zone];
  if (Math.random() < flankChance) {
    // Get player velocity to determine "behind"
    const playerEntity = world.with('isPlayer', 'velocity').first;
    if (playerEntity && playerEntity.velocity) {
      const velX = playerEntity.velocity.x;
      const velZ = playerEntity.velocity.z;
      const velMag = Math.sqrt(velX * velX + velZ * velZ);

      if (velMag > 0.1) {
        // Spawn behind where player is moving
        const behindAngle = Math.atan2(-velZ, -velX);
        const flankOffset = ((Math.random() - 0.5) * Math.PI) / 2; // ±45 degrees

        x = playerPos.x + Math.cos(behindAngle + flankOffset) * distance;
        z = playerPos.z + Math.sin(behindAngle + flankOffset) * distance;
      }
    }
  }

  return { x, z };
}

// --- NEAR-MISS DETECTION ---

function checkNearMisses(playerPos: THREE.Vector3): void {
  const nearMissThreshold = 1.5; // Distance for "close call"
  const hitThreshold = 1.0; // Distance considered a hit

  for (const enemy of world.with('isEnemy', 'position')) {
    const dist = Math.sqrt(
      (enemy.position.x - playerPos.x) ** 2 + (enemy.position.z - playerPos.z) ** 2,
    );

    // Near miss: close but not hitting
    if (dist > hitThreshold && dist < nearMissThreshold) {
      // Only report if enemy hasn't been flagged recently
      if (enemy.id && !recentNearMisses.has(enemy.id)) {
        reportNearMiss(dist);
        recentNearMisses.add(enemy.id);

        // Clear flag after a short time
        const enemyId = enemy.id;
        setTimeout(() => {
          recentNearMisses.delete(enemyId);
        }, 500);
      }
    }
  }
}

/**
 * Reset swarm state (on game restart)
 */
export function resetHordeState(): void {
  spawnTimer = 0;
  gameTime = 0;
  lastPressureZone = 'optimal';
  recentNearMisses.clear();
}
