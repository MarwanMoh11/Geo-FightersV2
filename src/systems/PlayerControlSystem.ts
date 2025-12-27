import { world } from '../core/world';
import * as THREE from 'three';

const PLAYER_SPEED = 10;

export function PlayerControlSystem() {
  for (const entity of world.with('isPlayer', 'velocity', 'input')) {
    // FIX: Guard clause
    if (!entity.input) continue;

    // Read from Input Component
    const inputVector = new THREE.Vector3(entity.input.x, 0, entity.input.y);

    // Apply Speed
    entity.velocity.copy(inputVector.multiplyScalar(PLAYER_SPEED));
  }
}
