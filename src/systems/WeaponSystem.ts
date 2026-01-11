import { world } from '../core/world';
import * as THREE from 'three';
import { addTrauma } from './CameraSystem';
import { playShoot } from '../core/audio';
import { getDefaultStats, getEffectiveDamage, getEffectiveAmount } from '../core/PlayerStats';
import { spawnOrbitalProjectile } from './OrbitalSystem';
import { createKinematicBody, isRapierInitialized } from '../core/RapierWorld';

// ... (muzzleGeo/boltGeo etc unchanged)
const muzzleGeo = new THREE.SphereGeometry(0.4, 8, 8);
const muzzleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });

const boltGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
boltGeo.rotateX(Math.PI / 2);

const shardGeo = new THREE.TetrahedronGeometry(0.5);
const orbGeo = new THREE.IcosahedronGeometry(0.5, 1);

const PROJECTILE_RADIUS = 0.3;
// ... (materials cache remains)
const bulletMatCache = new Map<number, THREE.MeshStandardMaterial>();
const wireframeCache = new Map<number, THREE.MeshBasicMaterial>();

function getBulletMaterial(color: number) {
  if (!bulletMatCache.has(color)) {
    const mat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 2.0,
      roughness: 0.0,
      metalness: 0.0,
    });
    bulletMatCache.set(color, mat);
  }
  return bulletMatCache.get(color)!;
}

function getWireframeMaterial(color: number) {
  if (!wireframeCache.has(color)) {
    const mat = new THREE.MeshBasicMaterial({
      color: color,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    });
    wireframeCache.set(color, mat);
  }
  return wireframeCache.get(color)!;
}

// 3. Reusable Math Objects (No "new" keyword in loops!)
const _shootDir = new THREE.Vector3();
const _posVec = new THREE.Vector3();
const _axisY = new THREE.Vector3(0, 1, 0);
const _axisZ = new THREE.Vector3(0, 0, 1);

export function WeaponSystem(dt: number, scene: THREE.Scene) {
  // 1. SPIN ANIMATION
  for (const p of world.with('isProjectile', 'transform', 'projectile')) {
    if (p.projectile && p.projectile.spinSpeed && p.transform) {
      p.transform.rotation.z += p.projectile.spinSpeed * dt;
      p.transform.rotation.x += p.projectile.spinSpeed * 0.5 * dt;
    }
  }

  // 2. PLAYER WEAPONS
  const player = world.with('isPlayer', 'position', 'aimTarget', 'input', 'modifiers').first;
  if (player) {
    for (const entity of world.with('weapon', 'ownerId')) {
      if (entity.ownerId !== player.id) continue;
      if (!entity.weapon) continue;

      if (entity.weapon.cooldownTimer > 0) entity.weapon.cooldownTimer -= dt;

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
  const flashMesh = new THREE.Mesh(muzzleGeo, muzzleMat.clone());
  (flashMesh.material as THREE.MeshBasicMaterial).color.setHex(weaponStats.bulletColor);

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

  const finalSpeed = weaponStats.bulletSpeed * playerStats.projectileSpeed;
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
    );
    return; // Don't spawn regular projectiles
  }

  // Reuse Material
  const material = getBulletMaterial(weaponStats.bulletColor);

  for (let i = 0; i < count; i++) {
    // Clone direction locally so we don't mess up the global _shootDir
    const dir = _shootDir.clone();

    // Apply spread only for non-global weapons (global weapons aim directly at enemies)
    if (weaponStats.category !== 'global' && (count > 1 || spread > 0)) {
      const angleDeg = (Math.random() - 0.5) * spread;
      dir.applyAxisAngle(_axisY, THREE.MathUtils.degToRad(angleDeg));
    }

    let mesh: THREE.Object3D;
    let spin = 0;

    if (style === 'ORB') {
      const group = new THREE.Group();
      const w = weaponStats.bulletWidth || 0.5;

      const core = new THREE.Mesh(orbGeo, material);
      core.scale.setScalar(w);
      group.add(core);

      const shell = new THREE.Mesh(orbGeo, getWireframeMaterial(weaponStats.bulletColor));
      shell.scale.setScalar(w * 1.5);
      shell.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      group.add(shell);

      mesh = group;
      spin = 5.0;
    } else if (style === 'SHARD') {
      mesh = new THREE.Mesh(shardGeo, material);
      const w = weaponStats.bulletWidth || 0.3;
      mesh.scale.setScalar(w);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    } else {
      // BOLT
      mesh = new THREE.Mesh(boltGeo, material);
      const w = weaponStats.bulletWidth || 0.2;
      const l = weaponStats.bulletLength || 1.0;
      mesh.scale.set(w, w, l);
      mesh.quaternion.setFromUnitVectors(_axisZ, dir);
    }

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

    // Add Rapier rigid body for collision
    if (isRapierInitialized() && projectile.id !== undefined) {
      const radius = weaponStats.bulletWidth ? weaponStats.bulletWidth * 0.6 : PROJECTILE_RADIUS;
      const { rigidBody, collider } = createKinematicBody(
        mesh.position.x,
        mesh.position.z,
        radius,
        projectile.id
      );
      projectile.rigidBody = rigidBody;
      projectile.collider = collider;
    }
  }
}
