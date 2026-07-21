import { world } from '../core/world';
import { getBlockingObstacles, checkAABBCollision, getCurrentLevel } from '../core/LevelData';
import { stepPhysics, isRapierInitialized } from '../core/RapierWorld';

// Entity collision radius (hitbox size)
const PLAYER_RADIUS = 0.8;
const ENEMY_RADIUS = 0.6;
const DEFAULT_RADIUS = 0.5;
const PROJECTILE_RADIUS = 0.3;

export function PhysicsSystem(dt: number) {
  const obstacles = getBlockingObstacles();
  const level = getCurrentLevel();
  const mapHalfW = level.mapWidth / 2;
  const mapHalfH = level.mapHeight / 2;

  // --- RAPIER PHYSICS STEP ---
  if (isRapierInitialized()) {
    // 1. Prepare Kinematic Targets (Tell Rapier where we WANT to go)
    for (const entity of world.with('rigidBody', 'position', 'velocity')) {
      // Calculate next desired position based on velocity
      const nextPos = entity.position.clone().add(entity.velocity.clone().multiplyScalar(dt));

      entity.rigidBody!.setNextKinematicTranslation({
        x: nextPos.x,
        y: 0.5,
        z: nextPos.z,
      });
    }

    // 2. Step Simulation (Rapier moves bodies and resolves collisions)
    stepPhysics(dt);

    // 3. Sync Rapier Positions back to ECS (Get actual result after collision)
    for (const entity of world.with('rigidBody', 'position')) {
      const pos = entity.rigidBody!.translation();
      entity.position.set(pos.x, 0.5, pos.z);

      // Sync to visual transform
      if (entity.transform) {
        entity.transform.position.copy(entity.position);
      }
    }
  }

  // --- LEGACY OBSTACLE / BOUNDARY FALLBACK ---
  // AABB collision is still required for static obstacles because Rapier kinematic bodies
  // do not automatically respond to static collisions (they only report them).
  for (const entity of world.with('position', 'velocity')) {
    // 1. Move (Rapier entities already moved by setNextKinematicTranslation, this handles legacy ones)
    if (!entity.rigidBody) {
      entity.position.add(entity.velocity.clone().multiplyScalar(dt));
    } else {
      // For Rapier entities, we must fetch the LATEST position from the physics step
      // to ensure AABB clamping works on the post-physics position
      const pos = entity.rigidBody.translation();
      entity.position.set(pos.x, 0.5, pos.z);
    }

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
            entity.lifeTimer = entity.maxLife; // Die instantly
          }
          break;
        }
      }
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
      -mapHalfW + boundaryPadding,
      Math.min(mapHalfW - boundaryPadding, entity.position.x),
    );
    entity.position.z = Math.max(
      -mapHalfH + boundaryPadding,
      Math.min(mapHalfH - boundaryPadding, entity.position.z),
    );

    // Sync transform
    if (entity.transform) {
      entity.transform.position.copy(entity.position);
    }
  }
}
