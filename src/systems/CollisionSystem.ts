/**
 * CollisionSystem - VS-Style Optimized
 *
 * Optimizations applied:
 * 1. Squared distance checks (no sqrt)
 * 2. Reusable vectors (no per-frame allocations)
 * 3. One-way collision (bullets check enemies)
 * 4. Early-out on dead enemies
 * 5. Batch geometry damage for AoE
 */

import { world } from '../core/world';
import * as THREE from 'three';
import { addTrauma } from './CameraSystem';
import { spawnXP } from '../core/factories';
import { triggerGameOver } from './GameManager';
import { playExplosion } from '../core/audio';
import { reportDamageTaken, reportKill } from '../core/FlowStateManager';
import { spawnChest } from './ChestSystem';
import { removeBody } from '../core/RapierWorld';

// --- REUSABLE VECTORS (Zero GC pressure) ---
const _pushDir = new THREE.Vector3();
const _blastDir = new THREE.Vector3();
const _tempVec = new THREE.Vector3();

// --- PRECOMPUTED SQUARED RADII ---
const BULLET_HIT_RADIUS_SQ = 0.8 * 0.8;
const PLAYER_HIT_RADIUS_SQ = 1.0 * 1.0;

export function CollisionSystem(scene: THREE.Scene) {
  // Cache enemy array once per frame
  const enemies = Array.from(world.with('isEnemy', 'position', 'health', 'velocity'));
  const bullets = Array.from(world.with('isProjectile', 'position', 'velocity', 'projectile'));

  // Early out if no entities
  if (enemies.length === 0) return;

  // A. Bullet vs Enemy (One-way: bullets check enemies)
  for (let b = bullets.length - 1; b >= 0; b--) {
    const bullet = bullets[b];
    if (!bullet.projectile) continue;

    let bulletDead = false;

    for (let e = enemies.length - 1; e >= 0; e--) {
      const enemy = enemies[e];

      // EARLY OUT: Dead enemy
      if (!enemy.health || enemy.health.current <= 0) continue;

      // PIERCE CHECK: Already hit
      if (enemy.id && bullet.projectile.hitList.includes(enemy.id)) continue;

      // SQUARED DISTANCE (No sqrt!)
      const dx = bullet.position.x - enemy.position.x;
      const dz = bullet.position.z - enemy.position.z;
      const distSq = dx * dx + dz * dz;

      // DIRECT HIT
      if (distSq < BULLET_HIT_RADIUS_SQ) {
        // 1. APPLY DAMAGE
        applyDamage(
          enemy,
          bullet.damage || 1,
          bullet.velocity,
          bullet.projectile.knockback,
          scene,
          enemies,
          e,
        );

        // 2. REGISTER HIT
        bullet.projectile.hitList.push(enemy.id!);
        bullet.projectile.pierce -= 1;

        // 3. EXPLOSION LOGIC (Geometry-based AoE damage)
        if (bullet.projectile.explodeRadius > 0) {
          const blastRadiusSq = bullet.projectile.explodeRadius * bullet.projectile.explodeRadius;
          spawnBlastFX(bullet.position, bullet.projectile.explodeRadius, scene);
          addTrauma(0.3);
          playExplosion();

          // Check if this is a confusion weapon (Signal Hijacker)
          const confusionDuration = bullet.projectile.confusionDuration || 0;

          // Batch damage/confuse all enemies in blast radius
          for (let t = enemies.length - 1; t >= 0; t--) {
            if (t === e) continue; // Already hit
            const target = enemies[t];
            if (!target.health || target.health.current <= 0) continue;

            const tdx = target.position.x - bullet.position.x;
            const tdz = target.position.z - bullet.position.z;
            const tDistSq = tdx * tdx + tdz * tdz;

            if (tDistSq < blastRadiusSq) {
              if (confusionDuration > 0) {
                // Apply confusion (Signal Hijacker effect)
                target.confusedTimer = confusionDuration;
                target.hitFlashTimer = 0.2;
                console.log(`[Signal Hijacker] Confused enemy for ${confusionDuration}s`);
              } else {
                // Normal AoE damage
                _blastDir.set(tdx, 0, tdz).normalize();
                applyDamage(
                  target,
                  bullet.damage || 1,
                  _blastDir.multiplyScalar(20),
                  10,
                  scene,
                  enemies,
                  t,
                );
              }
            }
          }
        }

        // 4. BULLET DEATH
        if (bullet.projectile.explodeRadius > 0 || bullet.projectile.pierce <= 0) {
          despawn(bullet, scene);
          bulletDead = true;
          break;
        }
      }
    }

    if (bulletDead) continue;
  }

  // B. Enemy vs Player (One check per enemy)
  const player = world.with('isPlayer', 'position', 'health').first;
  if (player && player.health && player.health.current > 0) {
    const px = player.position.x;
    const pz = player.position.z;

    for (let e = 0; e < enemies.length; e++) {
      const enemy = enemies[e];
      if (!enemy.health || enemy.health.current <= 0) continue;

      // SQUARED DISTANCE
      const dx = px - enemy.position.x;
      const dz = pz - enemy.position.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < PLAYER_HIT_RADIUS_SQ) {
        // Apply armor reduction from passive stats
        const baseDamage = 5;
        const armor = player.stats?.armor || 0;
        const actualDamage = Math.max(1, baseDamage - armor); // Minimum 1 damage

        player.health.current -= actualDamage;
        reportDamageTaken(actualDamage);
        addTrauma(0.5);

        // Reuse vector for push
        _pushDir.set(-dx, 0, -dz).normalize().multiplyScalar(5);
        enemy.velocity.add(_pushDir);
        enemy.stunTimer = 0.5;

        if (player.health.current <= 0) {
          triggerGameOver();
          return;
        }
      }
    }
  }
}

