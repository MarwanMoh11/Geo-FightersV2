import { world } from '../core/world';
import { spawnEnemy } from '../core/factories';
import * as THREE from 'three';

let spawnTimer = 0;

// DIFFICULTY SETTINGS
const SPAWN_RATE = 0.5; // Spawn 2 enemies per second (Was 1.0)
const SPAWN_DISTANCE = 20; // Radius around player

/**
 * Periodically spawns enemies at a fixed radius around the player.
 *
 * @param {number} dt - delta time since last frame in seconds
 * @param {THREE.Scene} scene - the Three.js scene to add spawned enemies to
 */
export function SpawnerSystem(dt: number, scene: THREE.Scene) {
  spawnTimer -= dt;

  if (spawnTimer <= 0) {
    // 1. Reset Timer
    spawnTimer = SPAWN_RATE;

    // 2. Find Player Position
    const player = world.with('isPlayer', 'position').first;
    if (!player) return;

    // 3. Pick a Random Angle
    const angle = Math.random() * Math.PI * 2;

    // 4. Calculate Position
    const x = player.position.x + Math.cos(angle) * SPAWN_DISTANCE;
    const z = player.position.z + Math.sin(angle) * SPAWN_DISTANCE;

    // 5. Spawn!
    spawnEnemy(scene, x, z);
  }
}
