// --- SHRINE & STASH SYSTEM (Map 1: Neon Block Slums) ---
// Phase 1.96 (JACK IN) reshaped this module: shrines are now RELAY TOWER
// structures whose buffs are granted by winning the tower's breach mini-game
// (BreachSystem owns the doors, prompts and cooldowns — this module owns the
// shrine structures, the buff timers, and the roaming black-market stash).
//
// • Three RELAY TOWERS, one per district, at fixed landmark spots. Breach one
//   to earn its district buff (fire rate / armor / move speed).
//
// • The BLACK-MARKET STASH: a smuggler crate that surfaces NEAR the player
//   and despawns if ignored. Touching it grants the map-exclusive SCAVENGER
//   CHIP passive (never appears in the level-up pool) plus a credit shower.
//
// Buffs are consumed where the stats are computed: WeaponSystem (fire rate),
// PlayerControlSystem (speed), CollisionSystem (armor). In co-op the fire and
// speed buffs work for the local player; the armor buff applies where damage
// is simulated (solo/host).

import * as THREE from 'three';
import { world } from '../core/world';
import { uiState, announce } from '../core/UIState.svelte.ts';
import { spawnCredit } from '../core/factories';
import { playLevelUp, playChestOpen } from '../core/audio';
import { haptics } from '../core/haptics';
import { getCurrentLevel, isPointInObstacle } from '../core/LevelData';
import type { Poi } from './WayfindingSystem';

// --- MAP DATA (Neon Block Slums) ---
export type ShrineKind = 'fire' | 'armor' | 'speed';

export interface ShrineSpot {
  x: number;
  z: number;
  kind: ShrineKind;
  name: string;
  color: number;
}

// THE PIT: relay pylons form a loose triangle around the center deck,
// clear of the z=0 maglev lane and the corner vaults.
export const SHRINE_SPOTS: ShrineSpot[] = [
  { x: 22, z: -30, kind: 'fire', name: 'PULSE RELAY', color: 0x00e5ff },
  { x: -32, z: 26, kind: 'armor', name: 'AEGIS RELAY', color: 0xffaa00 },
  { x: 30, z: 32, kind: 'speed', name: 'VELOCITY RELAY', color: 0xff3d77 },
];

// Phase 1.95 (P1: the map comes to you): the smuggler surfaces NEAR the
// player and doesn't wait around — urgency replaces geography.
const STASH_MIN_DIST = 16;
const STASH_MAX_DIST = 38;
const STASH_LIFETIME = 25;
const STASH_RETRY = 45;

const STASH_FIRST_AT = 110; // the smuggler shows up before the 2:00 spike
const STASH_RADIUS = 2.6;

interface ShrineState {
  spot: ShrineSpot;
  group: THREE.Group;
  crystal: THREE.Mesh;
}

let shrines: ShrineState[] = [];
let initialized = false;
let stashTimer = STASH_FIRST_AT;
let stashMesh: THREE.Group | null = null;
let stashLife = 0;

/** Wayfinding: the live smuggler crate. */
export function getStashPoi(): Poi | null {
  if (!stashMesh) return null;
  return {
    x: stashMesh.position.x,
    z: stashMesh.position.z,
    icon: '💼',
    color: '#ffd75e',
    maxDist: 999,
  };
}

function pickStashSpot(px: number, pz: number): { x: number; z: number } {
  const half = getCurrentLevel().mapWidth / 2 - 15;
  for (let attempt = 0; attempt < 8; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = STASH_MIN_DIST + Math.random() * (STASH_MAX_DIST - STASH_MIN_DIST);
    const x = Math.max(-half, Math.min(half, px + Math.cos(angle) * dist));
    const z = Math.max(-half, Math.min(half, pz + Math.sin(angle) * dist));
    let blocked = false;
    for (const obs of getCurrentLevel().obstacles) {
      if (obs.blocking && isPointInObstacle(x, z, obs)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return { x, z };
  }
  return { x: px + STASH_MIN_DIST, z: pz };
}

function buildShrine(scene: THREE.Scene, spot: ShrineSpot): ShrineState {
  const group = new THREE.Group();
  group.position.set(spot.x, 0, spot.z);

  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x1a2230,
    roughness: 0.4,
    metalness: 0.8,
  });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 0.6, 8), baseMat);
  base.position.y = 0.3;
  group.add(base);

  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x232c3c,
    roughness: 0.35,
    metalness: 0.85,
  });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.6, 6), pillarMat);
  pillar.position.y = 1.9;
  group.add(pillar);

  const crystalMat = new THREE.MeshStandardMaterial({
    color: spot.color,
    emissive: spot.color,
    emissiveIntensity: 1.6,
  });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), crystalMat);
  crystal.position.y = 3.8;
  group.add(crystal);

  scene.add(group);
  return { spot, group, crystal };
}

