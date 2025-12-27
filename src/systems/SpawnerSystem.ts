import { world } from '../core/world';
import { spawnEnemy } from '../core/factories';
import * as THREE from 'three';

let spawnTimer = 0;
// Difficulty Settings
const SPAWN_RATE = 1.0; // Seconds between spawns (Lower = Harder)
const SPAWN_DISTANCE = 20; // How far away to spawn

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

    // 4. Calculate Position (Circle around player)
    // x = center_x + radius * cos(angle)
    // z = center_z + radius * sin(angle)
    const x = player.position.x + Math.cos(angle) * SPAWN_DISTANCE;
    const z = player.position.z + Math.sin(angle) * SPAWN_DISTANCE;

    // 5. Spawn!
    spawnEnemy(scene, x, z);
  }
}
