import { world } from '../core/world';
import * as THREE from 'three';
import { addTrauma } from './CameraSystem';
import { playShoot } from '../core/audio';

const muzzleGeo = new THREE.SphereGeometry(0.4, 8, 8);
const muzzleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });

// --- GEOMETRY SKINS ---
// 1. Bolt (Cylinder)
const boltGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
boltGeo.rotateX(Math.PI / 2);

// 2. Shard (Tetrahedron - Jagged)
const shardGeo = new THREE.TetrahedronGeometry(0.5);

// 3. Orb Core (Low poly sphere)
const orbGeo = new THREE.IcosahedronGeometry(0.5, 1);

export function WeaponSystem(dt: number, scene: THREE.Scene) {
  // 1. UPDATE LOOP (Animation & Firing)

  // A. Animate Spinning Projectiles (Plasma Orbs)
  for (const p of world.with('isProjectile', 'transform', 'projectile')) {
    if (p.projectile && p.projectile.spinSpeed && p.transform) {
      // Spin on local axes
      p.transform.rotation.z += p.projectile.spinSpeed * dt;
      p.transform.rotation.x += p.projectile.spinSpeed * 0.5 * dt;
    }
  }

  // B. Player Weapons
  const player = world.with('isPlayer', 'position', 'aimTarget', 'input', 'modifiers').first;
  if (player) {
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
  }

  // 2. CLEANUP MUZZLE FLASHES
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

  // Direction
  const baseDir = new THREE.Vector3().subVectors(owner.aimTarget, owner.position).normalize();
  if (baseDir.lengthSq() === 0) baseDir.set(0, 0, 1);

  // Feedback
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

  // Spawn
  const count = stats.bulletCount || 1;
  const spread = stats.bulletSpread || 0;
  const finalDamage = stats.damage + mods.damageAdd;
  const finalSpeed = stats.bulletSpeed * mods.speedMult;
  const style = stats.visualStyle || 'BOLT';

  for (let i = 0; i < count; i++) {
    const dir = baseDir.clone();
    if (count > 1 || spread > 0) {
      const angleDeg = (Math.random() - 0.5) * spread;
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(angleDeg));
    }

    let mesh: THREE.Object3D;
    let spin = 0;

    // --- VISUAL FACTORY ---
    const material = new THREE.MeshStandardMaterial({
      color: stats.bulletColor,
      emissive: stats.bulletColor,
      emissiveIntensity: 2.0,
      roughness: 0.0,
      metalness: 0.0,
    });

    if (style === 'ORB') {
      // COMPLEX: Group with Core + Shell
      const group = new THREE.Group();

      // Core
      const core = new THREE.Mesh(orbGeo, material);
      const w = stats.bulletWidth || 0.5;
      core.scale.setScalar(w);
      group.add(core);

      // Shell (Wireframe)
      const shellMat = new THREE.MeshBasicMaterial({
        color: stats.bulletColor,
        wireframe: true,
        transparent: true,
        opacity: 0.5,
      });
      const shell = new THREE.Mesh(orbGeo, shellMat);
      shell.scale.setScalar(w * 1.5);
      // Random initial rotation for shell
      shell.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      group.add(shell);

      mesh = group;
      spin = 5.0; // Enable spinning in update loop
    } else if (style === 'SHARD') {
      // JAGGED: Tetrahedron
      mesh = new THREE.Mesh(shardGeo, material);
      const w = stats.bulletWidth || 0.3;
      mesh.scale.setScalar(w);
      // Random Rotation for chaotic look
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    } else {
      // DEFAULT: Bolt Cylinder
      mesh = new THREE.Mesh(boltGeo, material);
      const w = stats.bulletWidth || 0.2;
      const l = stats.bulletLength || 1.0;
      mesh.scale.set(w, w, l);
      // Align to direction
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    }

    mesh.position.copy(owner.position).add(dir.clone().multiplyScalar(0.6));

    // If it's a shard, we don't align it to direction (it tumbles/looks random)
    // If it's an orb, rotation is handled by spin
    // If it's a bolt, we already aligned it above

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
        spinSpeed: spin,
      },
    });
  }
}
