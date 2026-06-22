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
import { WEAPONS } from '../core/WeaponRegistry';
import { spawnXP } from '../core/factories';
import { triggerGameOver } from './GameManager';
import { playExplosion, playHurt } from '../core/audio';
import { reportDamageTaken, reportKill } from '../core/FlowStateManager';
import { spawnChest } from './ChestSystem';
import { uiState } from '../core/UIState.svelte.ts';
import { spawnDamageNumber } from './DamageNumberSystem';
import { haptics } from '../core/haptics';
import { dlog } from '../core/debug';
import {
  removeBody,
  getEventQueue,
  getEntityByColliderHandle,
  isRapierInitialized,
} from '../core/RapierWorld';

// --- REUSABLE VECTORS & ARRAYS (Zero GC pressure) ---
const _pushDir = new THREE.Vector3();
const _blastDir = new THREE.Vector3();
const _tempVec = new THREE.Vector3();
const _nearbyEnemies: any[] = [];

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
  const projectile =
    e1.isProjectile && !e1.isEnemyProjectile
      ? e1
      : e2.isProjectile && !e2.isEnemyProjectile
        ? e2
        : null;
  const enemyProjectile = e1.isEnemyProjectile ? e1 : e2.isEnemyProjectile ? e2 : null;
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

  // C. ENEMY PROJECTILE VS PLAYER
  if (enemyProjectile && player) {
    handleEnemyProjectilePlayerCollision(enemyProjectile, player, scene);
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
    'enemy',
    bullet.weaponId,
    bullet.weapon?.bulletColor,
  );

  // Spark FX on impact
  spawnImpactFX(bullet.position, scene, bullet.weaponId, bullet.weapon?.bulletColor, 2);

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

    _nearbyEnemies.length = 0;
    for (const target of world.with('isEnemy', 'position', 'health')) {
      _nearbyEnemies.push(target);
    }

    for (const target of _nearbyEnemies) {
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
          applyDamage(
            target,
            bullet.damage || 1,
            _blastDir.multiplyScalar(20),
            10,
            scene,
            'aoe',
            bullet.weaponId,
            bullet.weapon?.bulletColor,
          );
        }
      }
    }
  }

  // 4. BULLET DEATH
  if (bullet.projectile.explodeRadius > 0 || bullet.projectile.pierce <= 0) {
    despawn(bullet, scene);
  }
}

// How long the player is untouchable after taking a hit
const PLAYER_IFRAME_DURATION = 0.8;

function handleEnemyPlayerCollision(enemy: any, player: any, _scene: THREE.Scene) {
  if (!enemy.health || enemy.health.current <= 0 || !player.health || player.health.current <= 0)
    return;

  // I-FRAMES: ignore contact while the post-hit window is active
  if (player.invulnTimer && player.invulnTimer > 0) return;

  // INVULNERABILITY: ignore contact while player is in a menu (paused/upgrading)
  if (
    player.isUpgrading ||
    (player.isLocalPlayer && (uiState.showUpgrade || uiState.gameState === 'PAUSED'))
  ) {
    return;
  }

  const baseDamage = 5;
  const armor = player.stats?.armor || 0;
  const actualDamage = Math.max(1, baseDamage - armor);

  player.health.current -= actualDamage;
  player.invulnTimer = PLAYER_IFRAME_DURATION;
  player.hitFlashTimer = 0.15;
  reportDamageTaken(actualDamage);
  addTrauma(0.45);
  playHurt();
  haptics.hit();
  spawnDamageNumber(player.position, actualDamage, 'player');
  uiState.damageFlash++; // drives the HUD red vignette

  const dx = player.position.x - enemy.position.x;
  const dz = player.position.z - enemy.position.z;

  // Knock the player away from the impact (decays in PlayerControlSystem)
  if (!player.knockback) player.knockback = new THREE.Vector3();
  _tempVec.set(dx, 0, dz).normalize().multiplyScalar(9);
  player.knockback.add(_tempVec);

  // Knock enemy back a bit
  _pushDir.set(-dx, 0, -dz).normalize().multiplyScalar(5);
  enemy.velocity.add(_pushDir);
  enemy.stunTimer = 0.5;

  if (player.health.current <= 0) {
    // Cooperative multiplayer check: only game over if ALL players are dead
    let anyAlive = false;
    for (const p of world.with('isPlayer', 'health')) {
      if (p.health && p.health.current > 0) {
        anyAlive = true;
        break;
      }
    }
    if (!anyAlive) {
      triggerGameOver();
    }
  }
}

