// --- MAP EVENT SCHEDULER (Phase 1.95, Pillar P4: the map breathes on a clock) ---
// One announced event every ~75 s, rotating so no two consecutive repeats:
//
//   SUPPLY DROP — a crate telegraphs and slams down within a screen of the
//     player (Survivor.io's signature, adapted): 60% a chest, 40% consumables.
//   MAGLEV RUN — the dead rail line wakes up: 3 s glow telegraph, then a
//     light-wall train sweeps the map killing everything on the tracks
//     (players take heavy damage — bait the horde onto the rails).
//   NEON SURGE — one district's signage supercharges: XP counts double
//     inside it for 25 s, marked by a beacon column.
//
// Opening choreography: the first supply drop lands at 0:20 on-screen, and at
// 0:45 the nearest ready shrine fires a beacon column so new players learn
// shrines exist. Solo/host authority; one event live at a time.

import * as THREE from 'three';
import { world } from '../core/world';
import { uiState, announce } from '../core/UIState.svelte.ts';
import { getCurrentLevel, isPointInObstacle } from '../core/LevelData';
import { spawnChest } from './ChestSystem';
import { handleEnemyDeath } from './CollisionSystem';
import { setRailGlow } from './LevelSystem';
import { getShrinePois } from './ShrineSystem';
import { playLevelUp } from '../core/audio';
import type { Poi } from './WayfindingSystem';

const EVENT_INTERVAL = 75;
const FIRST_SUPPLY_AT = 20; // opening choreography: teach drops immediately
const SHRINE_BEACON_AT = 45; // ...then teach that shrines exist

const RAIL_Z = -190; // the maglev line from LevelSystem's decor
const TRAIN_SPEED = 150; // crosses one screen in ~0.6s — visible, dodgeable
const TRAIN_HALF_LEN = 15;
const TRAIN_KILL_HALF_WIDTH = 4.5;
const TRAIN_PLAYER_DAMAGE = 25;

const SURGE_DURATION = 25;
const DISTRICTS = [
  { name: 'NEON COURTYARD', x1: -150, z1: -150, x2: 400, z2: 400 },
  { name: 'MAIN STREET', x1: -200, z1: -400, x2: 400, z2: -200 },
  { name: 'SCRAP YARDS', x1: -400, z1: -150, x2: -180, z2: 400 },
];

type EventKind = 'supply' | 'maglev' | 'surge';
const ROTATION: EventKind[] = ['supply', 'maglev', 'supply', 'surge'];

let timer = FIRST_SUPPLY_AT;
let rotationIdx = 0;
let shrineBeaconFired = false;
let elapsed = 0;

// Live event state
let telegraph: { x: number; z: number; ttl: number } | null = null;
let train: { mesh: THREE.Mesh; x: number; phase: 'telegraph' | 'running'; ttl: number } | null =
  null;
let surgeMesh: THREE.Mesh | null = null;
const beacons: { mesh: THREE.Object3D; ttl: number }[] = [];

function isHostOrSolo(): boolean {
  return !uiState.isMultiplayer || uiState.isHost;
}

/** Sites that deserve a wayfinding arrow while an event is live. */
export function getEventPois(): Poi[] {
  const pois: Poi[] = [];
  if (telegraph) {
    pois.push({ x: telegraph.x, z: telegraph.z, icon: '📦', color: '#ffd75e', maxDist: 999 });
  }
  if (uiState.neonSurge) {
    const s = uiState.neonSurge;
    pois.push({
      x: (s.x1 + s.x2) / 2,
      z: (s.z1 + s.z2) / 2,
      icon: '✨',
      color: '#ffd75e',
      maxDist: 999,
    });
  }
  return pois;
}

function spawnBeacon(scene: THREE.Scene, x: number, z: number, color: number, ttl = 2.5): void {
  // Top-down camera rule: beacons must read from ABOVE. A short additive
  // pillar + wide ground disc glows instead of walling off the screen
  // (a tall cylinder puts the camera inside it and fills the frame).
  const group = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 1.1, 9, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  pillar.position.y = 4.5;
  group.add(pillar);
  const disc = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 3.4, 32),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.07;
  group.add(disc);
  group.position.set(x, 0, z);
  scene.add(group);
  beacons.push({ mesh: group, ttl });
}

