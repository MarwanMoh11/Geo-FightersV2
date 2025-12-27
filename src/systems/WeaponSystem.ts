import { world } from '../core/world';
import * as THREE from 'three';
import { addTrauma } from './CameraSystem';
import { playShoot } from '../core/audio';

const muzzleGeo = new THREE.SphereGeometry(0.4, 8, 8);
const muzzleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });

// --- BASE GEOMETRIES FOR SCALING ---
// 1. Cylinder for bolts/beams (Unit size, pointing down Z)
const baseCylinderGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
baseCylinderGeo.rotateX(Math.PI / 2);

// 2. Sphere for orbs/plasma (Unit size)
const baseSphereGeo = new THREE.SphereGeometry(0.5, 16, 16);

export function WeaponSystem(dt: number, scene: THREE.Scene) {
  // 1. FIND PLAYER
  const player = world.with('isPlayer', 'position', 'aimTarget', 'input', 'modifiers').first;
  if (!player) return;

  // 2. ITERATE WEAPONS
  for (const entity of world.with('weapon', 'ownerId')) {
    if (entity.ownerId !== player.id) continue;
    if (!entity.weapon) continue;

    if (entity.weapon.cooldownTimer > 0) entity.weapon.cooldownTimer -= dt;

    const wantsToFire =
      player.input?.isShooting || (player.aimTarget && player.aimTarget.lengthSq() > 0);

    if (wantsToFire && entity.weapon.cooldownTimer <= 0) {
      fireWeapon(entity, player, scene);
      const mod = player.modifiers?.fireRateMult || 1.0;
      entity.weapon.cooldownTimer = entity.weapon.fireRate * mod;
    }
  }

  // 3. CLEANUP MUZZLE FLASHES
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
  const stats = weaponEntity.weapon;
  const mods = owner.modifiers || { damageAdd: 0, speedMult: 1.0 };

  // Direction & Feedback
  const baseDir = new THREE.Vector3().subVectors(owner.aimTarget, owner.position).normalize();
  if (baseDir.lengthSq() === 0) baseDir.set(0, 0, 1);

  const isHeavy = stats.bulletCount > 1 || stats.knockback > 15;
  addTrauma(isHeavy ? 0.25 : 0.05);
  playShoot();

  // Muzzle Flash
  const flashMesh = new THREE.Mesh(muzzleGeo, muzzleMat.clone());
  (flashMesh.material as THREE.MeshBasicMaterial).color.setHex(stats.bulletColor);
  flashMesh.position.copy(owner.position).add(baseDir.clone().multiplyScalar(0.8));
  scene.add(flashMesh);
  world.add({
    isParticle: true,
    position: flashMesh.position,
    velocity: new THREE.Vector3(),
    transform: flashMesh,
    lifeTimer: 0.08,
    maxLife: 0.08,
  });

  // --- SPAWN PROJECTILES WITH UNIQUE VISUALS ---
  const count = stats.bulletCount || 1;
  const spread = stats.bulletSpread || 0;
  const finalDamage = stats.damage + mods.damageAdd;
  const finalSpeed = stats.bulletSpeed * mods.speedMult;

  // Determine Geometry Type based on weapon properties
  let geometry: THREE.BufferGeometry;
  const isExplosive = (stats.bulletExplodeRadius || 0) > 0;
  if (isExplosive) {
    geometry = baseSphereGeo; // Plasma/Orbs
  } else {
    geometry = baseCylinderGeo; // Bolts/Beams
  }

  for (let i = 0; i < count; i++) {
    const dir = baseDir.clone();
    if (count > 1 || spread > 0) {
      const angleDeg = (Math.random() - 0.5) * spread;
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(angleDeg));
    }

    const material = new THREE.MeshStandardMaterial({
      color: stats.bulletColor,
      emissive: stats.bulletColor,
      emissiveIntensity: 2.0,
      roughness: 0.0,
      metalness: 0.0,
    });

    const mesh = new THREE.Mesh(geometry, material);

    // --- APPLY UNIQUE SCALING ---
    const width = stats.bulletWidth || 0.2;
    const length = stats.bulletLength || 1.0;

    if (isExplosive) {
      // Spheres scale uniformly by width
      mesh.scale.setScalar(width);
    } else {
      // Cylinders scale X/Y for width, Z for length
      mesh.scale.set(width, width, length);
    }
    // ---------------------------

    mesh.position.copy(owner.position).add(dir.clone().multiplyScalar(0.6));
    // Rotate to face travel direction
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    mesh.castShadow = true;
    scene.add(mesh);

    world.add({
      isProjectile: true,
      position: mesh.position,
      velocity: dir.multiplyScalar(finalSpeed),
      lifeTimer: 0,
      maxLife: stats.bulletLifetime,
      transform: mesh,
      damage: finalDamage,
      projectile: {
        pierce: stats.bulletPierce || 1,
        explodeRadius: stats.bulletExplodeRadius || 0,
        knockback: stats.knockback || 5,
        hitList: [],
      },
    });
  }
}
