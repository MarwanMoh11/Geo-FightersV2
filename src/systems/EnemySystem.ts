import * as THREE from 'three';
import { world } from '../core/world';
import { EnemyType } from '../core/factories';
import { uiState } from '../core/UIState.svelte.ts';

const STEER_STRENGTH = 12.0;
const STUN_FRICTION = 0.9;
const CONFUSED_ATTACK_RANGE_SQ = 2.0 * 2.0;

// --- SEPARATION (spatial hash, position relaxation — stable, no vibration) ---
const SEPARATION_RADIUS = 0.5;
const SEPARATION_RADIUS_SQ = SEPARATION_RADIUS * SEPARATION_RADIUS;
const GRID_CELL = 0.5;
const GRID_OFFSET = 1024;
const MAX_SEPARATION_CHECKS = 6;

const _players: any[] = [];
const _enemies: any[] = [];
const _confTargets: any[] = [];

const _grid = new Map<number, number[]>();
const _cellPool: number[][] = [];
let _cellPoolUsed = 0;

function gridKey(cx: number, cz: number): number {
  return (cx + GRID_OFFSET) * 4096 + (cz + GRID_OFFSET);
}

function gridCellFor(key: number): number[] {
  let cell = _grid.get(key);
  if (!cell) {
    cell = _cellPool[_cellPoolUsed] ?? (_cellPool[_cellPoolUsed] = []);
    _cellPoolUsed++;
    cell.length = 0;
    _grid.set(key, cell);
  }
  return cell;
}

const NEIGHBOR_DX = [0, 1, 1, 0, -1];
const NEIGHBOR_DZ = [0, 0, 1, 1, 1];

/**
 * Per-frame enemy AI tick: steer toward the nearest player, handle stun and
 * confusion, apply spatial-hash separation, and integrate position.
 *
 * @param {number} dt - delta time since last frame in seconds
 * @param {THREE.Scene} _scene - the Three.js scene (unused directly)
 */
