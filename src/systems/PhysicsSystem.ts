import { world } from '../core/world';
import { getBlockingObstacles, checkAABBCollision, MAP_HALF_WIDTH, MAP_HALF_HEIGHT } from '../core/LevelData';

// Entity collision radius (hitbox size)
const PLAYER_RADIUS = 0.8;
const ENEMY_RADIUS = 0.6;
const DEFAULT_RADIUS = 0.5;
const PROJECTILE_RADIUS = 0.3;

export function PhysicsSystem(dt: number) {
  // Cache obstacles for this frame
  const obstacles = getBlockingObstacles();

  for (const entity of world.with('position', 'velocity')) {
    // 1. Move
    entity.position.add(entity.velocity.clone().multiplyScalar(dt));

    // 2. PROJECTILE WALL COLLISION
    // Projectiles should be destroyed when hitting walls
    if (entity.isProjectile) {
      for (const obstacle of obstacles) {
        const collision = checkAABBCollision(
          entity.position.x,
          entity.position.z,
          PROJECTILE_RADIUS,
          obstacle
        );

        if (collision.colliding) {
          // Mark projectile for immediate removal by setting lifeTimer to max
          if (entity.lifeTimer !== undefined && entity.maxLife !== undefined) {
            entity.lifeTimer = entity.maxLife;  // Will be removed by LifecycleSystem
          }
          break;  // No need to check more obstacles
        }
      }
      continue;  // Skip ground clamp and other checks for projectiles
    }

    // 3. GROUND CLAMP (The Gravity Fix) - for non-projectiles only
    entity.position.y = 0.5; // Hard lock to ground height
    entity.velocity.y = 0; // Cancel any vertical launch forces

    // 4. OBSTACLE COLLISION for player/enemies
    const radius = entity.isPlayer ? PLAYER_RADIUS : (entity.isEnemy ? ENEMY_RADIUS : DEFAULT_RADIUS);

    for (const obstacle of obstacles) {
      const collision = checkAABBCollision(
        entity.position.x,
        entity.position.z,
        radius,
        obstacle
      );

      if (collision.colliding) {
        // Push entity out of obstacle
        entity.position.x += collision.pushX;
        entity.position.z += collision.pushZ;
      }
    }

    // 5. MAP BOUNDARY CLAMPING
    // Keep entities within the playable area
    const boundaryPadding = radius;
    entity.position.x = Math.max(-MAP_HALF_WIDTH + boundaryPadding,
      Math.min(MAP_HALF_WIDTH - boundaryPadding, entity.position.x));
    entity.position.z = Math.max(-MAP_HALF_HEIGHT + boundaryPadding,
      Math.min(MAP_HALF_HEIGHT - boundaryPadding, entity.position.z));
  }
}
