import { world } from '../core/world';
import { getBlockingObstacles, checkAABBCollision, getCurrentLevel } from '../core/LevelData';
import { stepPhysics, isRapierInitialized } from '../core/RapierWorld';

// Entity collision radius (hitbox size)
const PLAYER_RADIUS = 0.8;
const ENEMY_RADIUS = 0.5;
const PROJECTILE_RADIUS = 0.3;

export function PhysicsSystem(dt: number) {
  const obstacles = getBlockingObstacles();
  const level = getCurrentLevel();
  const mapHalfW = level.mapWidth / 2;
  const mapHalfH = level.mapHeight / 2;

  // --- RAPIER PHYSICS STEP (players only — enemies/projectiles are body-free) ---
  if (isRapierInitialized()) {
    for (const entity of world.with('rigidBody', 'position', 'velocity')) {
      entity.rigidBody!.setNextKinematicTranslation({
        x: entity.position.x + entity.velocity.x * dt,
        y: 0.5,
        z: entity.position.z + entity.velocity.z * dt,
      });
    }

    stepPhysics(dt);

    for (const entity of world.with('rigidBody', 'position')) {
      const pos = entity.rigidBody!.translation();
      entity.position.set(pos.x, 0.5, pos.z);

      if (entity.transform) {
        entity.transform.position.copy(entity.position);
      }
    }
  }

  // --- GENERIC MOVEMENT + CLAMPING ---
  // Movement ownership: EnemySystem moves enemies, LootSystem moves XP/credits,
  // ChestSystem moves chests, FinaleBoss moves the boss. This system integrates
  // ONLY projectiles and particles (nothing else owns them), then clamps.
  for (const entity of world.with('position', 'velocity')) {
    const ownedElsewhere = entity.isEnemy || entity.isXP || entity.isChest;
    if (entity.rigidBody) {
      const pos = entity.rigidBody.translation();
      entity.position.set(pos.x, 0.5, pos.z);
    } else if (!ownedElsewhere) {
      // Inline integration — no allocation. Players without a Rapier body
      // (fallback) also take this path, same as the old legacy branch.
      entity.position.x += entity.velocity.x * dt;
      entity.position.z += entity.velocity.z * dt;
    }

    // PROJECTILE WALL COLLISION (dies on obstacle contact)
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
            entity.lifeTimer = entity.maxLife; // Die instantly
          }
          break;
        }
      }
    }

    // GROUND CLAMP
    entity.position.y = 0.5;
    entity.velocity.y = 0;

    // OBSTACLE COLLISION — keep enemies out of walls/vaults/gate structures
    if (entity.isPlayer || entity.isEnemy || entity.isBoss) {
      const radius = entity.isPlayer ? PLAYER_RADIUS : entity.isBoss ? 1.2 : ENEMY_RADIUS;
      for (const obstacle of obstacles) {
        const collision = checkAABBCollision(
          entity.position.x,
          entity.position.z,
          radius,
          obstacle,
        );
        if (collision.colliding) {
          entity.position.x += collision.pushX;
          entity.position.z += collision.pushZ;
        }
      }
    }

    // MAP BOUNDARY CLAMPING — entities that must stay in the arena
    if (entity.isPlayer || entity.isEnemy || entity.isBoss) {
      const radius = entity.isPlayer ? PLAYER_RADIUS : 0.5;
      entity.position.x = Math.max(
        -mapHalfW + radius,
        Math.min(mapHalfW - radius, entity.position.x),
      );
      entity.position.z = Math.max(
        -mapHalfH + radius,
        Math.min(mapHalfH - radius, entity.position.z),
      );
    }

    // Sync transform
    if (entity.transform) {
      entity.transform.position.copy(entity.position);
    }
  }
}
