import { world } from '../core/world';
import * as THREE from 'three';
import { uiState } from '../core/UIState.svelte.ts';

const BASE_PLAYER_SPEED = 5.5;
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
    let speedMult = entity.stats?.moveSpeed || 1.0;
    // Map 1 Velocity Shrine: local-player speed surge
    if (entity.isLocalPlayer && uiState.shrineSpeedTimer > 0) speedMult *= 1.25;
    if (uiState.overloadActive) {
      if (uiState.selectedCharacter === 'rail') {
        speedMult = 0;
      } else if (uiState.selectedCharacter === 'lash' || uiState.selectedCharacter === 'ghost') {
        speedMult *= 1.5; // sprint ults: Lash's static field, Ghost's phase-walk
      }
    }
    if (uiState.insideDefragZone) {
      speedMult *= 1.3;
    }
    entity.velocity.copy(_inputVector.multiplyScalar(BASE_PLAYER_SPEED * speedMult));

    // Layer decaying knockback on top of input so hits physically push the
    // player without permanently stealing control
    if (entity.knockback && entity.knockback.lengthSq() > 0.01) {
      entity.velocity.add(entity.knockback);
      entity.knockback.multiplyScalar(Math.exp(-KNOCKBACK_DECAY * dt));
    }
  }
}