function pickDropPoint(px: number, pz: number): { x: number; z: number } {
  const half = getCurrentLevel().mapWidth / 2 - 15;
  for (let attempt = 0; attempt < 8; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 14 + Math.random() * 9; // always within roughly one screen
    const x = THREE.MathUtils.clamp(px + Math.cos(angle) * dist, -half, half);
    const z = THREE.MathUtils.clamp(pz + Math.sin(angle) * dist, -half, half);
    let blocked = false;
    for (const obs of getCurrentLevel().obstacles) {
      if (obs.blocking && isPointInObstacle(x, z, obs)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return { x, z };
  }
  return { x: px + 12, z: pz };
}

function startSupplyDrop(scene: THREE.Scene, px: number, pz: number): void {
  const spot = pickDropPoint(px, pz);
  telegraph = { x: spot.x, z: spot.z, ttl: 1.6 };
  spawnBeacon(scene, spot.x, spot.z, 0xffd75e, 1.6);
  announce('SUPPLY DROP INBOUND');
  playLevelUp();
}

function resolveSupplyDrop(scene: THREE.Scene): void {
  if (!telegraph) return;
  const { x, z } = telegraph;
  telegraph = null;
  if (Math.random() < 0.6) {
    spawnChest(scene, x, z, Math.random() < 0.3 ? 'rare' : 'common');
  } else {
    const types = ['medkit', 'magnet', 'bomb'];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      world.add({
        isPickup: true,
        pickupType: types[i],
        position: new THREE.Vector3(x + Math.cos(a) * 2, 0.8, z + Math.sin(a) * 2),
        velocity: new THREE.Vector3(),
      });
    }
  }
}

function startMaglev(scene: THREE.Scene): void {
  announce('MAGLEV INBOUND — CLEAR THE TRACKS');
  setRailGlow(true);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(TRAIN_HALF_LEN * 2, 3, 4),
    new THREE.MeshBasicMaterial({ color: 0x99f6ff }),
  );
  mesh.position.set(-430, 1.5, RAIL_Z);
  mesh.visible = false;
  scene.add(mesh);
  train = { mesh, x: -430, phase: 'telegraph', ttl: 3 };
}

function tickMaglev(dt: number, scene: THREE.Scene): void {
  if (!train) return;
  if (train.phase === 'telegraph') {
    train.ttl -= dt;
    if (train.ttl <= 0) {
      train.phase = 'running';
      train.mesh.visible = true;
    }
    return;
  }
  train.x += TRAIN_SPEED * dt;
  train.mesh.position.x = train.x;

  // Everything on the tracks dies; players take a heavy hit instead
  for (const enemy of [...world.with('isEnemy', 'position', 'health')]) {
    if (!enemy.health) continue;
    if (Math.abs(enemy.position.z - RAIL_Z) > TRAIN_KILL_HALF_WIDTH) continue;
    if (Math.abs(enemy.position.x - train.x) > TRAIN_HALF_LEN + 2) continue;
    enemy.health.current = 0;
    handleEnemyDeath(enemy, scene);
  }
  for (const p of world.with('isPlayer', 'position', 'health')) {
    if (!p.health || p.health.current <= 0 || (p.invulnTimer ?? 0) > 0) continue;
    if (Math.abs(p.position.z - RAIL_Z) > TRAIN_KILL_HALF_WIDTH) continue;
    if (Math.abs(p.position.x - train.x) > TRAIN_HALF_LEN) continue;
    p.health.current -= TRAIN_PLAYER_DAMAGE;
    p.invulnTimer = 1.0;
    p.hitFlashTimer = 0.2;
  }

  if (train.x > 430) {
    scene.remove(train.mesh);
    train.mesh.geometry.dispose();
    (train.mesh.material as THREE.Material).dispose();
    train = null;
    setRailGlow(false);
  }
}

