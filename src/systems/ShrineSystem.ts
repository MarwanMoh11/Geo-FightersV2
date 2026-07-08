// --- SHRINE & STASH SYSTEM (Map 1: Neon Block Slums) ---
// The map's "things to do" layer:
//
// • Three NEON SHRINES, one per district, at fixed landmark spots. Walk onto
//   one to activate a 20s buff themed to its district (fire rate / armor /
//   move speed), then it powers down for 75s. Beacons are static meshes —
//   the only per-frame work is one distance check per shrine.
//
// • The BLACK-MARKET STASH: once per run (solo), a smuggler crate surfaces at
//   one of the map's landmarks. Touching it grants the map-exclusive
//   SCAVENGER CHIP passive (never appears in the level-up pool) plus a
//   credit shower. In endless mode it restocks every 4 minutes.
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

// --- MAP DATA (Neon Block Slums) ---
type ShrineKind = 'fire' | 'armor' | 'speed';

interface ShrineSpot {
  x: number;
  z: number;
  kind: ShrineKind;
  name: string;
  color: number;
}

const SHRINE_SPOTS: ShrineSpot[] = [
  // Neon Courtyard: aggression near the statue plaza
  { x: 160, z: 40, kind: 'fire', name: 'PULSE SHRINE', color: 0x00e5ff },
  // Scrap Yards: survival deep in the maze — worth the detour
  { x: -320, z: 120, kind: 'armor', name: 'AEGIS SHRINE', color: 0xffaa00 },
  // Main Street: speed for the long open lane
  { x: 140, z: -320, kind: 'speed', name: 'VELOCITY SHRINE', color: 0xff3d77 },
];

// Stash surfaces at one of the map's landmarks (rolled per run)
const STASH_SPOTS: { x: number; z: number }[] = [
  { x: 100, z: 145 }, // behind the courtyard statue
  { x: -332, z: -320 }, // between the industrial gate pillars
  { x: 250, z: -320 }, // among the main street taxis
  { x: -360, z: 330 }, // scrap yard dead-end pocket (risky grab)
];

const SHRINE_RADIUS = 5.0;
const SHRINE_BUFF_DURATION = 20;
const SHRINE_COOLDOWN = 75;
const STASH_FIRST_AT = 150; // 2:30 — the smuggler waits for the mid-run lull
const STASH_RESTOCK = 240; // endless mode: restock cadence
const STASH_RADIUS = 2.6;

interface ShrineState {
  spot: ShrineSpot;
  cooldown: number;
  group: THREE.Group;
  crystal: THREE.Mesh;
  ring: THREE.Mesh;
}

let shrines: ShrineState[] = [];
let initialized = false;
let stashTimer = STASH_FIRST_AT;
let stashMesh: THREE.Group | null = null;
let stashGranted = false;

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

  const ringMat = new THREE.MeshBasicMaterial({
    color: spot.color,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(SHRINE_RADIUS - 0.35, SHRINE_RADIUS, 40),
    ringMat,
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  group.add(ring);

  scene.add(group);
  return { spot, cooldown: 0, group, crystal, ring };
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

function setShrineReadyLook(s: ShrineState, ready: boolean): void {
  const mat = s.crystal.material as THREE.MeshStandardMaterial;
  mat.emissiveIntensity = ready ? 1.6 : 0.15;
  (s.ring.material as THREE.MeshBasicMaterial).opacity = ready ? 0.4 : 0.08;
}

function activateShrine(s: ShrineState): void {
  s.cooldown = SHRINE_COOLDOWN;
  setShrineReadyLook(s, false);
  playLevelUp();
  haptics.select();

  switch (s.spot.kind) {
    case 'fire':
      uiState.shrineFireTimer = SHRINE_BUFF_DURATION;
      announce('PULSE SHRINE — WEAPONS OVERDRIVEN');
      break;
    case 'armor':
      uiState.shrineArmorTimer = SHRINE_BUFF_DURATION;
      announce('AEGIS SHRINE — DAMAGE HALVED');
      break;
    case 'speed':
      uiState.shrineSpeedTimer = SHRINE_BUFF_DURATION;
      announce('VELOCITY SHRINE — SPEED SURGE');
      break;
  }
}

function grantScavengerChip(player: {
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
    stashGranted = true;
    announce('SCAVENGER CHIP ACQUIRED — SLUMS EXCLUSIVE');
  } else {
    // Endless restock after the chip is owned: pure payout
    announce('BLACK-MARKET STASH — CREDITS SEIZED');
  }
}

/** Full reset for a no-reload restart. */
export function resetShrineSystem(): void {
  for (const s of shrines) {
    s.cooldown = 0;
    setShrineReadyLook(s, true);
  }
  if (stashMesh) {
    stashMesh.parent?.remove(stashMesh);
    stashMesh = null;
  }
  stashTimer = STASH_FIRST_AT;
  stashGranted = false;
  uiState.shrineFireTimer = 0;
  uiState.shrineArmorTimer = 0;
  uiState.shrineSpeedTimer = 0;
}

export function ShrineSystem(dt: number, scene: THREE.Scene): void {
  if (!initialized) {
    initialized = true;
    shrines = SHRINE_SPOTS.map((spot) => buildShrine(scene, spot));
  }

  const player = world.with('isLocalPlayer', 'position', 'health').first;
  if (!player) return;
  const dead = player.health!.current <= 0;

  // Tick active buffs
  if (uiState.shrineFireTimer > 0) uiState.shrineFireTimer -= dt;
  if (uiState.shrineArmorTimer > 0) uiState.shrineArmorTimer -= dt;
  if (uiState.shrineSpeedTimer > 0) uiState.shrineSpeedTimer -= dt;

  // Shrines: cooldowns + proximity activation
  for (const s of shrines) {
    if (s.cooldown > 0) {
      s.cooldown -= dt;
      if (s.cooldown <= 0) setShrineReadyLook(s, true);
      continue;
    }
    if (dead) continue;
    const dx = player.position.x - s.spot.x;
    const dz = player.position.z - s.spot.z;
    if (dx * dx + dz * dz < SHRINE_RADIUS * SHRINE_RADIUS) {
      activateShrine(s);
    }
  }

  // Black-market stash: solo runs only for now (nothing to sync in co-op)
  if (uiState.isMultiplayer) return;

  if (!stashMesh) {
    // First stash mid-run; once looted, only endless mode restocks it
    if (!stashGranted || uiState.endlessMode) {
      stashTimer -= dt;
      if (stashTimer <= 0) {
        const spot = STASH_SPOTS[Math.floor(Math.random() * STASH_SPOTS.length)];
        stashMesh = buildStash(scene, spot.x, spot.z);
        stashTimer = STASH_RESTOCK;
        announce('BLACK-MARKET STASH LOCATED');
      }
    }
  } else if (!dead) {
    const dx = player.position.x - stashMesh.position.x;
    const dz = player.position.z - stashMesh.position.z;
    if (dx * dx + dz * dz < STASH_RADIUS * STASH_RADIUS) {
      openStash(scene, player);
    }
  }
}
