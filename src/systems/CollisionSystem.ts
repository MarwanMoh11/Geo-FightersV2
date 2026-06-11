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
import {
  removeBody,
  getEventQueue,
  getEntityByColliderHandle,
  isRapierInitialized,
} from '../core/RapierWorld';

// --- REUSABLE VECTORS (Zero GC pressure) ---
const _pushDir = new THREE.Vector3();
const _blastDir = new THREE.Vector3();
const _tempVec = new THREE.Vector3();

export function CollisionSystem(scene: THREE.Scene) {
  // --- RAPIER EVENT-DRIVEN COLLISION ---
  if (!isRapierInitialized()) return;

  try {
    const eventQueue = getEventQueue();

    // 1. DRAIN COLLISION EVENTS (Solid vs Solid & Sensor vs Solid)
    eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      processCollision(h1, h2, scene);
    });
  } catch {
    // Fail silently if physics not yet initialized
  }
}

function processCollision(h1: number, h2: number, scene: THREE.Scene) {
  const e1 = world.get(getEntityByColliderHandle(h1) as any);
  const e2 = world.get(getEntityByColliderHandle(h2) as any);

  if (!e1 || !e2) return;

  // Determine roles
  const projectile = e1.isProjectile ? e1 : e2.isProjectile ? e2 : null;
  const enemy = e1.isEnemy ? e1 : e2.isEnemy ? e2 : null;
  const player = e1.isPlayer ? e1 : e2.isPlayer ? e2 : null;

  // A. BULLET VS ENEMY
  if (projectile && enemy) {
    handleProjectileEnemyCollision(projectile, enemy, scene);
  }

  // B. ENEMY VS PLAYER
  if (enemy && player) {
    handleEnemyPlayerCollision(enemy, player, scene);
  }
}

function handleProjectileEnemyCollision(bullet: any, enemy: any, scene: THREE.Scene) {
  if (!bullet.projectile || !enemy.health || enemy.health.current <= 0) return;

  // PIERCE CHECK: Already hit
  if (enemy.id && bullet.projectile.hitList.includes(enemy.id)) return;

  // 1. APPLY DAMAGE
  applyDamage(
    enemy,
    bullet.damage || 1,
    bullet.velocity || new THREE.Vector3(0, 0, 0),
    bullet.projectile.knockback,
    scene,
  );

  // 2. REGISTER HIT
  bullet.projectile.hitList.push(enemy.id!);
  bullet.projectile.pierce -= 1;

  // 3. EXPLOSION LOGIC (AoE)
  if (bullet.projectile.explodeRadius > 0) {
    const blastRadiusSq = bullet.projectile.explodeRadius * bullet.projectile.explodeRadius;
    spawnBlastFX(bullet.position, bullet.projectile.explodeRadius, scene);
    addTrauma(0.3);
    playExplosion();

    const confusionDuration = bullet.projectile.confusionDuration || 0;
    const enemies = Array.from(world.with('isEnemy', 'position', 'health'));

    for (const target of enemies) {
      if (target === enemy) continue;
      if (!target.health || target.health.current <= 0) continue;

      const dx = target.position.x - bullet.position.x;
      const dz = target.position.z - bullet.position.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < blastRadiusSq) {
        if (confusionDuration > 0) {
          target.confusedTimer = confusionDuration;
          target.hitFlashTimer = 0.2;
        } else {
          _blastDir.set(dx, 0, dz).normalize();
          applyDamage(target, bullet.damage || 1, _blastDir.multiplyScalar(20), 10, scene);
        }
      }
    }
  }

  // 4. BULLET DEATH
  if (bullet.projectile.explodeRadius > 0 || bullet.projectile.pierce <= 0) {
    despawn(bullet, scene);
  }
}

function handleEnemyPlayerCollision(enemy: any, player: any, _scene: THREE.Scene) {
  if (!enemy.health || enemy.health.current <= 0 || !player.health || player.health.current <= 0)
    return;

  const baseDamage = 5;
  const armor = player.stats?.armor || 0;
  const actualDamage = Math.max(1, baseDamage - armor);

  player.health.current -= actualDamage;
  reportDamageTaken(actualDamage);
  addTrauma(0.5);

  // Knock enemy back a bit
  const dx = player.position.x - enemy.position.x;
  const dz = player.position.z - enemy.position.z;
  _pushDir.set(-dx, 0, -dz).normalize().multiplyScalar(5);
  enemy.velocity.add(_pushDir);
  enemy.stunTimer = 0.5;

  if (player.health.current <= 0) {
    triggerGameOver();
  }
}

// --- HELPER: Damage Application (with array mutation awareness) ---
function applyDamage(
  enemy: any,
  dmg: number,
  vel: THREE.Vector3,
  knockback: number,
  scene: THREE.Scene,
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
