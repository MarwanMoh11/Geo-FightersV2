import { world } from '../core/world';
import {
  getBlockingObstacles,
  checkAABBCollision,
  MAP_HALF_WIDTH,
  MAP_HALF_HEIGHT,
} from '../core/LevelData';
import { stepPhysics, isRapierInitialized } from '../core/RapierWorld';

// Entity collision radius (hitbox size) - for legacy fallback
const PLAYER_RADIUS = 0.8;
const ENEMY_RADIUS = 0.6;
const DEFAULT_RADIUS = 0.5;
const PROJECTILE_RADIUS = 0.3;

export function PhysicsSystem(dt: number) {
  // --- RAPIER PHYSICS ---
  if (isRapierInitialized()) {
    // 1. Calculate next position for kinematic bodies and update Rapier
    for (const entity of world.with('rigidBody', 'position', 'velocity')) {
      // Calculate next position using ECS velocity
      const nextX = entity.position.x + entity.velocity.x * dt;
      const nextZ = entity.position.z + entity.velocity.z * dt;

      // Tell Rapier where we want to move (it will handle collision)
      entity.rigidBody!.setNextKinematicTranslation({ x: nextX, y: 0.5, z: nextZ });
    }

    // 2. Step physics world
    stepPhysics(dt);

    // 3. Sync positions from Rapier back to ECS (Rapier resolves collisions)
    for (const entity of world.with('rigidBody', 'position')) {
      const pos = entity.rigidBody!.translation();
      entity.position.set(pos.x, 0.5, pos.z);

      // Sync to visual transform
      if (entity.transform) {
        entity.transform.position.copy(entity.position);
      }
    }
  }

  // --- LEGACY FALLBACK (for entities without rigidBody) ---
  const obstacles = getBlockingObstacles();

  for (const entity of world.with('position', 'velocity')) {
    // Skip entities managed by Rapier
    if (entity.rigidBody) continue;

    // 1. Move
    entity.position.add(entity.velocity.clone().multiplyScalar(dt));

    // 2. PROJECTILE WALL COLLISION
    if (entity.isProjectile) {
      for (const obstacle of obstacles) {
        const collision = checkAABBCollision(
          entity.position.x,
          entity.position.z,
          PROJECTILE_RADIUS,
          obstacle,
        );

        if (collision.colliding) {
          if (entity.lifeTimer !== undefined && entity.maxLife !== undefined) {
            entity.lifeTimer = entity.maxLife;
          }
          break;
        }
      }
      continue;
    }

    // 3. GROUND CLAMP
    entity.position.y = 0.5;
    entity.velocity.y = 0;

    // 4. OBSTACLE COLLISION
    const radius = entity.isPlayer ? PLAYER_RADIUS : entity.isEnemy ? ENEMY_RADIUS : DEFAULT_RADIUS;

    for (const obstacle of obstacles) {
      const collision = checkAABBCollision(entity.position.x, entity.position.z, radius, obstacle);

      if (collision.colliding) {
        entity.position.x += collision.pushX;
        entity.position.z += collision.pushZ;
      }
    }

    // 5. MAP BOUNDARY CLAMPING
    const boundaryPadding = radius;
    entity.position.x = Math.max(
      -MAP_HALF_WIDTH + boundaryPadding,
      Math.min(MAP_HALF_WIDTH - boundaryPadding, entity.position.x),
    );
    entity.position.z = Math.max(
      -MAP_HALF_HEIGHT + boundaryPadding,
      Math.min(MAP_HALF_HEIGHT - boundaryPadding, entity.position.z),
    );
  }
}
