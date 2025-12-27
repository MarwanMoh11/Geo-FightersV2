import { world } from '../core/world';
import * as THREE from 'three';

const ENEMY_SPEED = 4; // Slower than player (who is 10)

export function EnemySystem(dt: number) {
    // 1. Find the Player (The Target)
    const player = world.with('isPlayer', 'position').first;

    // If player is dead/missing, enemies stop moving
    if (!player) {
        for (const enemy of world.with('isEnemy', 'velocity')) {
            enemy.velocity.set(0, 0, 0);
        }
        return;
    }

    // 2. Steer Enemies
    for (const enemy of world.with('isEnemy', 'position', 'velocity')) {
        // Calculate Direction: Target - Me
        const direction = new THREE.Vector3()
            .subVectors(player.position, enemy.position);

        // Ignore Y axis (don't fly up/down)
        direction.y = 0;

        // Normalize and Apply Speed
        if (direction.lengthSq() > 0.1) {
            direction.normalize().multiplyScalar(ENEMY_SPEED);
            enemy.velocity.copy(direction);
        }

        // Simple "Soft Collision" (Separation)
        // Prevents enemies from stacking perfectly on top of each other
        for (const otherEnemy of world.with('isEnemy', 'position')) {
            if (enemy === otherEnemy) continue;

            const dist = enemy.position.distanceToSquared(otherEnemy.position);
            if (dist < 1.0) { // If too close
                const push = new THREE.Vector3()
                    .subVectors(enemy.position, otherEnemy.position)
                    .normalize()
                    .multiplyScalar(2.0); // Push away force
                enemy.velocity.add(push);
            }
        }
    }
}