export function EnemySystem(dt: number, _scene: THREE.Scene) {
  const relaySlow = uiState.relaySlowTimer > 0 ? 0.5 : 1;

  _players.length = 0;
  for (const p of world.with('isPlayer', 'position')) {
    if (!p.health || p.health.current > 0) {
      _players.push(p);
    }
  }
  if (_players.length === 0) return;

  _enemies.length = 0;
  let anyConfused = false;
  for (const e of world.with('isEnemy', 'position', 'velocity', 'health')) {
    _enemies.push(e);
    if (e.confusedTimer !== undefined && e.confusedTimer > 0) anyConfused = true;
  }
  const enemyCount = _enemies.length;

  // Shared non-confused target list for confused attackers (avoids O(n²) scans)
  _confTargets.length = 0;
  if (anyConfused) {
    for (let i = 0; i < enemyCount; i++) {
      const e = _enemies[i];
      if (e.confusedTimer !== undefined && e.confusedTimer > 0) continue;
      if (!e.health || e.health.current <= 0) continue;
      _confTargets.push(e);
    }
  }

  // Rebuild the spatial hash (boss excluded from separation)
  _grid.clear();
  _cellPoolUsed = 0;
  for (let i = 0; i < enemyCount; i++) {
    const e = _enemies[i];
    if (e.isBoss) continue;
    const cx = Math.floor(e.position.x / GRID_CELL);
    const cz = Math.floor(e.position.z / GRID_CELL);
    gridCellFor(gridKey(cx, cz)).push(i);
  }

  for (let i = 0; i < enemyCount; i++) {
    const enemy = _enemies[i];
    if (enemy.isBoss) continue;

    if (enemy.confusedTimer && enemy.confusedTimer > 0) {
      enemy.confusedTimer -= dt;
    }
    if (enemy.contactCooldown && enemy.contactCooldown > 0) {
      enemy.contactCooldown -= dt;
    }

    // STUN CHECK
    if (enemy.stunTimer && enemy.stunTimer > 0) {
      enemy.stunTimer -= dt;
      enemy.velocity.x *= STUN_FRICTION;
      enemy.velocity.z *= STUN_FRICTION;
    } else {
      const skipSteer =
        enemy.dashState === 'dash' ||
        (enemy.abilityKind === 'ranged' && enemy.enemyType === EnemyType.SPITTER);

      if (!skipSteer) {
        let closestPlayer = _players[0];
        let minPDistSq = Infinity;
        for (const p of _players) {
          const dx = p.position.x - enemy.position.x;
          const dz = p.position.z - enemy.position.z;
          const distSq = dx * dx + dz * dz;
          if (distSq < minPDistSq) {
            minPDistSq = distSq;
            closestPlayer = p;
          }
        }

        let targetX = closestPlayer.position.x;
        let targetZ = closestPlayer.position.z;

        // CONFUSED: Target nearest non-confused enemy instead of player
        if (enemy.confusedTimer && enemy.confusedTimer > 0) {
          let nearestDistSq = Infinity;
          let nearestEnemy = null;

          for (let j = 0; j < _confTargets.length; j++) {
            const other = _confTargets[j];
            const dx = other.position.x - enemy.position.x;
            const dz = other.position.z - enemy.position.z;
            const distSq = dx * dx + dz * dz;

            if (distSq < nearestDistSq) {
              nearestDistSq = distSq;
              nearestEnemy = other;
            }
          }

          if (nearestEnemy) {
            targetX = nearestEnemy.position.x;
            targetZ = nearestEnemy.position.z;

            if (nearestDistSq < CONFUSED_ATTACK_RANGE_SQ) {
              nearestEnemy.health.current -= 5 * dt;
              nearestEnemy.hitFlashTimer = 0.1;
            }
          } else {
            enemy.velocity.x *= 0.9;
            enemy.velocity.z *= 0.9;
            continue;
          }
        }

        // 1. MOVE TOWARD TARGET (No pathfinding, no AI)
        const dx = targetX - enemy.position.x;
        const dz = targetZ - enemy.position.z;
        const invLen = 1.0 / Math.sqrt(dx * dx + dz * dz + 0.001);

        const speed = (enemy.moveSpeed || 2.0) * relaySlow;
        const targetVx = dx * invLen * speed;
        const targetVz = dz * invLen * speed;

        // 2. STEERING (Soft turn toward target velocity)
        const steerFactor = STEER_STRENGTH * dt;
        enemy.velocity.x += (targetVx - enemy.velocity.x) * steerFactor;
        enemy.velocity.z += (targetVz - enemy.velocity.z) * steerFactor;

        // GLITCH blink
        if (
          enemy.enemyType === EnemyType.GLITCH &&
          Math.random() < 0.004 &&
          !(enemy.confusedTimer && enemy.confusedTimer > 0)
        ) {
          const blinkDx = closestPlayer.position.x - enemy.position.x;
          const blinkDz = closestPlayer.position.z - enemy.position.z;
          const bInv = 1 / Math.sqrt(blinkDx * blinkDx + blinkDz * blinkDz + 0.001);
          enemy.position.x += blinkDx * bInv * 1.8;
          enemy.position.z += blinkDz * bInv * 1.8;
          enemy.hitFlashTimer = 0.1;
        }
      }
    }

    // 3. SEPARATION — spatial hash, position relaxation (bounces off each other)
    // Velocity impulses here fight the chase steering and oscillate violently;
    // relaxing a capped fraction of overlap cannot overshoot, so the horde packs
    // into a tight VS-style blob without phasing through.
    if (!enemy.phased) {
      let checksRemaining = MAX_SEPARATION_CHECKS;
      const cellX = Math.floor(enemy.position.x / GRID_CELL);
      const cellZ = Math.floor(enemy.position.z / GRID_CELL);

      for (let n = 0; n < 5 && checksRemaining > 0; n++) {
        const cell = _grid.get(gridKey(cellX + NEIGHBOR_DX[n], cellZ + NEIGHBOR_DZ[n]));
        if (!cell) continue;

        for (let k = 0; k < cell.length && checksRemaining > 0; k++) {
          const j = cell[k];
          if (n === 0 && j <= i) continue; // own cell: visit each pair once
          const other = _enemies[j];

          const dx = enemy.position.x - other.position.x;
          const dz = enemy.position.z - other.position.z;
          const distSq = dx * dx + dz * dz;

          if (distSq < SEPARATION_RADIUS_SQ && distSq > 0.0001) {
            checksRemaining--;

            const dist = Math.sqrt(distSq);
            const overlap = SEPARATION_RADIUS - dist;
            // Push a full 60% of the overlap — strong enough that enemies clearly
            // bounce apart instead of sliding through each other, but still
            // position-based (no velocity spike → no vibration).
            const f = Math.min(0.6, 8 * dt);
            const push = Math.min(overlap * f, 0.2);
            const invDist = 1.0 / dist;
            const px = dx * invDist * push;
            const pz = dz * invDist * push;

            enemy.position.x += px;
            enemy.position.z += pz;
            other.position.x -= px;
            other.position.z -= pz;
          }
        }
      }

      // 4. MOVE
      enemy.position.x += enemy.velocity.x * dt;
      enemy.position.z += enemy.velocity.z * dt;
    } else {
      enemy.velocity.x *= 0.8;
      enemy.velocity.z *= 0.8;
    }

    // 5. SYNC VISUAL DIRECTION
    if (enemy.velocity.lengthSq() > 0.01) {
      enemy.rotationY = Math.atan2(enemy.velocity.x, enemy.velocity.z);
    }
  }
}
