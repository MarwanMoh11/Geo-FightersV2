import { world } from './world';
import * as THREE from 'three';
import { handleEnemyDeath, spawnBlastFX } from '../systems/CollisionSystem';
import { createCustomProjectileMesh } from './projectileVisuals';

const _dirVec = new THREE.Vector3();

export function cypherRebootSurgeActivate({ player }: { player: any; scene: THREE.Scene; dt: number }) {
  for (const w of world.with('isWeapon', 'ownerId')) {
    if (w.ownerId === player.id && w.weapon) {
      w.weapon.cooldownTimer = 0;
    }
  }
}

export function cypherRebootSurgeTick(_ctx: { player: any; scene: THREE.Scene; dt: number }) {
  // gate lives in WeaponSystem
}

let titanAftershockTimer = 0;

export function titanAftershockActivate(_ctx: { player: any; scene: THREE.Scene; dt: number }) {
  titanAftershockTimer = 0;
}

export function titanAftershockTick({ player, scene, dt }: { player: any; scene: THREE.Scene; dt: number }) {
  titanAftershockTimer += dt;
  if (titanAftershockTimer < 0.5) return;
  titanAftershockTimer = 0;

  spawnBlastFX(player.position, 5, scene, 0xff8844);

  const enemies = Array.from(world.with('isEnemy', 'position', 'health'));
  for (const enemy of enemies) {
    if (!enemy.health || enemy.health.current <= 0) continue;
    const dx = enemy.position.x - player.position.x;
    const dz = enemy.position.z - player.position.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > 25 || distSq < 0.01) continue;
    enemy.health.current -= 30;
    enemy.hitFlashTimer = 0.15;
    const inv = 1 / Math.sqrt(distSq);
    if (enemy.velocity) {
      enemy.velocity.x += dx * inv * 4;
      enemy.velocity.z += dz * inv * 4;
    }
    if (enemy.health.current <= 0) {
      handleEnemyDeath(enemy, scene);
    }
  }
}

export function fluxChaosEchoActivate({ player, scene }: { player: any; scene: THREE.Scene; dt: number }) {
  const wpns = Array.from(world.with('isWeapon', 'ownerId'));
  let weaponDamage = 25;
  for (const w of wpns) {
    if (w.ownerId === player.id && w.weapon) {
      weaponDamage = w.weapon.damage;
      break;
    }
  }
  const echoDamage = Math.round(weaponDamage * 0.5);

  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + Math.random() * 0.4;
    const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const speed = 12 + Math.random() * 6;
    const mesh = createCustomProjectileMesh('flux_echo', 0xff3377, 0.2, 1.0, dir);
    mesh.position.copy(player.position);
    _dirVec.copy(dir).multiplyScalar(0.6).add(player.position);
    mesh.position.copy(_dirVec);
    mesh.castShadow = false;
    scene.add(mesh);

    world.add({
      isProjectile: true,
      weaponId: 'flux_echo',
      ownerConnId: player.connectionId,
      position: mesh.position,
      velocity: dir.multiplyScalar(speed),
      lifeTimer: 0,
      maxLife: 2,
      transform: mesh,
      damage: echoDamage,
      projectile: {
        pierce: 0,
        explodeRadius: 0,
        knockback: 5,
        hitList: [],
        spinSpeed: 0,
        confusionDuration: 0,
      },
    });
  }
}

export function fluxChaosEchoTick(_ctx: { player: any; scene: THREE.Scene; dt: number }) {
  // no continuous effect
}
