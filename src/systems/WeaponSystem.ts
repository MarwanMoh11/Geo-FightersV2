import { world } from '../core/world';
import * as THREE from 'three';
import { addTrauma } from './CameraSystem';
import { playShoot } from '../core/audio';
import { getDefaultStats, getEffectiveDamage, getEffectiveAmount } from '../core/PlayerStats';
import { spawnOrbitalProjectile } from './OrbitalSystem';
import { createKinematicBody, isRapierInitialized } from '../core/RapierWorld';
import { uiState } from '../core/UIState.svelte.ts';
import { broadcastShoot } from '../core/network';
import { WEAPONS, getWeaponStatsAtLevel } from '../core/WeaponRegistry';
import { createCustomProjectileMesh, updateProjectileVisual } from '../core/projectileVisuals';

const muzzleGeo = new THREE.SphereGeometry(0.4, 8, 8);
const muzzleMaterials = new Map<number, THREE.MeshBasicMaterial>();

function getMuzzleMaterial(color: number): THREE.MeshBasicMaterial {
  let mat = muzzleMaterials.get(color);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.9,
    });
    muzzleMaterials.set(color, mat);
  }
  return mat;
}

const PROJECTILE_RADIUS = 0.3;

// 3. Reusable Math Objects (No "new" keyword in loops!)
const _shootDir = new THREE.Vector3();
const _posVec = new THREE.Vector3();
const _axisY = new THREE.Vector3(0, 1, 0);

export function WeaponSystem(dt: number, scene: THREE.Scene) {
  // 1. PROJECTILE VISUALS & ANIMATIONS
  for (const p of world.with('isProjectile', 'transform', 'projectile')) {
    updateProjectileVisual(p, dt, scene);
  }

  // 2. PLAYER WEAPONS
  const players = Array.from(world.with('isPlayer', 'position', 'aimTarget', 'input', 'modifiers'));
  for (const player of players) {
    const isLocal = player.isLocalPlayer;
    const isHost = uiState.isHost;

    // In multiplayer:
    // - Clients only run firing logic locally for themselves.
    // - Host runs firing logic for ALL players.
    if (!isLocal && !isHost) continue;

    for (const entity of world.with('weapon', 'ownerId')) {
      if (entity.ownerId !== player.id) continue;
      if (!entity.weapon) continue;

      let tickDt = dt;
      if (uiState.overloadActive && uiState.selectedCharacter === 'rail' && player.isLocalPlayer) {
        tickDt = dt * 4;
      }
      if (uiState.insideOverclockZone && player.isLocalPlayer) {
        tickDt *= 2.0;
      }
      if (entity.weapon.cooldownTimer > 0) entity.weapon.cooldownTimer -= tickDt;

      // Orbital and Global weapons auto-fire, other weapons require aim
      const isAutoFire = entity.weapon.category === 'orbit' || entity.weapon.category === 'global';
      const wantsToFire =
        isAutoFire ||
        player.input?.isShooting ||
        (player.aimTarget && player.aimTarget.lengthSq() > 0);

      if (wantsToFire && entity.weapon.cooldownTimer <= 0) {
        fireWeapon(entity, player, scene);
        const mod = player.modifiers?.fireRateMult || 1.0;
        entity.weapon.cooldownTimer = entity.weapon.fireRate * mod;

        // If local player in multiplayer, broadcast shoot event to other clients
        if (isLocal && uiState.isMultiplayer && player.aimTarget) {
          const dir = new THREE.Vector3().subVectors(player.aimTarget, player.position).normalize();
          if (dir.lengthSq() === 0) dir.set(0, 0, 1);
          broadcastShoot({
            weaponId: entity.weaponId || '',
            ownerId: player.id || 0,
            dir: { x: dir.x, z: dir.z },
          });
        }
      }
    }
  }

  // 3. MUZZLE FLASH CLEANUP
  for (const entity of world.with('isParticle', 'lifeTimer', 'transform')) {
    if (
      entity.maxLife &&
      entity.maxLife < 0.2 &&
      entity.transform &&
      entity.lifeTimer !== undefined
    ) {
      entity.lifeTimer -= dt;
      const scale = entity.lifeTimer / entity.maxLife;
      entity.transform.scale.setScalar(scale);
      if (entity.lifeTimer <= 0) {
        scene.remove(entity.transform);
        world.remove(entity);
      }
    }
  }
}