// --- HELPER: Damage Application (with array mutation awareness) ---
function applyDamage(
  enemy: any,
  dmg: number,
  vel: THREE.Vector3,
  knockback: number,
  scene: THREE.Scene,
  _enemies: any[],
  _index: number,
) {
  if (!enemy.health) return;
  enemy.health.current -= dmg;

  // Juice
  enemy.hitFlashTimer = 0.1;
  _pushDir.copy(vel).normalize();
  _pushDir.y = 0;
  enemy.velocity.add(_pushDir.multiplyScalar(knockback));
  enemy.stunTimer = 0.2;

  // Death
  if (enemy.health.current <= 0) {
    reportKill();
    spawnExplosionFX(enemy.position, scene);
    spawnXP(scene, enemy.position.x, enemy.position.z, enemy.xpValue || 10);

    // === CHEST DROPS BY ENEMY TYPE ===
    const type = enemy.enemyType;
    const px = enemy.position.x;
    const pz = enemy.position.z;

    // Standard elite (1 chest)
    if (type === 'firewall' || type === 'enforcer' || type === 'warden') {
      const roll = Math.random();
      const rarity = roll < 0.7 ? 'common' : roll < 0.95 ? 'rare' : 'epic';
      spawnChest(scene, px, pz, rarity as 'common' | 'rare' | 'epic');
      console.log(`[Chest] ${type} dropped ${rarity} chest`);
    }
    // Mid-tier elite (1 rare chest)
    else if (type === 'colossus') {
      spawnChest(scene, px, pz, 'rare');
      console.log(`[Chest] ${type} dropped rare chest`);
    }
    // Mini-boss HYDRA (3 chests)
    else if (type === 'hydra') {
      for (let i = 0; i < 3; i++) {
        const offset = (i - 1) * 1.5;
        spawnChest(scene, px + offset, pz, 'rare');
      }
      console.log(`[Chest] HYDRA dropped 3 rare chests!`);
    }
    // Major boss OVERSEER (5 chests)
    else if (type === 'overseer') {
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const dist = 2;
        spawnChest(scene, px + Math.cos(angle) * dist, pz + Math.sin(angle) * dist, 'epic');
      }
      console.log(`[Chest] OVERSEER dropped 5 epic chests!`);
    }

    despawn(enemy, scene);
  }
}

// --- FX (Shared geometry) ---
const explosionGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const explosionMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });

// Pre-allocate particle velocity vectors
const _particleVels: THREE.Vector3[] = [];
for (let i = 0; i < 5; i++) {
  _particleVels.push(new THREE.Vector3());
}

function spawnExplosionFX(pos: THREE.Vector3, scene: THREE.Scene) {
  const particleCount = 5;
  for (let i = 0; i < particleCount; i++) {
    // Reuse pre-allocated vector
    _particleVels[i].set(
      (Math.random() - 0.5) * 15,
      Math.random() * 8 + 2,
      (Math.random() - 0.5) * 15,
    );
    const mesh = new THREE.Mesh(explosionGeo, explosionMat);
    mesh.position.copy(pos);
    scene.add(mesh);
    world.add({
      isParticle: true,
      position: mesh.position,
      velocity: _particleVels[i].clone(), // Must clone for entity
      transform: mesh,
      lifeTimer: 0,
      maxLife: 0.3,
    });
  }
}

const blastGeo = new THREE.RingGeometry(0.1, 0.2, 16);
const blastMat = new THREE.MeshBasicMaterial({
  color: 0x9900ff,
  transparent: true,
  opacity: 0.8,
  side: THREE.DoubleSide,
});

function spawnBlastFX(pos: THREE.Vector3, radius: number, scene: THREE.Scene) {
  const mesh = new THREE.Mesh(blastGeo, blastMat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(pos);
  mesh.position.y = 0.5;
  scene.add(mesh);

  world.add({
    isParticle: true,
    position: pos.clone(),
    velocity: _tempVec.set(radius * 5, 0, 0).clone(),
    transform: mesh,
    lifeTimer: 0.3,
    maxLife: 0.3,
  });
}

function despawn(entity: any, scene: THREE.Scene) {
  if (entity.transform) scene.remove(entity.transform);

  // Clean up Rapier rigid body
  if (entity.rigidBody) {
    removeBody(entity.rigidBody);
    entity.rigidBody = undefined;
    entity.collider = undefined;
  }

  world.remove(entity);
}