function startSurge(scene: THREE.Scene): void {
  const district = DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)];
  uiState.neonSurge = { ...district, timer: SURGE_DURATION };
  announce(`NEON SURGE: ${district.name} — DOUBLE XP`);
  const cx = (district.x1 + district.x2) / 2;
  const cz = (district.z1 + district.z2) / 2;
  spawnBeacon(scene, cx, cz, 0xffd75e, SURGE_DURATION);

  surgeMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(district.x2 - district.x1, district.z2 - district.z1),
    new THREE.MeshBasicMaterial({
      color: 0xffd75e,
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  surgeMesh.rotation.x = -Math.PI / 2;
  surgeMesh.position.set(cx, 0.03, cz);
  scene.add(surgeMesh);
}

function tickSurge(dt: number, scene: THREE.Scene): void {
  if (!uiState.neonSurge) return;
  uiState.neonSurge.timer -= dt;
  if (uiState.neonSurge.timer <= 0) {
    uiState.neonSurge = null;
    if (surgeMesh) {
      scene.remove(surgeMesh);
      surgeMesh.geometry.dispose();
      (surgeMesh.material as THREE.Material).dispose();
      surgeMesh = null;
    }
  }
}

/** Debug (?debug console): force the next scheduler fire to be this event. */
let forcedEvent: EventKind | null = null;
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) {
  (window as unknown as { __fireEvent: (k: EventKind) => void }).__fireEvent = (k) => {
    forcedEvent = k;
    timer = 0;
  };
}

/** Full reset for a no-reload restart. */
export function resetMapEvents(): void {
  timer = FIRST_SUPPLY_AT;
  rotationIdx = 0;
  shrineBeaconFired = false;
  elapsed = 0;
  telegraph = null;
  uiState.neonSurge = null;
  if (train) {
    train.mesh.parent?.remove(train.mesh);
    train = null;
    setRailGlow(false);
  }
  if (surgeMesh) {
    surgeMesh.parent?.remove(surgeMesh);
    surgeMesh = null;
  }
  for (const b of beacons) b.mesh.parent?.remove(b.mesh);
  beacons.length = 0;
}

export function MapEventSystem(dt: number, scene: THREE.Scene): void {
  if (!isHostOrSolo()) return;
  const player = world.with('isLocalPlayer', 'position').first;
  if (!player) return;

  elapsed += dt;

  // Beacon columns fade out on their own clock
  for (let i = beacons.length - 1; i >= 0; i--) {
    const b = beacons[i];
    b.ttl -= dt;
    const fade = Math.min(1, b.ttl * 0.8);
    b.mesh.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.min(0.35, fade * 0.35);
      }
    });
    if (b.ttl <= 0) {
      scene.remove(b.mesh);
      b.mesh.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      });
      beacons.splice(i, 1);
    }
  }

  // Opening choreography beat 2: point at the nearest ready shrine
  if (!shrineBeaconFired && elapsed >= SHRINE_BEACON_AT) {
    shrineBeaconFired = true;
    const shrines = getShrinePois();
    if (shrines.length) {
      let best = shrines[0];
      let bestD = Infinity;
      for (const s of shrines) {
        const d = (s.x - player.position.x) ** 2 + (s.z - player.position.z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      spawnBeacon(scene, best.x, best.z, 0x36e6ff, 4);
      announce('SHRINE SIGNAL DETECTED');
    }
  }

  // Live event ticks
  if (telegraph) {
    telegraph.ttl -= dt;
    if (telegraph.ttl <= 0) resolveSupplyDrop(scene);
  }
  tickMaglev(dt, scene);
  tickSurge(dt, scene);

  // Scheduler: next event when nothing is mid-flight
  if (telegraph || train) return;
  timer -= dt;
  if (timer > 0) return;
  timer = EVENT_INTERVAL;

  let kind = ROTATION[rotationIdx % ROTATION.length];
  rotationIdx++;
  if (forcedEvent) {
    kind = forcedEvent;
    forcedEvent = null;
  }
  switch (kind) {
    case 'supply':
      startSupplyDrop(scene, player.position.x, player.position.z);
      break;
    case 'maglev':
      startMaglev(scene);
      break;
    case 'surge':
      startSurge(scene);
      break;
  }
}