function fireWeapon(weaponEntity: any, owner: any, scene: THREE.Scene) {
  const weaponStats = weaponEntity.weapon;
  const playerStats = owner.stats || getDefaultStats();

  // Calculate Direction based on weapon category
  if (weaponStats.category === 'global') {
    // Global weapons target the nearest enemy
    const enemies = Array.from(world.with('isEnemy', 'position', 'health'));
    let nearestEnemy = null;
    let nearestDistSq = Infinity;

    for (const enemy of enemies) {
      if (!enemy.health || enemy.health.current <= 0) continue;
      const dx = enemy.position.x - owner.position.x;
      const dz = enemy.position.z - owner.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearestEnemy = enemy;
      }
    }

    if (nearestEnemy) {
      _shootDir.subVectors(nearestEnemy.position, owner.position).normalize();
    } else {
      // No enemies, fire in random direction
      const angle = Math.random() * Math.PI * 2;
      _shootDir.set(Math.cos(angle), 0, Math.sin(angle));
    }
  } else {
    // Normal weapons fire toward aim target
    _shootDir.subVectors(owner.aimTarget, owner.position).normalize();
  }

  if (_shootDir.lengthSq() === 0) _shootDir.set(0, 0, 1);

  // Feedback
  const isHeavy = weaponStats.bulletCount > 1 || weaponStats.knockback > 15;
  addTrauma(isHeavy ? 0.25 : 0.05);
  playShoot();

  // Muzzle Flash
  const flashMesh = new THREE.Mesh(muzzleGeo, getMuzzleMaterial(weaponStats.bulletColor));

  // Position: Owner + (Dir * 0.8)
  _posVec.copy(_shootDir).multiplyScalar(0.8).add(owner.position);
  flashMesh.position.copy(_posVec);

  scene.add(flashMesh);
  world.add({
    isParticle: true,
    position: flashMesh.position,
    velocity: new THREE.Vector3(),
    transform: flashMesh,
    lifeTimer: 0.08,
    maxLife: 0.08,
  });

  // Spawn Projectiles - Apply global stats
  const baseCount = weaponStats.bulletCount || 1;
  const count = getEffectiveAmount(baseCount, playerStats);
  const spread = weaponStats.bulletSpread || 0;

  // Apply might multiplier to damage
  const baseDamage = weaponStats.damage || 1;
  const finalDamage = getEffectiveDamage(baseDamage, playerStats);

  let finalSpeed = weaponStats.bulletSpeed * playerStats.projectileSpeed;
  if (uiState.insideOverclockZone && owner.isLocalPlayer) {
    finalSpeed *= 1.5;
  }
  const style = weaponStats.visualStyle || 'BOLT';
  const pierce = weaponStats.bulletPierce || 1;

  // ORBITAL WEAPONS: Spawn orbiting projectiles instead of regular projectiles
  if (weaponStats.category === 'orbit') {
    spawnOrbitalProjectile(
      scene,
      owner,
      count,
      finalDamage,
      weaponStats.bulletColor,
      style,
      weaponStats.bulletWidth || 0.3,
      weaponStats.bulletLength || 1.0,
      finalSpeed * 0.3, // Use speed as orbit speed (scaled down)
      weaponEntity.weaponId, // Pass the weapon ID
    );
    return; // Don't spawn regular projectiles
  }

  for (let i = 0; i < count; i++) {
    // Clone direction locally so we don't mess up the global _shootDir
    const dir = _shootDir.clone();

    // Apply spread only for non-global weapons (global weapons aim directly at enemies)
    if (weaponStats.category !== 'global' && (count > 1 || spread > 0)) {
      const angleDeg = (Math.random() - 0.5) * spread;
      dir.applyAxisAngle(_axisY, THREE.MathUtils.degToRad(angleDeg));
    }

    const mesh = createCustomProjectileMesh(
      weaponEntity.weaponId || '',
      weaponStats.bulletColor,
      weaponStats.bulletWidth || 0.2,
      weaponStats.bulletLength || 1.0,
      dir,
    );
    let spin = 0;

    // Set Position: Owner + (Dir * 0.6)
    // Safe use of _posVec since we don't need it after this line for this iteration
    _posVec.copy(dir).multiplyScalar(0.6).add(owner.position);
    mesh.position.copy(_posVec);

    mesh.castShadow = true;
    scene.add(mesh);

    // Velocity must be a new instance
    const velocity = dir.multiplyScalar(finalSpeed);

    const projectile = world.add({
      isProjectile: true,
      weaponId: weaponEntity.weaponId,
      position: mesh.position,
      velocity: velocity,
      lifeTimer: 0,
      maxLife: weaponStats.bulletLifetime,
      transform: mesh,
      damage: finalDamage,
      projectile: {
        pierce: pierce,
        explodeRadius: weaponStats.bulletExplodeRadius || 0,
        knockback: weaponStats.knockback || 5,
        hitList: [],
        spinSpeed: spin,
        // Signal Hijacker: 0 damage + AoE = confusion weapon (3 second duration)
        confusionDuration: finalDamage === 0 && weaponStats.bulletExplodeRadius > 0 ? 3.0 : 0,
      },
    });

    // Add Rapier rigid body for collision (skip on client-side visual projectiles)
    const isMultiplayerClient = uiState.isMultiplayer && !uiState.isHost;
    if (isRapierInitialized() && projectile.id !== undefined && !isMultiplayerClient) {
      const radius = weaponStats.bulletWidth ? weaponStats.bulletWidth * 0.6 : PROJECTILE_RADIUS;
      const { rigidBody, collider } = createKinematicBody(
        mesh.position.x,
        mesh.position.z,
        radius,
        projectile.id,
      );
      projectile.rigidBody = rigidBody;
      projectile.collider = collider;
    }
  }
}

