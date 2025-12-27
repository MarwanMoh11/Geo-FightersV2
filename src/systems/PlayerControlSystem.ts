import { world } from '../core/world';
import * as THREE from 'three';

const PLAYER_SPEED = 10;

export function PlayerControlSystem() {
    // Only run for entities with Input (The Player)
    for (const entity of world.with('input', 'velocity')) {
        const inputVector = new THREE.Vector3(entity.input.x, 0, entity.input.y);

        if (inputVector.lengthSq() > 0) {
            inputVector.normalize();
        }

        // Set velocity based on input
        entity.velocity.copy(inputVector).multiplyScalar(PLAYER_SPEED);
    }
}