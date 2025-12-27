import { world } from '../core/world';
import * as THREE from 'three';

const ENEMY_SPEED = 4;
const SEPARATION_FORCE = 2.0;

export function EnemySystem(dt: number) {
    const player = world.with('isPlayer', 'position').first;

    if (!player) {
        for (const enemy of world.with('isEnemy', 'velocity')) {
            enemy.velocity.set(0, 0, 0);
        }
        return;
    }

    for (const enemy of world.with('isEnemy', 'position', 'velocity')) {
        // 1. CHASE: Calculate Direction to Player
        const direction = new THREE.Vector3()
            .subVectors(player.position, enemy.position);
        direction.y = 0; // Flatten chase vector

        if (direction.lengthSq() > 0.1) {
            direction.normalize().multiplyScalar(ENEMY_SPEED);
            enemy.velocity.copy(direction);
        }

        // 2. SEPARATION: Don't stack on top of each other
        for (const otherEnemy of world.with('isEnemy', 'position')) {
            if (enemy === otherEnemy) continue;

            const dist = enemy.position.distanceToSquared(otherEnemy.position);

            // If overlapping (distance < 1.0)
            if (dist < 1.0) {
                const push = new THREE.Vector3()
                    .subVectors(enemy.position, otherEnemy.position);

                push.y = 0; // <--- CRITICAL FIX: Flatten the push force!

                push.normalize().multiplyScalar(SEPARATION_FORCE);
                enemy.velocity.add(push);
            }
        }
    }
}