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
import { playMenuBuy } from '../core/audio';
import { getCurrentLevel, isPointInObstacle } from '../core/LevelData';
import { handleEnemyDeath } from './CollisionSystem';
import type { Poi } from './WayfindingSystem';

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

// Phase 1.95 (P1: the map comes to you): the smuggler surfaces NEAR the
// player and doesn't wait around — urgency replaces geography.
const STASH_MIN_DIST = 16;
const STASH_MAX_DIST = 38;
const STASH_LIFETIME = 25;
const STASH_RETRY = 45;

// Vending machines (Phase 1.95): the courtyard's four machines become
// credit slot machines — 15 credits a pull, 45 s restock each.
const VENDING_SPOTS = [
  { x: -50, z: 50 },
  { x: 250, z: 80 },
  { x: 180, z: 300 },
  { x: -80, z: 280 },
];
const VENDING_COST = 15;
const VENDING_COOLDOWN = 45;
const VENDING_RADIUS = 3.4;

const SHRINE_RADIUS = 5.0;
const SHRINE_BUFF_DURATION = 20;
const SHRINE_COOLDOWN = 75;
const STASH_FIRST_AT = 110; // the smuggler shows up before the 2:00 spike
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
let stashLife = 0;

interface VendingState {
  x: number;
  z: number;
  cooldown: number;
  ring: THREE.Mesh | null;
}
const vendings: VendingState[] = [];

const SHRINE_ICONS: Record<ShrineKind, string> = { fire: '⚡', armor: '🛡️', speed: '💨' };

/** Wayfinding: ready shrines always signposted; ready vendors when nearby. */
export function getShrinePois(): Poi[] {
  const pois: Poi[] = [];
  for (const s of shrines) {
    if (s.cooldown > 0) continue;
    pois.push({
      x: s.spot.x,
      z: s.spot.z,
      icon: SHRINE_ICONS[s.spot.kind],
      color: '#' + s.spot.color.toString(16).padStart(6, '0'),
      maxDist: 999,
    });
  }
  for (const v of vendings) {
    if (v.cooldown > 0) continue;
    pois.push({ x: v.x, z: v.z, icon: '🎰', color: '#ffd75e', maxDist: 70 });
  }
  return pois;
}

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
  stashLife = 0;
  for (const v of vendings) {
    v.cooldown = 0;
    if (v.ring) (v.ring.material as THREE.MeshBasicMaterial).opacity = 0.35;
  }
  uiState.shrineFireTimer = 0;
  uiState.shrineArmorTimer = 0;
  uiState.shrineSpeedTimer = 0;
}

export function ShrineSystem(dt: number, scene: THREE.Scene): void {
  if (!initialized) {
    initialized = true;
    shrines = SHRINE_SPOTS.map((spot) => buildShrine(scene, spot));
    for (const spot of VENDING_SPOTS) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(VENDING_RADIUS - 0.3, VENDING_RADIUS, 32),
        new THREE.MeshBasicMaterial({
          color: 0xffd75e,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(spot.x, 0.06, spot.z);
      scene.add(ring);
      vendings.push({ x: spot.x, z: spot.z, cooldown: 0, ring });
    }
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

  // Vending slot machines: walk up with 15 credits for a pull
  const soloOrHost = !uiState.isMultiplayer || uiState.isHost;
  for (const v of vendings) {
    if (v.cooldown > 0) {
      v.cooldown -= dt;
      if (v.cooldown <= 0 && v.ring) {
        (v.ring.material as THREE.MeshBasicMaterial).opacity = 0.35;
      }
      continue;
    }
    if (dead || !soloOrHost || uiState.credits < VENDING_COST) continue;
    const vdx = player.position.x - v.x;
    const vdz = player.position.z - v.z;
    if (vdx * vdx + vdz * vdz >= VENDING_RADIUS * VENDING_RADIUS) continue;

    // The pull
    v.cooldown = VENDING_COOLDOWN;
    if (v.ring) (v.ring.material as THREE.MeshBasicMaterial).opacity = 0.06;
    uiState.credits -= VENDING_COST;
    localStorage.setItem('geo_credits', JSON.stringify(uiState.credits));
    playMenuBuy();
    haptics.reward();

    const roll = Math.random();
    if (roll < 0.6) {
      const types = ['medkit', 'magnet', 'bomb'];
      world.add({
        isPickup: true,
        pickupType: types[Math.floor(Math.random() * 3)],
        position: new THREE.Vector3(v.x, 0.8, v.z + 2.2),
        velocity: new THREE.Vector3(),
      });
      announce('VENDOR: PRIZE DISPENSED');
    } else if (roll < 0.85) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        spawnCredit(scene, v.x + Math.cos(a) * 1.6, v.z + Math.sin(a) * 1.6, 4);
      }
      announce('VENDOR: JACKPOT');
    } else {
      // The machine bites back — at the horde
      announce('VENDOR: VOLTAGE DISCHARGE');
      for (const enemy of world.with('isEnemy', 'position', 'health')) {
        if (!enemy.health) continue;
        const edx = enemy.position.x - v.x;
        const edz = enemy.position.z - v.z;
        if (edx * edx + edz * edz > 14 * 14) continue;
        enemy.health.current -= 40;
        enemy.stunTimer = 1.0;
        enemy.hitFlashTimer = 0.15;
        if (enemy.health.current <= 0) handleEnemyDeath(enemy, scene);
      }
    }
  }

  // Black-market stash: surfaces near the player, leaves if ignored
  if (uiState.isMultiplayer) return;

  if (!stashMesh) {
    // First stash mid-run; after the chip is owned it keeps restocking as a payout
    stashTimer -= dt;
    if (stashTimer <= 0) {
      const spot = pickStashSpot(player.position.x, player.position.z);
      stashMesh = buildStash(scene, spot.x, spot.z);
      stashLife = STASH_LIFETIME;
      stashTimer = STASH_RETRY;
      announce('BLACK-MARKET STASH — GRAB IT FAST');
    }
  } else {
    stashLife -= dt;
    // Last-seconds blink so the departure telegraphs
    stashMesh.visible = stashLife > 5 || Math.sin(stashLife * 12) > -0.2;
    if (stashLife <= 0) {
      stashMesh.parent?.remove(stashMesh);
      stashMesh = null;
    } else if (!dead) {
      const dx = player.position.x - stashMesh.position.x;
      const dz = player.position.z - stashMesh.position.z;
      if (dx * dx + dz * dz < STASH_RADIUS * STASH_RADIUS) {
        openStash(scene, player);
      }
    }
  }
}
