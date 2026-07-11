/**
 * EnemySystem - VS-Style Optimized
 *
 * Optimizations:
 * 1. Enemies have NO AI - just move toward player
 * 2. Reusable vectors (zero allocations)
 * 3. Squared distance for separation
 * 4. Limited separation checks (only nearby enemies)
 * 5. Early-out on stunned enemies
 * 6. Screen-bound despawning (enemies far from player are removed)
 *
 * Signal Hijacker: Confused enemies attack other enemies
 */

import * as THREE from 'three';
import { world } from '../core/world';
import { removeBody } from '../core/RapierWorld';
import { uiState } from '../core/UIState.svelte.ts';

// --- PRECOMPUTED CONSTANTS ---
const SEPARATION_RADIUS = 1.0;
const SEPARATION_RADIUS_SQ = SEPARATION_RADIUS * SEPARATION_RADIUS;
const STEER_STRENGTH = 8.0;
const STUN_FRICTION = 0.9;
const CONFUSED_ATTACK_RANGE_SQ = 2.0 * 2.0; // Range for confused enemy attacks

// --- DESPAWN RADIUS (Screen-bound entity recycling) ---
// ViewRadius ~20, SpawnRadius ~26, DespawnRadius = 36 (1.8x view)
const DESPAWN_RADIUS_SQ = 36 * 36;

// --- MAX SEPARATION CHECKS PER ENEMY (Performance cap) ---
const MAX_SEPARATION_CHECKS = 10;

// --- MODULE-LEVEL REUSABLE ARRAYS (Prevents GC Allocations) ---
const _players: any[] = [];
const _enemies: any[] = [];

// --- SPATIAL HASH GRID (separation without O(n²) pair checks) ---
// Cell size equals the separation radius, so any pair within range is in the
// same cell or an adjacent one. Cells hold indices into _enemies and are
// pooled/reused across frames to avoid GC pressure.
const GRID_CELL = 1.0;
const GRID_OFFSET = 1024; // supports maps up to ±1024 cells from the origin
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

// Half-neighborhood offsets (own cell + 4 of 8 neighbors) so every unordered
// pair of cells is visited exactly once — forces apply to both enemies.
const NEIGHBOR_DX = [0, 1, 1, 0, -1];
const NEIGHBOR_DZ = [0, 0, 1, 1, 1];

export function EnemySystem(dt: number, scene: THREE.Scene) {
  // RELAY TOWER breach reward: the whole grid runs at half speed while active
  const relaySlow = uiState.relaySlowTimer > 0 ? 0.5 : 1;
  // Populate reusable players array
  _players.length = 0;
  for (const p of world.with('isPlayer', 'position')) {
    if (!p.health || p.health.current > 0) {
      _players.push(p);
    }
  }
  if (_players.length === 0) return;

  // Populate reusable enemies array
  _enemies.length = 0;
  for (const e of world.with('isEnemy', 'position', 'velocity', 'health')) {
    _enemies.push(e);
  }
  const enemyCount = _enemies.length;

  // Rebuild the spatial hash for this frame (boss excluded from separation)
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

    // Exclude the boss from normal enemy steering, separation, and screen-bound despawning
    if (enemy.isBoss) continue;

    // Tick confusion timer
    if (enemy.confusedTimer && enemy.confusedTimer > 0) {
      enemy.confusedTimer -= dt;
    }

    // Tick per-enemy contact-damage cooldown (VS contact model)
    if (enemy.contactCooldown && enemy.contactCooldown > 0) {
      enemy.contactCooldown -= dt;
    }

    // STUN CHECK (Early processing)
    if (enemy.stunTimer && enemy.stunTimer > 0) {
      enemy.stunTimer -= dt;
      enemy.velocity.x *= STUN_FRICTION;
      enemy.velocity.z *= STUN_FRICTION;
    } else {
      // Find closest player for AI targeting
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

        for (let j = 0; j < enemyCount; j++) {
          if (j === i) continue;
          const other = _enemies[j];
          // Don't target other confused enemies or dead enemies
          if (other.confusedTimer && other.confusedTimer > 0) continue;
          if (!other.health || other.health.current <= 0) continue;

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

          // ATTACK: Deal damage to nearby non-confused enemies
          if (nearestDistSq < CONFUSED_ATTACK_RANGE_SQ) {
            // Do 5 damage per second to nearby enemies
            nearestEnemy.health!.current -= 5 * dt;
            nearestEnemy.hitFlashTimer = 0.1;
          }
        } else {
          // No valid target, stay still
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
    }

    // 3. SEPARATION (spatial hash: only enemies in the same or adjacent cells)
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

          // POSITION relaxation, not velocity impulses. Impulse separation
          // fought the chase steering in dense packs and settled into a
          // vibration limit-cycle — twice as violent at mobile frame times
          // (dt doubles → kicks double) which read as "shaking / low fps".
          // Relaxing a dt-scaled, capped fraction of the overlap can never
          // overshoot, so it cannot oscillate; the horde packs into a calm
          // VS-style blob instead.
          const dist = Math.sqrt(distSq);
          const overlap = SEPARATION_RADIUS - dist;
          const f = Math.min(0.45, 6 * dt); // per-frame relaxation, fps-normalized
          const push = Math.min(overlap * f, 0.12);
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

    // 5. SYNC VISUALS
    if (enemy.transform) {
      enemy.transform.position.x = enemy.position.x;
      enemy.transform.position.z = enemy.position.z;
    }

    // 6. DESPAWN (Screen-bound entity recycling)
    // Remove enemies too far from ALL players to maintain performance
    let closeToAnyPlayer = false;
    for (const p of _players) {
      const distX = enemy.position.x - p.position.x;
      const distZ = enemy.position.z - p.position.z;
      const distSq = distX * distX + distZ * distZ;
      if (distSq <= DESPAWN_RADIUS_SQ) {
        closeToAnyPlayer = true;
        break;
      }
    }

    if (!closeToAnyPlayer) {
      // Remove from scene
      if (enemy.transform) {
        scene.remove(enemy.transform);
      }
      // Free the physics body (leaks otherwise — recycled enemies add up fast)
      if (enemy.rigidBody) {
        removeBody(enemy.rigidBody);
        enemy.rigidBody = undefined;
        enemy.collider = undefined;
      }
      // Remove from ECS world
      world.remove(enemy);
    }
  }
}
