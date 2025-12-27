import { world, type Entity } from '../core/world';
import * as THREE from 'three';
import { addTrauma } from './CameraSystem';

export function WeaponSystem(dt: number, scene: THREE.Scene) {
  for (const entity of world.with('weapon', 'position', 'aimTarget')) {
    if (!entity.weapon || !entity.aimTarget) continue;

    if (entity.weapon.cooldownTimer > 0) {
      entity.weapon.cooldownTimer -= dt;
    }

    const wantsToFire = entity.input?.isShooting || entity.aimTarget.lengthSq() > 0;

    if (wantsToFire && entity.weapon.cooldownTimer <= 0) {
      spawnProjectile(entity, scene);
      entity.weapon.cooldownTimer = entity.weapon.fireRate;
    }
  }
}

function spawnProjectile(shooter: Entity, scene: THREE.Scene) {
  if (!shooter.weapon || !shooter.aimTarget) return;

  const direction = new THREE.Vector3().subVectors(shooter.aimTarget, shooter.position).normalize();

  if (direction.lengthSq() === 0) direction.set(0, 0, 1);

  const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const material = new THREE.MeshStandardMaterial({
    color: shooter.weapon.bulletColor,
    emissive: shooter.weapon.bulletColor,
    emissiveIntensity: 0.5,
  });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.copy(shooter.position).add(direction.clone().multiplyScalar(1.0));
  mesh.castShadow = true;
  scene.add(mesh);

  // --- TUNING: SUBTLE KICKBACK ---
  if (shooter.isPlayer) {
    // Was 0.1 (Too shaky). Now 0.02 (Just a hum).
    addTrauma(0.02);
  }

  world.add({
    isProjectile: true,
    position: mesh.position,
    velocity: direction.multiplyScalar(shooter.weapon.bulletSpeed),
    lifeTimer: 0,
    maxLife: shooter.weapon.bulletLifetime,
    transform: mesh,
    damage: shooter.weapon.damage,
  });
}
