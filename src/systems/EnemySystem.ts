import { world } from '../core/world';
import * as THREE from 'three';

const SEPARATION_RADIUS = 1.0;
const _dir = new THREE.Vector3(); // Reusable
const _push = new THREE.Vector3(); // Reusable

export function EnemySystem(dt: number) {
  const player = world.with('isPlayer', 'position').first;
  if (!player) return;

  const enemies = Array.from(world.with('isEnemy', 'position', 'velocity'));

  for (const enemy of enemies) {
    if (enemy.stunTimer && enemy.stunTimer > 0) {
      enemy.stunTimer -= dt;
      // Friction during stun
      enemy.velocity.multiplyScalar(0.9);
    } else {
      // 1. Calculate Desired Velocity (Towards Player)
      _dir.subVectors(player.position, enemy.position).normalize();
      const speed = enemy.moveSpeed || 2.0;

      // Target Velocity
      _push.copy(_dir).multiplyScalar(speed);

      // 2. Steering Force (Soft Turn)
      // Steer towards desired velocity with a factor (0.1s smoothing)
      // velocity += (target - velocity) * factor * dt
      const steerStrength = 8.0;
      enemy.velocity.x += (_push.x - enemy.velocity.x) * steerStrength * dt;
      enemy.velocity.z += (_push.z - enemy.velocity.z) * steerStrength * dt;
    }

    // 3. Separation (Crowd Control)
    for (const other of enemies) {
      if (other === enemy) continue;
      const distSq = enemy.position.distanceToSquared(other.position);

      if (distSq < SEPARATION_RADIUS) {
        _push.subVectors(enemy.position, other.position).normalize();
        // Force inversely proportional to distance (stronger when closer)
        const force = (1.0 - distSq / SEPARATION_RADIUS) * 20 * dt;
        enemy.velocity.x += _push.x * force;
        enemy.velocity.z += _push.z * force;
      }
    }

    // 4. Move
    enemy.position.x += enemy.velocity.x * dt;
    enemy.position.z += enemy.velocity.z * dt;

    // 5. Visuals
    if (enemy.transform) {
      enemy.transform.position.copy(enemy.position);
      // Face direction of movement (Assume Sprite faces RIGHT)
      if (Math.abs(enemy.velocity.x) > 0.1) {
        const scale = Math.abs(enemy.transform.scale.x);
        enemy.transform.scale.x = enemy.velocity.x > 0 ? scale : -scale;
      }
    }
  }
}
