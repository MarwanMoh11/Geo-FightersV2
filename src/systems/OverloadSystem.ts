import { world } from '../core/world';
import { uiState } from '../core/UIState.svelte.ts';
import * as THREE from 'three';
import { addTrauma } from './CameraSystem';
import { playExplosion } from '../core/audio';
import { spawnDamageNumber } from './DamageNumberSystem';
import { handleEnemyDeath } from './CollisionSystem';

let wasOverloadActive = false;
let railBubbleMesh: THREE.Mesh | null = null;
let lashSpawnTimer = 0;

// Geometries & Materials cached
const shockwaveGeo = new THREE.RingGeometry(0.1, 0.2, 32);
const bubbleGeo = new THREE.SphereGeometry(1.8, 16, 16);
const bubbleMat = new THREE.MeshBasicMaterial({
  color: 0x00ff88,
  wireframe: true,
  transparent: true,
  opacity: 0.25,
});

const tearGeo = new THREE.ConeGeometry(0.4, 0.8, 4);
const tearMat = new THREE.MeshBasicMaterial({
  color: 0xff00ff,
  wireframe: true,
});

export function OverloadSystem(dt: number, scene: THREE.Scene) {
  const player = world.with('isLocalPlayer', 'position', 'id').first;
  if (!player) return;

  const isActive = uiState.overloadActive;

  // Passive trickle charging when not active
  if (!isActive && uiState.gameState === 'PLAYING') {
    uiState.overloadCharge = Math.min(100, uiState.overloadCharge + 0.3 * dt);
  }

  // 1. Rising Edge (Triggering the overload)
  if (isActive && !wasOverloadActive) {
    wasOverloadActive = true;
    lashSpawnTimer = 0;

    // Cypher reboot shockwave & screen stun
    if (uiState.selectedCharacter === 'cypher') {
      addTrauma(1.0);
      playExplosion();

      // Spawn expanding shockwave mesh
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00d5ff,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(shockwaveGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(player.position);
      mesh.position.y = 0.1;
      scene.add(mesh);

      world.add({
        isParticle: true,
        position: player.position.clone(),
        velocity: new THREE.Vector3(),
        transform: mesh,
        lifeTimer: 0,
        maxLife: 1.0,
        ringGrow: 16.0 / 0.2 - 1, // grow from 0.2 to 16.0 radius
      });

      // Stun and damage all screen/nearby enemies
      const enemies = Array.from(world.with('isEnemy', 'position', 'health', 'stunTimer'));
      for (const enemy of enemies) {
        if (!enemy.health || enemy.health.current <= 0) continue;
        const dx = enemy.position.x - player.position.x;
        const dz = enemy.position.z - player.position.z;
        const distSq = dx * dx + dz * dz;

        // Damage and stun within a wide 18 units radius
        if (distSq < 18 * 18) {
          enemy.health.current -= 500;
          enemy.stunTimer = 3.0; // Stun for 3 seconds
          enemy.hitFlashTimer = 0.15;
          spawnDamageNumber(enemy.position, 500, 'enemy');

          if (enemy.health.current <= 0) {
            handleEnemyDeath(enemy, scene);
          }
        }
      }
    }

    // Rail bubble shield creation
    if (uiState.selectedCharacter === 'rail') {
      railBubbleMesh = new THREE.Mesh(bubbleGeo, bubbleMat);
      railBubbleMesh.position.copy(player.position);
      scene.add(railBubbleMesh);
    }
  }

  // 2. Continuous updates while active
  if (isActive) {
    uiState.overloadTimer -= dt;

    if (uiState.overloadTimer <= 0) {
      uiState.overloadActive = false;
      isActive && deactivateOverload(scene);
    } else {
      // Rail: Lock bubble shield position to player
      if (uiState.selectedCharacter === 'rail' && railBubbleMesh) {
        railBubbleMesh.position.copy(player.position);
        railBubbleMesh.rotation.y += dt * 1.5;
        railBubbleMesh.rotation.x += dt * 0.5;
      }

      // Lash: Spawn spatial tears
      if (uiState.selectedCharacter === 'lash') {
        lashSpawnTimer += dt;
        if (lashSpawnTimer >= 0.15) {
          lashSpawnTimer = 0;

          const mesh = new THREE.Mesh(tearGeo, tearMat);
          mesh.position.copy(player.position);
          mesh.position.y = 0.4;
          mesh.rotation.x = Math.PI; // point downwards
          scene.add(mesh);

          world.add({
            isLashTear: true,
            isParticle: true, // Auto cleaned up by LifecycleSystem if transform exists
            position: player.position.clone(),
            velocity: new THREE.Vector3(),
            transform: mesh,
            lifeTimer: 0,
            maxLife: 3.0,
            hitList: [] as number[],
          });
        }
      }
    }
  }

  // 3. Falling Edge (Deactivation check from external means)
  if (!isActive && wasOverloadActive) {
    deactivateOverload(scene);
  }
}

function deactivateOverload(scene: THREE.Scene) {
  wasOverloadActive = false;
  uiState.overloadActive = false;
  uiState.overloadTimer = 0;

  if (railBubbleMesh) {
    scene.remove(railBubbleMesh);
    railBubbleMesh = null;
  }
}