function handleEnemyProjectilePlayerCollision(bullet: any, player: any, scene: THREE.Scene) {
  if (!player.health || player.health.current <= 0) return;

  // I-FRAMES: ignore contact while the post-hit window is active
  if (player.invulnTimer && player.invulnTimer > 0) return;

  // INVULNERABILITY: ignore contact while player is in a menu (paused/upgrading)
  if (
    player.isUpgrading ||
    (player.isLocalPlayer && (uiState.showUpgrade || uiState.gameState === 'PAUSED'))
  ) {
    return;
  }

  const baseDamage = bullet.damage || 8;
  const armor = player.stats?.armor || 0;
  const actualDamage = Math.max(1, baseDamage - armor);

  player.health.current -= actualDamage;
  player.invulnTimer = PLAYER_IFRAME_DURATION;
  player.hitFlashTimer = 0.15;
  reportDamageTaken(actualDamage);
  addTrauma(0.35);
  playHurt();
  haptics.hit();
  spawnDamageNumber(player.position, actualDamage, 'player');
  uiState.damageFlash++; // drives the HUD red vignette

  // Knock the player back slightly based on bullet velocity
  if (bullet.velocity) {
    if (!player.knockback) player.knockback = new THREE.Vector3();
    _tempVec.copy(bullet.velocity).normalize().multiplyScalar(6);
    player.knockback.add(_tempVec);
  }

  // Clear projectile
  despawn(bullet, scene);

  if (player.health.current <= 0) {
    let anyAlive = false;
    for (const p of world.with('isPlayer', 'health')) {
      if (p.health && p.health.current > 0) {
        anyAlive = true;
        break;
      }
    }
    if (!anyAlive) {
      triggerGameOver();
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
  variant: 'enemy' | 'aoe' = 'enemy',
  weaponId?: string,
  bulletColor?: number,
) {
  if (!enemy.health) return;

  if (enemy.isBoss) {
    // Boss takes real damage and can now be killed. Death/cleanup is owned by
    // FinaleBossSystem (it manages the boss entity, rapier body and victory
    // trigger), so we only apply the damage here — no knockback/stun, and no
    // generic enemy death/XP/chest handling.
    enemy.health.current -= dmg;
    spawnDamageNumber(enemy.position, dmg, variant);
    enemy.hitFlashTimer = 0.1;
    return;
  }

  enemy.health.current -= dmg;
  spawnDamageNumber(enemy.position, dmg, variant);

  // Juice
  enemy.hitFlashTimer = 0.1;
  _pushDir.copy(vel).normalize();
  _pushDir.y = 0;
  enemy.velocity.add(_pushDir.multiplyScalar(knockback));
  enemy.stunTimer = 0.2;

  // Death
  if (enemy.health.current <= 0) {
    reportKill();
    uiState.kills++;
    spawnImpactFX(enemy.position, scene, weaponId, bulletColor, 6);
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
      dlog(`[Chest] ${type} dropped ${rarity} chest`);
    }
    // Mid-tier elite (1 rare chest)
    else if (type === 'colossus') {
      spawnChest(scene, px, pz, 'rare');
      dlog(`[Chest] ${type} dropped rare chest`);
    }
    // Mini-boss HYDRA (3 chests)
    else if (type === 'hydra') {
      for (let i = 0; i < 3; i++) {
        const offset = (i - 1) * 1.5;
        spawnChest(scene, px + offset, pz, 'rare');
      }
      dlog(`[Chest] HYDRA dropped 3 rare chests!`);
    }
    // Major boss OVERSEER (5 chests)
    else if (type === 'overseer') {
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const dist = 2;
        spawnChest(scene, px + Math.cos(angle) * dist, pz + Math.sin(angle) * dist, 'epic');
      }
      dlog(`[Chest] OVERSEER dropped 5 epic chests!`);
    }

    despawn(enemy, scene);
  }
}

function spawnImpactFX(
  pos: THREE.Vector3,
  _scene: THREE.Scene,
  weaponId?: string,
  color?: number,
  count: number = 5,
) {
  const finalColor = color ?? (weaponId ? WEAPONS[weaponId]?.color : 0xff0055) ?? 0xff0055;

  for (let i = 0; i < count; i++) {
    // Determine scale & shape based on weapon
    let particleScale = 1.0;
    if (weaponId === 'monowire_lash' || weaponId === 'nanofiber_guillotine') {
      particleScale = 1.4;
    } else if (weaponId === 'smart_rail_needles' || weaponId === 'magnetic_railstorm') {
      particleScale = 0.55;
    } else if (weaponId === 'cryo_foam_disperser' || weaponId === 'thermal_collapse') {
      particleScale = 1.35;
    }

    let scaleX = particleScale;
    let scaleY = particleScale;
    let scaleZ = particleScale;

    if (weaponId === 'monowire_lash' || weaponId === 'nanofiber_guillotine') {
      scaleX = 0.03 * particleScale;
      scaleY = 0.03 * particleScale;
      scaleZ = 0.3 * particleScale;
    }

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * (weaponId ? 18 : 15),
      Math.random() * 8 + 2,
      (Math.random() - 0.5) * (weaponId ? 18 : 15),
    );

    world.add({
      isParticle: true,
      isInstancedParticle: true,
      position: pos.clone(),
      velocity: vel,
      scaleX,
      scaleY,
      scaleZ,
      rotationX: 0,
      rotationZ: 0,
      lifeTimer: 0,
      maxLife: 0.22 + Math.random() * 0.15,
      // Randomized tumble so each shard spins differently
      spinX: (Math.random() - 0.5) * 20,
      spinZ: (Math.random() - 0.5) * 14,
      particleColor: finalColor,
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
  // Clone the material so the fade-out doesn't affect other live rings
  const mesh = new THREE.Mesh(blastGeo, blastMat.clone());
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(pos);
  mesh.position.y = 0.5;
  scene.add(mesh);

  world.add({
    isParticle: true,
    position: pos.clone(),
    velocity: new THREE.Vector3(0, 0, 0),
    transform: mesh,
    lifeTimer: 0,
    maxLife: 0.35,
    // RingGeometry outer radius is 0.2, so scale to reach the blast radius
    ringGrow: radius / 0.2 - 1,
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
