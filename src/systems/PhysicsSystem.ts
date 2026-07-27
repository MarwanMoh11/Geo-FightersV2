import { world } from '../core/world';
import {
  getBlockingObstacles,
  collideAABB,
  getCurrentLevel,
  type PushOut,
} from '../core/LevelData';
import { stepPhysics, isRapierInitialized } from '../core/RapierWorld';

// Entity collision radius (hitbox size)
const PLAYER_RADIUS = 0.8;
const ENEMY_RADIUS = 0.5;
const PROJECTILE_RADIUS = 0.3;

/** Shared separation scratch — this loop runs tens of thousands of times a frame. */
const _push: PushOut = { x: 0, z: 0 };

/**
 * Per-frame physics tick: step Rapier for player bodies, integrate projectile
 * movement, resolve obstacle and map-boundary collisions, and sync transforms.
 *
 * @param {number} dt - delta time since last frame in seconds
 */
export function PhysicsSystem(dt: number) {
  const obstacles = getBlockingObstacles();
  const level = getCurrentLevel();
  const mapHalfW = level.mapWidth / 2;
  const mapHalfH = level.mapHeight / 2;

  // --- RAPIER PHYSICS STEP (players only — enemies/projectiles are body-free) ---
  if (isRapierInitialized()) {
    for (const entity of world.with('rigidBody', 'position', 'velocity')) {
      // A remote player's body is placed by HostPlayerSmoothingSystem from the
      // position that client actually reported. Integrating its velocity here
      // too would extrapolate them forward on stale input between packets —
      // and since contact damage is resolved against this body, the joiner
      // gets hit by enemies that are nowhere near them on their own screen.
      if (entity.isPlayer && !entity.isLocalPlayer) continue;
      entity.rigidBody!.setNextKinematicTranslation({
        x: entity.position.x + entity.velocity.x * dt,
        y: 0.5,
        z: entity.position.z + entity.velocity.z * dt,
      });
    }

    stepPhysics(dt);

    for (const entity of world.with('rigidBody', 'position')) {
      if (entity.isPlayer && !entity.isLocalPlayer) continue;
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
    // Remote players are owned by the network smoothing on BOTH sides (the host
    // eases them toward the position that client reported; a client eases them
    // toward the host snapshot). Integrating their replicated velocity here as
    // well extrapolates them past that target every frame.
    const isRemotePlayer = !!entity.isPlayer && !entity.isLocalPlayer;
    const ownedElsewhere = entity.isEnemy || entity.isXP || entity.isChest || isRemotePlayer;
    if (entity.rigidBody && !isRemotePlayer) {
      const pos = entity.rigidBody.translation();
      entity.position.set(pos.x, 0.5, pos.z);
    } else if (!ownedElsewhere) {
      // Inline integration — no allocation. Players without a Rapier body
      // (fallback) also take this path, same as the old legacy branch.
      entity.position.x += entity.velocity.x * dt;
      entity.position.z += entity.velocity.z * dt;
    }

    // PROJECTILE WALL COLLISION (orbital weapons are excluded — they orbit
    // around the player and should not be killed by building proximity)
    if (entity.isProjectile && !entity.isOrbital) {
      for (const obstacle of obstacles) {
        if (collideAABB(entity.position.x, entity.position.z, PROJECTILE_RADIUS, obstacle, _push)) {
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
        if (collideAABB(entity.position.x, entity.position.z, radius, obstacle, _push)) {
          entity.position.x += _push.x;
          entity.position.z += _push.z;
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
