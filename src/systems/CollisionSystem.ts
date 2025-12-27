import { world } from '../core/world';
import * as THREE from 'three';
import { addTrauma } from './CameraSystem';
import { spawnXP } from '../core/factories';
import { triggerGameOver } from './GameManager';
import { playExplosion } from '../core/audio';

export function CollisionSystem(scene: THREE.Scene) {
  const enemies = world.with('isEnemy', 'position', 'health', 'velocity');
  const bullets = world.with('isProjectile', 'position', 'velocity', 'projectile');

  // A. Bullet vs Enemy
  for (const bullet of bullets) {
    if (!bullet.projectile) continue;

    for (const enemy of enemies) {
      // PIERCE CHECK: Ignore if already hit
      if (enemy.id && bullet.projectile.hitList.includes(enemy.id)) continue;

      const dist = bullet.position.distanceTo(enemy.position);

      // DIRECT HIT
      if (dist < 0.8) {
        if (enemy.health) {
          // 1. DIRECT DAMAGE
          applyDamage(
            enemy,
            bullet.damage || 1,
            bullet.velocity,
            bullet.projectile.knockback,
            scene,
          );

          // 2. REGISTER HIT
          bullet.projectile.hitList.push(enemy.id!);
          bullet.projectile.pierce -= 1;

          // 3. EXPLOSION LOGIC (Area of Effect)
          if (bullet.projectile.explodeRadius > 0) {
            spawnBlastFX(bullet.position, bullet.projectile.explodeRadius, scene);
            addTrauma(0.3); // Big shake for boom
            playExplosion();

            // Loop ALL enemies to find those in blast radius
            for (const blastTarget of enemies) {
              if (blastTarget === enemy) continue; // Already hit
              if (
                blastTarget.position.distanceTo(bullet.position) < bullet.projectile.explodeRadius
              ) {
                // Push away from explosion center
                const blastDir = new THREE.Vector3()
                  .subVectors(blastTarget.position, bullet.position)
                  .normalize();
                // Blast deals full damage
                if (blastTarget.health) {
                  applyDamage(
                    blastTarget,
                    bullet.damage || 1,
                    blastDir.multiplyScalar(20),
                    10,
                    scene,
                  );
                }
              }
            }
          }

          // 4. BULLET DEATH
          // If it exploded, it dies immediately regardless of pierce
          if (bullet.projectile.explodeRadius > 0 || bullet.projectile.pierce <= 0) {
            despawn(bullet, scene);
            break;
          }
        }
      }
    }
  }

  // B. Enemy vs Player
  const player = world.with('isPlayer', 'position', 'health').first;
  if (player && player.health) {
    for (const enemy of enemies) {
      if (player.position.distanceTo(enemy.position) < 1.0) {
        player.health.current -= 5;
        addTrauma(0.5);
        const push = new THREE.Vector3()
          .subVectors(enemy.position, player.position)
          .normalize()
          .multiplyScalar(5);
        enemy.velocity.add(push);
        enemy.stunTimer = 0.5;
        if (player.health.current <= 0) triggerGameOver();
      }
    }
  }
}

// --- HELPER: Damage Application ---
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
  const pushDir = vel.clone().normalize();
  pushDir.y = 0;
  enemy.velocity.add(pushDir.multiplyScalar(knockback));
  enemy.stunTimer = 0.2;

  // Death
  if (enemy.health.current <= 0) {
    spawnExplosionFX(enemy.position, scene);
    // Only play sound/shake if it wasn't a big explosion (reduce noise)
    spawnXP(scene, enemy.position.x, enemy.position.z, 10);
    despawn(enemy, scene);
  }
}

// --- FX ---

const explosionGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const explosionMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });

function spawnExplosionFX(pos: THREE.Vector3, scene: THREE.Scene) {
  return; // TEMP: DISABLE FX
  const start = performance.now();
  const particleCount = 5;
  for (let i = 0; i < particleCount; i++) {
    const vel = new THREE.Vector3(
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
      velocity: vel,
      transform: mesh,
      lifeTimer: 0,
      maxLife: 0.3,
    });
  }
  const dur = performance.now() - start;
  if (dur > 1.0) console.warn(`[FX LAG] spawnExplosionFX took ${dur.toFixed(2)}ms`);
}

const blastGeo = new THREE.RingGeometry(0.1, 0.2, 16);
const blastMat = new THREE.MeshBasicMaterial({
  color: 0x9900ff,
  transparent: true,
  opacity: 0.8,
  side: THREE.DoubleSide,
});

function spawnBlastFX(pos: THREE.Vector3, radius: number, scene: THREE.Scene) {
  return; // TEMP: DISABLE FX
  // Big Purple Shockwave
  const mesh = new THREE.Mesh(blastGeo, blastMat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(pos);
  mesh.position.y = 0.5;
  scene.add(mesh);

  // We abuse 'velocity.x' to store expansion speed
  world.add({
    isParticle: true,
    position: pos,
    velocity: new THREE.Vector3(radius * 5, 0, 0),
    transform: mesh,
    lifeTimer: 0.3,
    maxLife: 0.3,
  });
}

function despawn(entity: any, scene: THREE.Scene) {
  if (entity.transform) scene.remove(entity.transform);
  world.remove(entity);
}
