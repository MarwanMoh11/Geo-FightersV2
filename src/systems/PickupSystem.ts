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

/**
 * Per-frame pickup tick: animate floor pickups and collect them when a player
 * moves within range.
 *
 * @param {THREE.Scene} scene - the Three.js scene (used for bomb pickup VFX)
 */
function isHostOrSolo(): boolean {
  return !uiState.isMultiplayer || uiState.isHost;
}

export function PickupSystem(scene: THREE.Scene): void {
  const now = performance.now() / 1000;
  // Collection is host-authoritative. Clients still run the loop for the mesh
  // animation — their pickups are mirrors of the host's (see network.ts), and
  // a client removing one locally would just have it reappear on the next
  // snapshot while the host still considered it uncollected.
  const collects = isHostOrSolo();

  for (const pickup of [...world.with('isPickup', 'position')]) {
    const id = pickup.id as number;
    let mesh = pickupMeshes.get(id);
    if (!mesh) {
      mesh = buildPickupMesh(scene, pickup.pickupType ?? 'medkit');
      pickupMeshes.set(id, mesh);
    }
    mesh.position.set(pickup.position.x, 0.9 + Math.sin(now * 3 + id) * 0.15, pickup.position.z);
    mesh.rotation.y = now * 1.5;

    if (!collects) continue;

    for (const p of world.with('isPlayer', 'position', 'health')) {
      if (!p.health || p.health.current <= 0) continue;
      const dx = p.position.x - pickup.position.x;
      const dz = p.position.z - pickup.position.z;
      if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
        applyPickup(pickup.pickupType ?? 'medkit', p, scene);
        removePickupMesh(id);
        world.remove(pickup);
        break;
      }
    }
  }
}

/** Drop a pickup's mesh (collected, or the host stopped reporting it). */
export function removePickupMesh(id: number): void {
  const mesh = pickupMeshes.get(id);
  if (mesh) {
    mesh.parent?.remove(mesh);
    pickupMeshes.delete(id);
  }
}

/**
 * HOST/SOLO: apply a pickup to whoever walked into it.
 *
 * Split in two because half of these effects are *world* state the host owns
 * (health, the logic bomb's damage) and half are *that player's own* state
 * living in their local uiState (the magna-pulse timer, the skeleton key
 * counter). Applying the second half here would have credited the host — a
 * joiner picking up a skeleton key literally handed it to the host instead.
 */
function applyPickup(type: string, player: any, scene: THREE.Scene): void {
  const style = PICKUP_STYLES[type] ?? PICKUP_STYLES.medkit;

  // --- world effects: host-authoritative, replicated by the normal sync ---
  switch (type) {
    case 'medkit':
      if (player.health) {
        player.health.current = Math.min(player.health.current + 30, player.health.max);
      }
      break;
    case 'bomb': {
      const playerPos = player.position!;
      spawnBombRing(scene, playerPos, style.color);
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
      break;
    }
    default:
      break;
  }

  // --- personal effects: they belong to the collector, wherever they are ---
  if (player.isLocalPlayer) {
    applyPickupLocal(type, scene);
  } else if (player.connectionId) {
    notifyPickup(player.connectionId, type);
  }
}

/**
 * The collector's own side of a pickup: their uiState, their audio, their
 * banner. Runs on whichever machine owns that player — directly on the host
 * for the host, or via the targeted `pickup-collect` event for a joiner.
 */
export function applyPickupLocal(type: string, scene: THREE.Scene | null): void {
  const style = PICKUP_STYLES[type] ?? PICKUP_STYLES.medkit;
  haptics.reward();
  switch (type) {
    case 'medkit':
      playCollect(1.2);
      break;
    case 'magnet':
      uiState.magnaPulseTimer = 10.0;
      announce('MAGNA-PULSE — XP VACUUM');
      break;
    case 'bomb': {
      // The blast itself is the host's; a joiner still gets the shockwave ring
      // drawn at their own feet so the pickup reads as theirs.
      const me = world.with('isLocalPlayer', 'position').first;
      if (scene && me?.position && uiState.isMultiplayer && !uiState.isHost) {
        spawnBombRing(scene, me.position, style.color);
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

/** Expanding shockwave ring for the logic bomb. */
function spawnBombRing(scene: THREE.Scene, at: THREE.Vector3, color: number): void {
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.2, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(at.x, 0.3, at.z);
  scene.add(ring);
  world.add({
    isParticle: true,
    position: at.clone(),
    velocity: new THREE.Vector3(),
    transform: ring,
    lifeTimer: 0,
    maxLife: 0.5,
    ringGrow: BOMB_RADIUS / 0.2 - 1,
  });
}

/** Late-bound so PickupSystem doesn't statically import the network layer. */
let notifyPickup: (connId: string, type: string) => void = () => {};
export function bindPickupNet(fn: (connId: string, type: string) => void): void {
  notifyPickup = fn;
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
