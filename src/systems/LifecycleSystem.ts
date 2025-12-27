import { world } from '../core/world';
import * as THREE from 'three';

export function LifecycleSystem(dt: number, scene: THREE.Scene) {
    // Check anything with a lifeTimer (Projectiles)
    for (const entity of world.with('lifeTimer', 'maxLife')) {
        entity.lifeTimer += dt;

        if (entity.lifeTimer >= entity.maxLife) {
            // 1. Remove Visuals
            if (entity.transform) {
                scene.remove(entity.transform);
                // Ideally traverse and dispose geometries/materials here too
            }

            // 2. Remove Data
            world.remove(entity);
        }
    }
}