function buildStash(scene: THREE.Scene, x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.0, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x2a1f30, roughness: 0.5, metalness: 0.7 }),
  );
  crate.position.y = 0.5;
  group.add(crate);

  const seam = new THREE.Mesh(
    new THREE.BoxGeometry(1.65, 0.08, 1.15),
    new THREE.MeshBasicMaterial({ color: 0xffd75e }),
  );
  seam.position.y = 0.62;
  group.add(seam);

  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.35 }),
  );
  beacon.position.y = 3.5;
  group.add(beacon);

  scene.add(group);
  return group;
}

/** Relay crystal glow tracks the door's ready state (driven by BreachSystem). */
export function setShrineReadyByKind(kind: ShrineKind, ready: boolean): void {
  for (const s of shrines) {
    if (s.spot.kind !== kind) continue;
    (s.crystal.material as THREE.MeshStandardMaterial).emissiveIntensity = ready ? 1.6 : 0.15;
  }
}

/** RELAY TOWER breach reward: the district buff (BreachSystem calls this). */
export function grantShrineBuff(kind: ShrineKind, duration: number): void {
  playLevelUp();
  haptics.select();
  switch (kind) {
    case 'fire':
      uiState.shrineFireTimer = duration;
      announce('PULSE RELAY — WEAPONS OVERDRIVEN');
      break;
    case 'armor':
      uiState.shrineArmorTimer = duration;
      announce('AEGIS RELAY — DAMAGE HALVED');
      break;
    case 'speed':
      uiState.shrineSpeedTimer = duration;
      announce('VELOCITY RELAY — SPEED SURGE');
      break;
  }
}

/** Map-exclusive passive. Returns false if the player already owns it. */
export function grantScavengerChip(player: {
  passiveSlots?: { passiveId: string; level: number }[];
}): boolean {
  const slots = player.passiveSlots ?? (player.passiveSlots = []);
  if (slots.some((slot) => slot.passiveId === 'scavenger_chip')) return false;
  slots.push({ passiveId: 'scavenger_chip', level: 1 });
  uiState.passiveSlots = [...slots];
  return true;
}

function openStash(scene: THREE.Scene, player: any): void {
  if (stashMesh) {
    scene.remove(stashMesh);
    stashMesh = null;
  }
  playChestOpen();
  haptics.reward();

  // Credit shower around the crate
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    spawnCredit(
      scene,
      player.position.x + Math.cos(a) * 1.5,
      player.position.z + Math.sin(a) * 1.5,
      4,
    );
  }

  if (grantScavengerChip(player)) {
    announce('SCAVENGER CHIP ACQUIRED — SLUMS EXCLUSIVE');
  } else {
    // Endless restock after the chip is owned: pure payout
    announce('BLACK-MARKET STASH — CREDITS SEIZED');
  }
}

/** Full reset for a no-reload restart. */
export function resetShrineSystem(): void {
  for (const s of shrines) {
    (s.crystal.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.6;
  }
  if (stashMesh) {
    stashMesh.parent?.remove(stashMesh);
    stashMesh = null;
  }
  stashTimer = STASH_FIRST_AT;
  stashLife = 0;
  uiState.shrineFireTimer = 0;
  uiState.shrineArmorTimer = 0;
  uiState.shrineSpeedTimer = 0;
}

/**
 * Per-frame shrine tick: initialize shrine structures on first run, and tick
 * active buff timers. Stash logic has been removed (credits go to wallet).
 *
 * @param {number} dt - delta time since last frame in seconds
 * @param {THREE.Scene} scene - the Three.js scene for shrine structure initialization
 * @returns {void}
 */
export function ShrineSystem(dt: number, scene: THREE.Scene): void {
  if (!initialized) {
    initialized = true;
    shrines = SHRINE_SPOTS.map((spot) => buildShrine(scene, spot));
  }

  const player = world.with('isLocalPlayer', 'position', 'health').first;
  if (!player) return;
  // stash removed

  // Tick active buffs
  if (uiState.shrineFireTimer > 0) uiState.shrineFireTimer -= dt;
  if (uiState.shrineArmorTimer > 0) uiState.shrineArmorTimer -= dt;
  if (uiState.shrineSpeedTimer > 0) uiState.shrineSpeedTimer -= dt;

  // Black-market stash: removed — credits go directly to wallet
}

// Suppress unused-declaration warnings for removed stash code
void (STASH_LIFETIME as unknown);
void (STASH_RETRY as unknown);
void (STASH_RADIUS as unknown);
void (stashTimer as unknown);
void (stashLife as unknown);
void (pickStashSpot as unknown);
void (buildStash as unknown);
void (openStash as unknown);
