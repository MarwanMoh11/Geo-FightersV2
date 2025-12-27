import { world } from '../core/world';
import * as THREE from 'three';
import { addTrauma } from './CameraSystem';
import { spawnXP } from '../core/factories';
import { triggerGameOver } from './GameManager';
import { playExplosion } from '../core/audio'; // <--- NEW IMPORT

export function CollisionSystem(scene: THREE.Scene) {
  const enemies = world.with('isEnemy', 'position', 'health', 'velocity');
  const bullets = world.with('isProjectile', 'position', 'velocity');

  // A. Bullet vs Enemy
  for (const bullet of bullets) {
    for (const enemy of enemies) {
      const distance = bullet.position.distanceTo(enemy.position);

      if (distance < 0.8) {
        if (enemy.health) {
          // DAMAGE
          const dmg = bullet.damage || 1;
          enemy.health.current -= dmg;

          // JUICE
          enemy.hitFlashTimer = 0.1;
          const pushDir = bullet.velocity.clone().normalize();
          pushDir.y = 0;
          enemy.velocity.add(pushDir.multiplyScalar(10));
          enemy.stunTimer = 0.2;

          despawn(bullet, scene);

          // CHECK DEATH
          if (enemy.health.current <= 0) {
            addTrauma(0.15);
            spawnExplosion(enemy.position, scene);
            playExplosion(); // <--- PLAY SOUND

            spawnXP(scene, enemy.position.x, enemy.position.z, 10);
            despawn(enemy, scene);
          }
        }
        break;
      }
    }
  }

  // B. Enemy vs Player
  const player = world.with('isPlayer', 'position', 'health').first;
  if (player && player.health) {
    for (const enemy of enemies) {
      const distance = player.position.distanceTo(enemy.position);

      if (distance < 1.0) {
        // DAMAGE PLAYER
        player.health.current -= 5;

        addTrauma(0.5);
        const push = new THREE.Vector3()
          .subVectors(enemy.position, player.position)
          .normalize()
          .multiplyScalar(5);
        enemy.velocity.add(push);
        enemy.stunTimer = 0.5;

        if (player.health.current <= 0) {
          triggerGameOver();
        }
      }
    }
  }
}

function spawnExplosion(pos: THREE.Vector3, scene: THREE.Scene) {
  const particleCount = 8;
  const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  const material = new THREE.MeshBasicMaterial({ color: 0xff0055 });

  for (let i = 0; i < particleCount; i++) {
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      Math.random() * 5 + 2,
      (Math.random() - 0.5) * 10,
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(pos);
    scene.add(mesh);

    world.add({
      isParticle: true,
      position: mesh.position,
      velocity: vel,
      transform: mesh,
      lifeTimer: 0,
      maxLife: 0.5 + Math.random() * 0.3,
    });
  }
}

function despawn(entity: any, scene: THREE.Scene) {
  if (entity.transform) {
    scene.remove(entity.transform);
  }
  world.remove(entity);
}
