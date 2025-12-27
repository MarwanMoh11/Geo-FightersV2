import { world } from '../core/world';
import * as THREE from 'three';

export function CollisionSystem(scene: THREE.Scene) {
    // A. Bullet vs Enemy
    const enemies = world.with('isEnemy', 'position', 'health');
    const bullets = world.with('isProjectile', 'position');

    // Brute force check (Fine for < 100 objects)
    for (const bullet of bullets) {
        for (const enemy of enemies) {
            const distance = bullet.position.distanceTo(enemy.position);

            // Hit Radius: 0.8 units
            if (distance < 0.8) {
                // 1. Damage Enemy
                enemy.health.current -= 10; // 1 shot kill for now

                // 2. Destroy Bullet (It absorbed the hit)
                despawn(bullet, scene);

                // 3. Check Enemy Death
                if (enemy.health.current <= 0) {
                    despawn(enemy, scene);
                    // Optional: Spawn particle effect here later
                }

                break; // Bullet hit something, stop checking other enemies
            }
        }
    }

    // B. Enemy vs Player
    const player = world.with('isPlayer', 'position').first;
    if (player) {
        for (const enemy of enemies) {
            const distance = player.position.distanceTo(enemy.position);

            // Player Hit Radius
            if (distance < 1.0) {
                console.log("%c GAME OVER ", "background: red; color: white; font-size: 20px");
                // For now, we just respawn the enemy away so you don't get log-spammed
                enemy.position.x += 20;
                // Later: world.remove(player) or Trigger Game Over State
            }
        }
    }
}

// Helper to clean up entities
function despawn(entity: any, scene: THREE.Scene) {
    if (entity.transform) {
        scene.remove(entity.transform);
    }
    world.remove(entity);
}