export function fireWeaponRemote(
  scene: THREE.Scene,
  owner: any,
  weaponId: string,
  dirVec: { x: number; z: number },
) {
  const stats = WEAPONS[weaponId];
  if (!stats) return;
  const tierStats = getWeaponStatsAtLevel(weaponId, 1)!;

  const mockWeapon = {
    weapon: {
      cooldownTimer: 0,
      fireRate: tierStats.cooldown,
      damage: tierStats.damage,
      bulletSpeed: stats.baseSpeed,
      bulletColor: stats.color,
      bulletLifetime: stats.baseLifetime,
      category: stats.category,
      bulletWidth: stats.bulletWidth,
      bulletLength: stats.bulletLength,
      visualStyle: stats.visualStyle,
      bulletCount: tierStats.projectiles,
      bulletSpread: stats.baseSpread,
      knockback: stats.baseKnockback,
      bulletPierce: tierStats.pierce,
      bulletExplodeRadius: stats.explodeRadius,
    },
  };

  const dir = new THREE.Vector3(dirVec.x, 0, dirVec.z).normalize();
  if (dir.lengthSq() === 0) dir.set(0, 0, 1);

  _shootDir.copy(dir);

  const isHeavy = mockWeapon.weapon.bulletCount > 1 || mockWeapon.weapon.knockback > 15;
  addTrauma(isHeavy ? 0.25 : 0.05);
  playShoot();

  const flashMesh = new THREE.Mesh(muzzleGeo, getMuzzleMaterial(mockWeapon.weapon.bulletColor));
  _posVec.copy(dir).multiplyScalar(0.8).add(owner.position);
  flashMesh.position.copy(_posVec);
  scene.add(flashMesh);

  world.add({
    isParticle: true,
    position: flashMesh.position,
    velocity: new THREE.Vector3(),
    transform: flashMesh,
    lifeTimer: 0.08,
    maxLife: 0.08,
  });

  const count = mockWeapon.weapon.bulletCount || 1;
  const spread = mockWeapon.weapon.bulletSpread || 0;

  for (let i = 0; i < count; i++) {
    const pDir = dir.clone();
    if (count > 1 || spread > 0) {
      const angleDeg = (Math.random() - 0.5) * spread;
      pDir.applyAxisAngle(_axisY, THREE.MathUtils.degToRad(angleDeg));
    }

    const mesh = createCustomProjectileMesh(
      weaponId,
      mockWeapon.weapon.bulletColor,
      mockWeapon.weapon.bulletWidth || 0.2,
      mockWeapon.weapon.bulletLength || 1.0,
      pDir,
    );

    _posVec.copy(pDir).multiplyScalar(0.6).add(owner.position);
    mesh.position.copy(_posVec);
    mesh.castShadow = true;
    scene.add(mesh);

    const velocity = pDir.multiplyScalar(mockWeapon.weapon.bulletSpeed);

    world.add({
      isProjectile: true,
      weaponId: weaponId,
      position: mesh.position,
      velocity: velocity,
      lifeTimer: 0,
      maxLife: mockWeapon.weapon.bulletLifetime,
      transform: mesh,
      damage: 0,
      projectile: {
        pierce: 1,
        explodeRadius: mockWeapon.weapon.bulletExplodeRadius || 0,
        knockback: mockWeapon.weapon.knockback || 5,
        hitList: [],
        spinSpeed: 0,
      },
    });
  }
}
