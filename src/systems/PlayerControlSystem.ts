import { world } from '../core/world';
import * as THREE from 'three';

const BASE_PLAYER_SPEED = 10;

export function PlayerControlSystem() {
  for (const entity of world.with('isPlayer', 'velocity', 'input', 'stats')) {
    // FIX: Guard clause
    if (!entity.input) continue;

    // Read from Input Component
    const inputVector = new THREE.Vector3(entity.input.x, 0, entity.input.y);

    // Apply Speed with passive bonus
    const speedMult = entity.stats?.moveSpeed || 1.0;
    entity.velocity.copy(inputVector.multiplyScalar(BASE_PLAYER_SPEED * speedMult));
  }
}
