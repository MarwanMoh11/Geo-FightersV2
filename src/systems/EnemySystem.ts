import * as THREE from 'three';
import { world } from '../core/world';
import { uiState } from '../core/UIState.svelte.ts';
import { getViewExtents } from './CameraSystem';
import { edgeSpawnPos } from './TimelineSpawner';

const STEER_STRENGTH = 12.0;
const STUN_FRICTION = 0.9;
const CONFUSED_ATTACK_RANGE_SQ = 2.0 * 2.0;

const _players: any[] = [];
const _enemies: any[] = [];
// Confusion targets: built once per frame, only when at least one enemy is
// confused — turns the per-confused-enemy full scan into a shared array walk.
const _confTargets: any[] = [];

export function EnemySystem(dt: number, _scene: THREE.Scene) {
  const relaySlow = uiState.relaySlowTimer > 0 ? 0.5 : 1;

  _players.length = 0;
  for (const p of world.with('isPlayer', 'position')) {
    if (!p.health || p.health.current > 0) {
      _players.push(p);
    }
  }
  if (_players.length === 0) return;

  // VS off-screen recycling: distance past which a lagging enemy is snapped back
  // to the player's leading edge. Derived from the live view so it sits just
  // beyond the visible corner (the reposition is never on-screen) yet inside the
  // render cull — a player who outruns the trash never leaves the screen empty.
  const _ve = getViewExtents();
  const recycleDist = Math.hypot(_ve.halfX, _ve.halfZ) + 22;
  const RECYCLE_DIST_SQ = recycleDist * recycleDist;

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

  for (let i = 0; i < enemyCount; i++) {
    const enemy = _enemies[i];
    if (enemy.isBoss) continue;

    if (enemy.confusedTimer && enemy.confusedTimer > 0) {
      enemy.confusedTimer -= dt;
    }
    if (enemy.contactCooldown && enemy.contactCooldown > 0) {
      enemy.contactCooldown -= dt;
    }

    if (enemy.stunTimer && enemy.stunTimer > 0) {
      enemy.stunTimer -= dt;
      enemy.velocity.x *= STUN_FRICTION;
      enemy.velocity.z *= STUN_FRICTION;
    } else {
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

      // Outran the horde? Snap this laggard back to your leading edge (off-screen).
      if (minPDistSq > RECYCLE_DIST_SQ) {
        const rp = edgeSpawnPos(
          closestPlayer.position.x,
          closestPlayer.position.z,
          closestPlayer.velocity?.x ?? 0,
          closestPlayer.velocity?.z ?? 0,
        );
        enemy.position.x = rp.x;
        enemy.position.z = rp.z;
        enemy.velocity.x = 0;
        enemy.velocity.z = 0;
        continue;
      }

      let targetX = closestPlayer.position.x;
      let targetZ = closestPlayer.position.z;

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

      const dx = targetX - enemy.position.x;
      const dz = targetZ - enemy.position.z;
      const invLen = 1.0 / Math.sqrt(dx * dx + dz * dz + 0.001);

      const speed = (enemy.moveSpeed || 2.0) * relaySlow;
      const targetVx = dx * invLen * speed;
      const targetVz = dz * invLen * speed;

      const steerFactor = STEER_STRENGTH * dt;
      enemy.velocity.x += (targetVx - enemy.velocity.x) * steerFactor;
      enemy.velocity.z += (targetVz - enemy.velocity.z) * steerFactor;
    }

    enemy.position.x += enemy.velocity.x * dt;
    enemy.position.z += enemy.velocity.z * dt;

    if (enemy.velocity.lengthSq() > 0.01) {
      enemy.rotationY = Math.atan2(enemy.velocity.x, enemy.velocity.z);
    }
  }
}
