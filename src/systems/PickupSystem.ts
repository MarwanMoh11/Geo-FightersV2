import * as THREE from 'three';
import { world } from '../core/world';
import { uiState, announce } from '../core/UIState.svelte.ts';
import { playCollect, playLevelUp } from '../core/audio';
import { haptics } from '../core/haptics';
import { handleEnemyDeath } from './CollisionSystem';

const PICKUP_RADIUS = 1.7;
const BOMB_RADIUS = 26;
const BOMB_DAMAGE = 60;

interface PickupStyle {
  color: number;
  label: string;
}
const PICKUP_STYLES: Record<string, PickupStyle> = {
  medkit: { color: 0x4dff88, label: 'MEDKIT' },
  magnet: { color: 0x36e6ff, label: 'MAGNA-PULSE' },
  bomb: { color: 0xff3d77, label: 'LOGIC BOMB' },
  key: { color: 0xffd75e, label: 'SKELETON KEY' },
};

const pickupMeshes = new Map<number, THREE.Group>();

export function PickupSystem(scene: THREE.Scene): void {
  const now = performance.now() / 1000;

  for (const pickup of [...world.with('isPickup', 'position')]) {
    const id = pickup.id as number;
    let mesh = pickupMeshes.get(id);
    if (!mesh) {
      mesh = buildPickupMesh(scene, pickup.pickupType ?? 'medkit');
      pickupMeshes.set(id, mesh);
    }
    mesh.position.set(
      pickup.position.x,
      0.9 + Math.sin(now * 3 + id) * 0.15,
      pickup.position.z,
    );
    mesh.rotation.y = now * 1.5;

    for (const p of world.with('isPlayer', 'position', 'health')) {
      if (!p.health || p.health.current <= 0) continue;
      const dx = p.position.x - pickup.position.x;
      const dz = p.position.z - pickup.position.z;
      if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
        applyPickup(pickup.pickupType ?? 'medkit', p, scene);
        mesh.parent?.remove(mesh);
        pickupMeshes.delete(id);
        world.remove(pickup);
        break;
      }
    }
  }
}

function applyPickup(type: string, player: any, scene: THREE.Scene): void {
  const style = PICKUP_STYLES[type] ?? PICKUP_STYLES.medkit;
  haptics.reward();
  switch (type) {
    case 'medkit':
      if (player.health) {
        player.health.current = Math.min(player.health.current + 30, player.health.max);
      }
      playCollect(1.2);
      break;
    case 'magnet':
      for (const xp of [...world.with('isXP', 'position', 'velocity')]) {
        const dx = player.position.x - xp.position.x;
        const dz = player.position.z - xp.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 0.001) {
          xp.velocity.x += (dx / dist) * 18;
          xp.velocity.z += (dz / dist) * 18;
        }
      }
      announce(style.label);
      break;
    case 'bomb': {
      const playerPos = player.position!;
      const ringMat = new THREE.MeshBasicMaterial({
        color: style.color,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.2, 32), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(playerPos.x, 0.3, playerPos.z);
      scene.add(ring);
      world.add({
        isParticle: true,
        position: playerPos.clone(),
        velocity: new THREE.Vector3(),
        transform: ring,
        lifeTimer: 0,
        maxLife: 0.5,
        ringGrow: BOMB_RADIUS / 0.2 - 1,
      });
      for (const enemy of world.with('isEnemy', 'position', 'health')) {
        if (!enemy.health) continue;
        const dx = enemy.position.x - playerPos.x;
        const dz = enemy.position.z - playerPos.z;
        if (dx * dx + dz * dz > BOMB_RADIUS * BOMB_RADIUS) continue;
        enemy.health.current -= BOMB_DAMAGE;
        enemy.stunTimer = 1.5;
        enemy.hitFlashTimer = 0.15;
        if (enemy.health.current <= 0) handleEnemyDeath(enemy, scene);
      }
      announce(style.label);
      break;
    }
    case 'key':
      uiState.skeletonKeys++;
      playLevelUp();
      announce(style.label);
      break;
    default:
      break;
  }
}

function buildPickupMesh(scene: THREE.Scene, type: string): THREE.Group {
  const style = PICKUP_STYLES[type] ?? PICKUP_STYLES.medkit;
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.4),
    new THREE.MeshStandardMaterial({
      color: style.color,
      roughness: 0.2,
      metalness: 0.8,
      emissive: style.color,
      emissiveIntensity: 0.5,
    }),
  );
  core.position.y = 0.6;
  group.add(core);
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.05, 24),
    new THREE.MeshBasicMaterial({
      color: style.color,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -0.6;
  group.add(halo);
  scene.add(group);
  return group;
}

/** Clean up on restart. */
export function resetPickups(): void {
  for (const mesh of pickupMeshes.values()) {
    mesh.parent?.remove(mesh);
  }
  pickupMeshes.clear();
}
