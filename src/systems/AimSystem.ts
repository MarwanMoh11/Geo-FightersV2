import { world } from '../core/world';
import * as THREE from 'three';

export function AimSystem() {
  // 1. Get the Player
  const player = world.with('isPlayer', 'position').first;
  if (!player) return;

  // 2. Find Closest Enemy
  let closestEnemy: THREE.Vector3 | null = null;
  let minDistanceSq = Infinity;
  const rangeSq = 20 * 20; // Range of 20 units

  // Loop through all enemies
  for (const enemy of world.with('isEnemy', 'position')) {
    const distSq = player.position.distanceToSquared(enemy.position);

    if (distSq < minDistanceSq && distSq < rangeSq) {
      minDistanceSq = distSq;
      closestEnemy = enemy.position;
    }
  }

  // 3. Update Aim Target
  // If we have an enemy, look at them.
  // If NOT, look in the direction we are moving (Fallback).
  if (!player.aimTarget) player.aimTarget = new THREE.Vector3();

  if (closestEnemy) {
    player.aimTarget.copy(closestEnemy);
  } else {
    // Fallback: Aim where moving, or default forward
    if (player.velocity && player.velocity.lengthSq() > 0.1) {
      // Predict a point 5 units ahead
      player.aimTarget
        .copy(player.position)
        .add(player.velocity.clone().normalize().multiplyScalar(5));
    } else {
      // Just look forward if standing still
      player.aimTarget.copy(player.position).add(new THREE.Vector3(0, 0, 5));
    }
  }
}
