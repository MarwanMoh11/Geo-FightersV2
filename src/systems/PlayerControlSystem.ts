import { world } from '../core/world';
import * as THREE from 'three';

const BASE_PLAYER_SPEED = 10;
const KNOCKBACK_DECAY = 7.0; // higher = recovers control faster

const _inputVector = new THREE.Vector3();

export function PlayerControlSystem(dt: number) {
  for (const entity of world.with('isPlayer', 'velocity', 'input', 'stats')) {
    // FIX: Guard clause
    if (!entity.input) continue;

    // Tick post-hit invulnerability window
    if (entity.invulnTimer && entity.invulnTimer > 0) {
      entity.invulnTimer -= dt;
    }

    // Read from Input Component
    _inputVector.set(entity.input.x, 0, entity.input.y);

    // Apply Speed with passive bonus
    const speedMult = entity.stats?.moveSpeed || 1.0;
    entity.velocity.copy(_inputVector.multiplyScalar(BASE_PLAYER_SPEED * speedMult));

    // Layer decaying knockback on top of input so hits physically push the
    // player without permanently stealing control
    if (entity.knockback && entity.knockback.lengthSq() > 0.01) {
      entity.velocity.add(entity.knockback);
      entity.knockback.multiplyScalar(Math.exp(-KNOCKBACK_DECAY * dt));
    }
  }
}
