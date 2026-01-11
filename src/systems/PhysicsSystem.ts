import { world } from '../core/world';
import {
  getBlockingObstacles,
  checkAABBCollision,
  MAP_HALF_WIDTH,
  MAP_HALF_HEIGHT,
} from '../core/LevelData';
import { stepPhysics, isRapierInitialized } from '../core/RapierWorld';

// Entity collision radius (hitbox size)
const PLAYER_RADIUS = 0.8;
const ENEMY_RADIUS = 0.6;
const DEFAULT_RADIUS = 0.5;
const PROJECTILE_RADIUS = 0.3;

export function PhysicsSystem(dt: number) {
  const obstacles = getBlockingObstacles();

  // Process ALL entities with position/velocity
  for (const entity of world.with('position', 'velocity')) {
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

    // 4. OBSTACLE COLLISION (AABB - works for all entities)
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

    // 6. Sync position to Rapier body (for entity-entity collision detection)
    if (entity.rigidBody) {
      entity.rigidBody.setNextKinematicTranslation({
        x: entity.position.x,
        y: 0.5,
        z: entity.position.z
      });
    }

    // 7. Sync to visual transform
    if (entity.transform) {
      entity.transform.position.copy(entity.position);
    }
  }

  // Step Rapier world (for future entity-entity collision events)
  if (isRapierInitialized()) {
    stepPhysics(dt);
  }
}
