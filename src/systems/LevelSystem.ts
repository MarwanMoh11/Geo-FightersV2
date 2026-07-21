// --- LEVEL SYSTEM ---
// Builds THE PIT: a cyberpunk data-colosseum floating in a server void.
//
// Design language (the level IS one composed picture):
//   • RADIAL HIERARCHY — glowing reactor ring at center, clean dark
//     fight-floor mid-field, hot architectural rim. The eye always knows
//     where center is, and the dark floor keeps neon enemies readable.
//   • ARCHITECTURE, NOT BOXES — walls carry a pilaster rhythm + a continuous
//     emissive trim ring; gates are recessed portals with frames and
//     beacons; each corner vault has its own silhouette and accent color.
//   • A PLACE, NOT A VOID — a distant server-rack skyline and platform
//     under-glow surround the arena (medium+ tiers).
//
// Performance: everything is static and merged where it repeats. Collision
// stays 100% data-driven from LevelData obstacles; visuals here are free to
// be sculptural because Rapier never sees them.

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { getCurrentLevel, PIT_GATES, type Obstacle, type LevelConfig } from '../core/LevelData';
import { createStaticCuboid, isRapierInitialized } from '../core/RapierWorld';
import { dlog } from '../core/debug';
import { getQualityProfile } from '../core/quality';
import { onSettingsChange } from '../core/SettingsManager';

// Store references for cleanup
let groundMesh: THREE.Mesh | null = null;
const obstacleMeshes: THREE.Object3D[] = [];

// --- PALETTE (one voice for the whole arena) ---
const C = {
  floor: 0x11141d,
  floorTrace: 0x1d4550, // circuit traces baked into the floor texture
  wall: 0x171b26,
  wallDark: 0x0e1119,
  metal: 0x232a3a,
  trim: 0x36e6ff, // arena ring light (matches UI primary)
  trimDim: 0x0d4a55,
  gateIdle: 0x0d4a55,
  gateHot: 0xff3d77,
  laneEdge: 0x11525e,
  armory: 0xff8c3a,
  bank: 0xffcc33,
  substation: 0x9dff57,
  stash: 0xc46bff,
  depot: 0xffd75e,
  beaconRed: 0xff2244,
};

// CC0 texture cache (kept for generic/prop fallback + debug sandbox)
const textureCache = new Map<string, THREE.Texture>();
function loadTexture(url: string, repeatX = 1, repeatY = repeatX): THREE.Texture {
  const key = `${url}|${repeatX}|${repeatY}`;
  let tex = textureCache.get(key);
  if (!tex) {
    tex = new THREE.TextureLoader().load(url);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    textureCache.set(key, tex);
  }
  return tex;
}

// --- PROCEDURAL TEXTURES (canvas — zero downloads, zero network) ---

/** Circuit-board floor tile: dark base, faint grid, sparse emissive traces. */
function makeCircuitTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#11141d';
  ctx.fillRect(0, 0, size, size);

  // Fine grid (barely-there — a motion reference while sprinting)
  ctx.strokeStyle = 'rgba(66, 84, 110, 0.14)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= size; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  // Panel seams (heavier lines on a coarser rhythm)
  ctx.strokeStyle = 'rgba(8, 10, 16, 0.9)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= size; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  // Sparse circuit traces with via-dots (deterministic layout, tiles cleanly)
  ctx.strokeStyle = 'rgba(52, 160, 178, 0.16)';
  ctx.fillStyle = 'rgba(52, 160, 178, 0.28)';
  ctx.lineWidth = 2;
  const traces = [
    [16, 48, 112, 48, 112, 112],
    [208, 16, 208, 80, 144, 80],
    [48, 208, 48, 144, 96, 144],
    [176, 208, 176, 176, 240, 176],
  ];
  for (const t of traces) {
    ctx.beginPath();
    ctx.moveTo(t[0], t[1]);
    ctx.lineTo(t[2], t[3]);
    ctx.lineTo(t[4], t[5]);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(t[4], t[5], 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Radial vignette: transparent center → dark edges. Composes the arena. */
function makeVignetteTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 40, 128, 128, 132);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.72, 'rgba(0,0,0,0.05)');
  g.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Shared fallback materials (generic obstacles / debug sandbox)
let wallMaterial: THREE.MeshStandardMaterial | null = null;
let propMaterial: THREE.MeshStandardMaterial | null = null;

// Obstacles that get sculpted custom visuals instead of the generic box.
const CUSTOM_IDS = new Set([
  'wall_n',
  'wall_s',
  'wall_e',
  'wall_w',
  'armory',
  'databank',
  'substation',
  'stashden',
  'vending_1',
  'vending_2',
  'vending_3',
  'vending_4',
  'statue_base',
  'container_1',
  'container_2',
]);

/**
 * Initialize the level - creates ground plane and spawns all obstacles
 */
export function initLevel(scene: THREE.Scene): void {
  const level = getCurrentLevel();
  const isPit = level.name === 'THE PIT';

  dlog(`[LEVEL] Initializing: ${level.name}`);
  dlog(`[LEVEL] Map size: ${level.mapWidth}x${level.mapHeight}`);
  dlog(`[LEVEL] Obstacles: ${level.obstacles.length}`);

  // Scene mood: background + fog melt the far skyline into the void
  scene.background = new THREE.Color(level.backgroundColor);
  scene.fog = new THREE.Fog(level.backgroundColor, 90, 260);

  createGround(scene, level, isPit);

  if (isPit) {
    buildPitFloorDressing(scene, level);
    buildPitWalls(scene, level);
    buildPitGates(scene);
    buildMaglevLane(scene, level);
    buildTheCore(scene);
    buildVaults(scene);
    buildDepotsAndContainers(scene);
    buildVoidSurround(scene, level);
  }

  // Spawn obstacles: physics ALWAYS from data; generic visuals only for
  // obstacles without a sculpted counterpart above.
  for (const obstacle of level.obstacles) {
    if (!isPit || !CUSTOM_IDS.has(obstacle.id)) {
      spawnObstacle(scene, obstacle);
    }
    if (obstacle.blocking && isRapierInitialized()) {
      const height = obstacle.height ?? (obstacle.type === 'wall' ? 6 : 3);
      createStaticCuboid(
        obstacle.x,
        obstacle.z,
        obstacle.width / 2,
        height / 2,
        obstacle.depth / 2,
      );
    }
  }

  addArenaLighting(scene);

  dlog(`[LEVEL] Initialization complete`);
  if (isRapierInitialized()) {
    dlog(`[LEVEL] ${level.obstacles.filter((o) => o.blocking).length} physics colliders created`);
  }
}

/**
 * Ground plane. THE PIT uses the procedural circuit-board surface; other
 * levels (debug sandbox) fall back to their declared file texture.
 */
function createGround(scene: THREE.Scene, level: LevelConfig, isPit: boolean): void {
  if (groundMesh) {
    scene.remove(groundMesh);
    groundMesh.geometry.dispose();
    if (groundMesh.material instanceof THREE.Material) groundMesh.material.dispose();
  }

  const groundGeometry = new THREE.PlaneGeometry(level.mapWidth, level.mapHeight);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.22,
  });

  if (isPit) {
    const tex = makeCircuitTexture();
    tex.repeat.set(level.mapWidth / 16, level.mapHeight / 16);
    groundMaterial.map = tex;
  } else if (level.groundTexture) {
    groundMaterial.map = loadTexture(level.groundTexture, level.mapWidth / 40);
    groundMaterial.color.setHex(0x565a68);
  } else {
    groundMaterial.color.setHex(level.backgroundColor);
  }

  groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = 0;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
}

// Decal discipline (mobile z-fight guard): ground decals never write depth;
// painter's order (renderOrder 1..4) layers them over the ground instead.
function decal(mesh: THREE.Mesh, order: number): THREE.Mesh {
  (mesh.material as THREE.Material).depthWrite = false;
  mesh.renderOrder = order;
  return mesh;
}

/** Vignette + reactor ring: the radial composition of the whole arena. */
function buildPitFloorDressing(scene: THREE.Scene, level: LevelConfig): void {
  // Edge vignette darkens toward the walls → the center reads bright
  const vignette = new THREE.Mesh(
    new THREE.PlaneGeometry(level.mapWidth, level.mapHeight),
    new THREE.MeshBasicMaterial({ map: makeVignetteTexture(), transparent: true }),
  );
  vignette.rotation.x = -Math.PI / 2;
  vignette.position.y = 0.015;
  decal(vignette, 1);
  scene.add(vignette);
  obstacleMeshes.push(vignette);

  // Reactor seal: concentric rings around THE CORE plinth (0, -20)
  const ringSpecs = [
    { r0: 10.4, r1: 11.0, opacity: 0.5 },
    { r0: 13.2, r1: 13.4, opacity: 0.22 },
  ];
  for (const s of ringSpecs) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r0, s.r1, 64),
      new THREE.MeshBasicMaterial({
        color: C.trim,
        transparent: true,
        opacity: s.opacity,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.03, -20);
    decal(ring, 2);
    scene.add(ring);
    obstacleMeshes.push(ring);
  }
}

/**
 * Arena walls: dark base slab + pilaster rhythm + one continuous emissive
 * trim ring at mid-height. Three merged meshes total.
 */
function buildPitWalls(scene: THREE.Scene, level: LevelConfig): void {
  const half = level.mapWidth / 2;
  const H = 10; // visual wall height (collider is 9 — close enough to read)
  const T = 6; // wall thickness
  const _m = new THREE.Matrix4();

  const baseParts: THREE.BufferGeometry[] = [];
  const pilasterParts: THREE.BufferGeometry[] = [];
  const trimParts: THREE.BufferGeometry[] = [];

  // Base slabs (n/s/e/w)
  const slabs = [
    { x: 0, z: -half - T / 2, w: level.mapWidth + T * 2, d: T },
    { x: 0, z: half + T / 2, w: level.mapWidth + T * 2, d: T },
    { x: half + T / 2, z: 0, w: T, d: level.mapHeight },
    { x: -half - T / 2, z: 0, w: T, d: level.mapHeight },
  ];
  for (const s of slabs) {
    const g = new THREE.BoxGeometry(s.w, H, s.d);
    _m.makeTranslation(s.x, H / 2, s.z);
    g.applyMatrix4(_m);
    baseParts.push(g);
  }

  // Pilasters every 10u along each inner face, skipping the gate openings
  const gateSpots = new Set([-35, 35]);
  for (let a = -60; a <= 60; a += 10) {
    if ([...gateSpots].some((g) => Math.abs(a - g) < 8)) continue;
    for (const side of [
      { x: a, z: -half + 0.5 }, // north inner face
      { x: a, z: half - 0.5 }, // south
      { x: half - 0.5, z: a }, // east
      { x: -half + 0.5, z: a }, // west
    ]) {
      const g = new THREE.BoxGeometry(1.6, H + 0.8, 1.6);
      _m.makeTranslation(side.x, (H + 0.8) / 2, side.z);
      g.applyMatrix4(_m);
      pilasterParts.push(g);
    }
  }

  // Corner towers anchor the silhouette
  for (const cx of [-half - 1, half + 1]) {
    for (const cz of [-half - 1, half + 1]) {
      const g = new THREE.BoxGeometry(9, 17, 9);
      _m.makeTranslation(cx, 8.5, cz);
      g.applyMatrix4(_m);
      pilasterParts.push(g);
    }
  }

  // Continuous trim ring on the inner faces at y=7 (the arena "ring light")
  const trimY = 7;
  const trims = [
    { x: 0, z: -half + 0.15, w: level.mapWidth, d: 0.25 },
    { x: 0, z: half - 0.15, w: level.mapWidth, d: 0.25 },
    { x: half - 0.15, z: 0, w: 0.25, d: level.mapHeight },
    { x: -half + 0.15, z: 0, w: 0.25, d: level.mapHeight },
  ];
  for (const t of trims) {
    const g = new THREE.BoxGeometry(t.w, 0.35, t.d);
    _m.makeTranslation(t.x, trimY, t.z);
    g.applyMatrix4(_m);
    trimParts.push(g);
  }
  // Tower caps join the trim family
  for (const cx of [-half - 1, half + 1]) {
    for (const cz of [-half - 1, half + 1]) {
      const g = new THREE.BoxGeometry(9.4, 0.4, 9.4);
      _m.makeTranslation(cx, 17.1, cz);
      g.applyMatrix4(_m);
      trimParts.push(g);
    }
  }

  const base = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(baseParts),
    new THREE.MeshStandardMaterial({ color: C.wall, roughness: 0.65, metalness: 0.35 }),
  );
  base.receiveShadow = true;
  scene.add(base);
  obstacleMeshes.push(base);

  const pilasters = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(pilasterParts),
    new THREE.MeshStandardMaterial({ color: C.metal, roughness: 0.5, metalness: 0.6 }),
  );
  pilasters.castShadow = true;
  scene.add(pilasters);
  obstacleMeshes.push(pilasters);

  const trim = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(trimParts),
    new THREE.MeshBasicMaterial({ color: C.trim }),
  );
  scene.add(trim);
  obstacleMeshes.push(trim);

  // Red aircraft beacons on the four towers
  const beaconParts: THREE.BufferGeometry[] = [];
  for (const cx of [-half - 1, half + 1]) {
    for (const cz of [-half - 1, half + 1]) {
      const g = new THREE.SphereGeometry(0.55, 8, 6);
      _m.makeTranslation(cx, 18, cz);
      g.applyMatrix4(_m);
      beaconParts.push(g);
    }
  }
  const beacons = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(beaconParts),
    new THREE.MeshBasicMaterial({ color: C.beaconRed }),
  );
  scene.add(beacons);
  obstacleMeshes.push(beacons);
}

// --- DATA-GATES ---
// Recessed portals with frames, lintels, hazard thresholds, and beacon
// lights. Panel materials are stored per-gate for the spawner telegraph.
const GATE_IDLE = new THREE.Color(C.gateIdle);
const GATE_HOT = new THREE.Color(C.gateHot);
const gateMats: THREE.MeshBasicMaterial[] = [];
const gateHeat: number[] = [];
let gatesSealed = false;

function buildPitGates(scene: THREE.Scene): void {
  gateMats.length = 0;
  gateHeat.length = 0;
  const _m = new THREE.Matrix4();
  const frameParts: THREE.BufferGeometry[] = [];
  const hazardParts: THREE.BufferGeometry[] = [];

  for (const gate of PIT_GATES) {
    const alongX = gate.nz !== 0;
    const panelW = gate.width;
    const panelH = 6.4;

    // Glow panel, slightly recessed into the wall face
    const panelMat = new THREE.MeshBasicMaterial({
      color: C.gateIdle,
      transparent: true,
      opacity: 0.9,
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(panelW - 2.2, panelH), panelMat);
    panel.position.set(gate.x + gate.nx * 0.35, panelH / 2, gate.z + gate.nz * 0.35);
    panel.rotation.y = Math.atan2(gate.nx, gate.nz);
    scene.add(panel);
    obstacleMeshes.push(panel);
    gateMats.push(panelMat);
    gateHeat.push(0);

    // Frame: two posts + lintel, protruding from the wall face
    for (const side of [-1, 1]) {
      const post = new THREE.BoxGeometry(1.3, 9.4, 1.3);
      const px = gate.x + (alongX ? side * (panelW / 2) : gate.nx * 0.5);
      const pz = gate.z + (alongX ? gate.nz * 0.5 : side * (panelW / 2));
      _m.makeTranslation(px, 4.7, pz);
      post.applyMatrix4(_m);
      frameParts.push(post);
    }
    const lintel = new THREE.BoxGeometry(
      alongX ? panelW + 2.6 : 1.5,
      1.5,
      alongX ? 1.5 : panelW + 2.6,
    );
    _m.makeTranslation(gate.x + gate.nx * 0.5, 8.2, gate.z + gate.nz * 0.5);
    lintel.applyMatrix4(_m);
    frameParts.push(lintel);

    // Hazard threshold: amber warning strip on the floor at the opening
    const strip = new THREE.PlaneGeometry(alongX ? panelW : 2.6, alongX ? 2.6 : panelW);
    _m.makeRotationX(-Math.PI / 2);
    strip.applyMatrix4(_m);
    _m.makeTranslation(gate.x + gate.nx * 2.2, 0.03, gate.z + gate.nz * 2.2);
    strip.applyMatrix4(_m);
    hazardParts.push(strip);
  }

  const frames = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(frameParts),
    new THREE.MeshStandardMaterial({ color: C.metal, roughness: 0.45, metalness: 0.7 }),
  );
  frames.castShadow = true;
  scene.add(frames);
  obstacleMeshes.push(frames);

  const hazards = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(hazardParts),
    new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
  );
  hazards.renderOrder = 3;
  scene.add(hazards);
  obstacleMeshes.push(hazards);
}

/** Flare a gate's panel (index into PIT_GATES). Called by the spawner. */
export function pulseGate(index: number): void {
  if (index >= 0 && index < gateHeat.length) gateHeat[index] = 1;
}

/** Boss arena: gates seal (hold hot) while true. */
export function setGatesSealed(sealed: boolean): void {
  gatesSealed = sealed;
}

/** Per-frame gate glow decay. Called from the main loop. */
export function updateGateFx(dt: number): void {
  for (let i = 0; i < gateMats.length; i++) {
    if (gatesSealed) {
      gateMats[i].color.copy(GATE_HOT);
      continue;
    }
    if (gateHeat[i] <= 0) continue;
    gateHeat[i] = Math.max(0, gateHeat[i] - dt * 1.6);
    gateMats[i].color.copy(GATE_IDLE).lerp(GATE_HOT, gateHeat[i]);
  }
}

// --- MAGLEV LANE ---
// A recessed service channel crossing z=0: dark bed + dashed edge lights.
let laneDashMat: THREE.MeshBasicMaterial | null = null;
let laneBedMat: THREE.MeshBasicMaterial | null = null;

function buildMaglevLane(scene: THREE.Scene, level: LevelConfig): void {
  const _m = new THREE.Matrix4();

  // Channel bed: slightly darker strip — reads as recessed
  laneBedMat = new THREE.MeshBasicMaterial({
    color: 0x080a10,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(level.mapWidth, 5), laneBedMat);
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(0, 0.02, 0);
  bed.renderOrder = 2;
  scene.add(bed);
  obstacleMeshes.push(bed);

  // Edge dashes: small emissive ticks every 5u along both edges
  const dashParts: THREE.BufferGeometry[] = [];
  for (let x = -level.mapWidth / 2 + 3; x <= level.mapWidth / 2 - 3; x += 5) {
    for (const z of [-2.5, 2.5]) {
      const g = new THREE.BoxGeometry(1.6, 0.07, 0.3);
      _m.makeTranslation(x, 0.05, z);
      g.applyMatrix4(_m);
      dashParts.push(g);
    }
  }
  laneDashMat = new THREE.MeshBasicMaterial({ color: C.laneEdge, depthWrite: false });
  const dashes = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(dashParts), laneDashMat);
  dashes.renderOrder = 3;
  scene.add(dashes);
  obstacleMeshes.push(dashes);
}

// MAGLEV RUN event hook: the lane flares white-hot during the telegraph
export function setRailGlow(on: boolean): void {
  if (laneDashMat) laneDashMat.color.setHex(on ? 0xaef8ff : C.laneEdge);
  if (laneBedMat) {
    laneBedMat.color.setHex(on ? 0x5b1220 : 0x080a10);
    laneBedMat.opacity = on ? 0.75 : 0.55;
  }
}

// --- THE CORE ---
// Center monument: layered pedestal, twin tilted energy rings, floating
// octahedron heart. The arena's landmark and light source.
function buildTheCore(scene: THREE.Scene): void {
  const core = new THREE.Group();
  core.position.set(0, 0, -20); // atop the statue_base collider

  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(4.6, 5.4, 1.2, 8),
    new THREE.MeshStandardMaterial({ color: C.metal, roughness: 0.4, metalness: 0.8 }),
  );
  plinth.position.y = 0.6;
  plinth.castShadow = true;
  core.add(plinth);

  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 2.4, 4.4, 8),
    new THREE.MeshStandardMaterial({ color: C.wallDark, roughness: 0.35, metalness: 0.85 }),
  );
  column.position.y = 3.2;
  core.add(column);

  for (const [tilt, y, r] of [
    [0.5, 7.2, 3.4],
    [-0.7, 8.4, 2.5],
  ]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.14, 8, 40),
      new THREE.MeshBasicMaterial({ color: C.trim, transparent: true, opacity: 0.85 }),
    );
    ring.position.y = y;
    ring.rotation.x = Math.PI / 2 + tilt;
    core.add(ring);
  }

  const heart = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.5),
    new THREE.MeshBasicMaterial({ color: 0x9df4ff }),
  );
  heart.position.y = 7.8;
  core.add(heart);
  const shell = new THREE.Mesh(
    new THREE.OctahedronGeometry(2.4, 1),
    new THREE.MeshBasicMaterial({
      color: C.trim,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    }),
  );
  shell.position.y = 7.8;
  core.add(shell);

  scene.add(core);
  obstacleMeshes.push(core);
}

// --- INTERACTION GRAMMAR ---
// Every enterable structure speaks one visual language so "you can USE
// this" reads from across the arena: a recessed doorway that frames
// BreachSystem's glowing door quad, an accent lamp above the opening,
// shallow entry steps, and a light-spill apron on the floor in front.
// Buildings are authored in LOCAL space with the door on the +z face, then
// the whole group is rotated to face its real approach direction — so the
// grammar always lands exactly on the node's trigger point.

function bodyMat(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.45 });
}

function metalMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: C.metal, roughness: 0.4, metalness: 0.7 });
}

/**
 * The doorway kit: recess + frame + lamp + steps + floor apron, on the
 * local +z face at distance `face` from the group origin.
 */
function addDoorway(
  g: THREE.Group,
  face: number,
  doorW: number,
  doorH: number,
  accent: number,
): void {
  // Recess: a dark inset so the additive breach door glows out of a void
  const recess = new THREE.Mesh(
    new THREE.PlaneGeometry(doorW, doorH),
    new THREE.MeshBasicMaterial({ color: 0x04060b }),
  );
  recess.position.set(0, doorH / 2, face + 0.03);
  g.add(recess);

  // Frame posts + lintel around the opening
  const fm = metalMat();
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, doorH + 0.8, 0.8), fm);
    post.position.set(side * (doorW / 2 + 0.45), (doorH + 0.8) / 2, face + 0.3);
    post.castShadow = true;
    g.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + 1.9, 0.7, 1.0), fm);
  lintel.position.set(0, doorH + 0.85, face + 0.3);
  lintel.castShadow = true;
  g.add(lintel);

  // Accent lamp above the door — the "OPEN" sign
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(doorW * 0.85, 0.3, 0.32),
    new THREE.MeshBasicMaterial({ color: accent }),
  );
  lamp.position.set(0, doorH + 0.42, face + 0.55);
  g.add(lamp);

  // Entry steps down to arena level
  const sm = new THREE.MeshStandardMaterial({ color: C.wallDark, roughness: 0.6, metalness: 0.4 });
  const stepSpecs = [
    { h: 0.34, out: 0.9 },
    { h: 0.17, out: 1.9 },
  ];
  for (const s of stepSpecs) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(doorW + 1.8, s.h, 1.1), sm);
    step.position.set(0, s.h / 2, face + s.out);
    step.receiveShadow = true;
    g.add(step);
  }

  // Light spill on the floor — the standing spot glows in the node's color
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(doorW + 3.2, 4.8),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.11,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, 0.045, face + 2.7);
  apron.renderOrder = 3;
  g.add(apron);
}

// --- CORNER VAULTS ---
// Rebuilt around their entrances. Solid decoration stays inside each
// collider footprint; only flat steps/aprons spill onto walkable floor.
function buildVaults(scene: THREE.Scene): void {
  // ARMORY (-52,-52 · faces +z): military checkpoint — twin turret pods
  // flank the recessed blast door; ammo cases stacked against the facade.
  {
    const g = new THREE.Group();
    g.position.set(-52, 0, -52);

    const body = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 14), bodyMat(C.wall));
    body.position.y = 4;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 10), bodyMat(C.wallDark));
    upper.position.set(0, 9.5, -1);
    upper.castShadow = true;
    g.add(upper);

    // Twin turret pods watching the approach
    for (const side of [-1, 1]) {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 2.6, 10), metalMat());
      pod.position.set(side * 5.4, 9.2, 4.2);
      pod.castShadow = true;
      g.add(pod);
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 2.6), metalMat());
      gun.position.set(side * 5.4, 9.4, 6);
      g.add(gun);
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 8, 6),
        new THREE.MeshBasicMaterial({ color: C.armory }),
      );
      eye.position.set(side * 5.4, 9.4, 7.2);
      g.add(eye);
    }

    // Ammo cases by the door (inside the footprint)
    for (const [cx, cy] of [
      [-5.6, 0.65],
      [-5.6, 1.95],
      [5.9, 0.65],
    ]) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 1.7), bodyMat(0x3a4152));
      box.position.set(cx, cy, 6);
      box.castShadow = true;
      g.add(box);
    }

    // Accent cornice
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(16.3, 0.34, 14.3),
      new THREE.MeshBasicMaterial({ color: C.armory }),
    );
    strip.position.y = 8.2;
    g.add(strip);

    addDoorway(g, 7, 3.8, 4.2, C.armory);
    scene.add(g);
    obstacleMeshes.push(g);
  }

  // DATA BANK (52,-52 · faces +z): grand vault — portico columns frame the
  // entrance, a huge round vault-door dish sits in the recess wall.
  {
    const g = new THREE.Group();
    g.position.set(52, 0, -52);

    const body = new THREE.Mesh(new THREE.BoxGeometry(16, 9, 12), bodyMat(C.wall));
    body.position.y = 4.5;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // Portico: columns either side of the door only — the entrance is the
    // composition's center, not decoration
    for (const cx of [-5.9, -3.1, 3.1, 5.9]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(1.4, 9.8, 1.4), metalMat());
      col.position.set(cx, 4.9, 6.2);
      col.castShadow = true;
      g.add(col);
    }
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(17.4, 1.2, 14), bodyMat(C.wallDark));
    cornice.position.y = 9.9;
    cornice.castShadow = true;
    g.add(cornice);
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(17.6, 0.36, 14.2),
      new THREE.MeshBasicMaterial({ color: C.bank }),
    );
    strip.position.y = 10.6;
    g.add(strip);

    // The vault dish: a big gold-ringed disk above the doorway
    const dish = new THREE.Mesh(
      new THREE.TorusGeometry(1.9, 0.3, 8, 28),
      new THREE.MeshBasicMaterial({ color: C.bank }),
    );
    dish.position.set(0, 6.8, 6.05);
    g.add(dish);

    addDoorway(g, 6, 3.4, 4.2, C.bank);
    scene.add(g);
    obstacleMeshes.push(g);
  }

  // SUBSTATION (-52,52 · faces -z after rotation): live transformer yard —
  // coil stacks arc green, vent grills glow, hazard chevrons at the door.
  {
    const g = new THREE.Group();
    g.position.set(-52, 0, 52);
    g.rotation.y = Math.PI; // authored +z door → real -z approach

    const body = new THREE.Mesh(new THREE.BoxGeometry(14, 5.5, 14), bodyMat(C.wall));
    body.position.y = 2.75;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    for (const cx of [-3.6, 3.6]) {
      const coil = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.3, 4.6, 10), metalMat());
      coil.position.set(cx, 7.7, -2);
      coil.castShadow = true;
      g.add(coil);
      for (let ring = 0; ring < 3; ring++) {
        const disc = new THREE.Mesh(
          new THREE.CylinderGeometry(2.35, 2.35, 0.22, 10),
          new THREE.MeshBasicMaterial({ color: C.substation, transparent: true, opacity: 0.55 }),
        );
        disc.position.set(cx, 6.4 + ring * 1.5, -2);
        g.add(disc);
      }
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 0.9, 1, 8),
        new THREE.MeshBasicMaterial({ color: C.substation }),
      );
      cap.position.set(cx, 10.4, -2);
      g.add(cap);
    }

    // Glowing vent grills flanking the door
    for (const side of [-1, 1]) {
      const vent = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 1.5),
        new THREE.MeshBasicMaterial({ color: C.substation, transparent: true, opacity: 0.4 }),
      );
      vent.position.set(side * 4.6, 2.4, 7.04);
      g.add(vent);
    }

    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(14.3, 0.34, 14.3),
      new THREE.MeshBasicMaterial({ color: C.substation }),
    );
    strip.position.y = 5.7;
    g.add(strip);

    addDoorway(g, 7, 3.4, 3.6, C.substation);
    scene.add(g);
    obstacleMeshes.push(g);
  }

  // STASH DEN (52,52 · faces -x after rotation): smuggler front — shutter
  // slats over the recess, tilted awning, crooked neon sign, crate clutter.
  {
    const g = new THREE.Group();
    g.position.set(52, 0, 52);
    g.rotation.y = -Math.PI / 2; // authored +z door → real -x approach

    const body = new THREE.Mesh(new THREE.BoxGeometry(13, 6, 13), bodyMat(C.wall));
    body.position.y = 3;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    addDoorway(g, 6.5, 3.4, 3.8, C.stash);

    // Half-raised shutter slats hanging in the doorway
    for (let i = 0; i < 3; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.34, 0.2), metalMat());
      slat.position.set(0, 3.5 - i * 0.42, 6.58);
      g.add(slat);
    }

    // Tilted awning over the entrance
    const awning = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.28, 2.6), bodyMat(0x33203f));
    awning.position.set(0, 5.1, 7);
    awning.rotation.x = 0.3;
    awning.castShadow = true;
    g.add(awning);

    // Crooked neon sign beside the door
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 2.8),
      new THREE.MeshBasicMaterial({ color: C.stash, transparent: true, opacity: 0.75 }),
    );
    sign.position.set(4.1, 3.4, 6.56);
    sign.rotation.z = -0.06;
    g.add(sign);

    // Crate clutter against the facade
    for (const [cx, cy, s] of [
      [-4.8, 0.8, 1.6],
      [-4.5, 2.2, 1.2],
      [4.9, 0.7, 1.4],
    ]) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), bodyMat(0x3d4356));
      crate.position.set(cx, cy, 5.6);
      crate.castShadow = true;
      g.add(crate);
    }

    scene.add(g);
    obstacleMeshes.push(g);
  }
}

// --- SUPPLY DEPOT KIOSKS ---
// Vending machines became service kiosks: cantilevered canopy over the
// interaction spot, big menu screen, side light strips, lit floor pad —
// the "stand here" square is architectural, not implied.
function buildDepotKiosk(scene: THREE.Scene, x: number, z: number, rotY: number): void {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;

  // Machine body (authored 10 wide × 4 deep, door on +z)
  const body = new THREE.Mesh(new THREE.BoxGeometry(10, 5.2, 4), bodyMat(0x1c2330));
  body.position.y = 2.6;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // Menu screen spanning the front
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(7.6, 2.4),
    new THREE.MeshBasicMaterial({ color: C.depot, transparent: true, opacity: 0.8 }),
  );
  screen.position.set(0, 3.1, 2.04);
  g.add(screen);
  // Item shelf glow line under the screen
  const shelf = new THREE.Mesh(
    new THREE.BoxGeometry(7.6, 0.22, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0 }),
  );
  shelf.position.set(0, 1.6, 2.06);
  g.add(shelf);

  // Side light strips
  for (const side of [-1, 1]) {
    const stripLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 4.6, 0.3),
      new THREE.MeshBasicMaterial({ color: C.depot }),
    );
    stripLight.position.set(side * 4.9, 2.5, 1.9);
    g.add(stripLight);
  }

  // Cantilevered canopy over the standing spot (no ground posts — braces
  // hang from the machine top, so nothing solid sits in walkable space)
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(11, 0.34, 6.4), bodyMat(C.wallDark));
  canopy.position.set(0, 5.6, 1.6);
  canopy.castShadow = true;
  g.add(canopy);
  const canopyEdge = new THREE.Mesh(
    new THREE.BoxGeometry(11.1, 0.2, 0.3),
    new THREE.MeshBasicMaterial({ color: C.depot }),
  );
  canopyEdge.position.set(0, 5.6, 4.75);
  g.add(canopyEdge);
  for (const side of [-1, 1]) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 3.6), metalMat());
    brace.position.set(side * 4.6, 5.15, 3.1);
    brace.rotation.x = -0.35;
    g.add(brace);
  }

  // Lit floor pad under the canopy — the interaction square
  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 4),
    new THREE.MeshBasicMaterial({
      color: C.depot,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, 0.045, 3.4);
  pad.renderOrder = 3;
  g.add(pad);

  scene.add(g);
  obstacleMeshes.push(g);
}

// --- DEPOTS + CONTAINERS ---
function buildDepotsAndContainers(scene: THREE.Scene): void {
  const level = getCurrentLevel();

  // Kiosks: authored facing +z, rotated to their approach direction
  // (must mirror BreachSystem's depot door directions)
  buildDepotKiosk(scene, 0, -60, 0); // north wall, faces +z (south)
  buildDepotKiosk(scene, 0, 60, Math.PI); // south wall, faces -z
  buildDepotKiosk(scene, 60, 20, -Math.PI / 2); // east wall, faces -x
  buildDepotKiosk(scene, -60, -20, Math.PI / 2); // west wall, faces +x

  for (const obs of level.obstacles) {
    if (obs.id.startsWith('container_')) {
      const g = new THREE.Group();
      g.position.set(obs.x, 0, obs.z);
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(obs.width, 3.2, obs.depth),
        new THREE.MeshStandardMaterial({ color: 0x27435a, roughness: 0.6, metalness: 0.5 }),
      );
      body.position.y = 1.6;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(obs.width + 0.1, 0.5, obs.depth + 0.1),
        new THREE.MeshBasicMaterial({ color: C.trimDim }),
      );
      stripe.position.y = 2.4;
      g.add(stripe);
      scene.add(g);
      obstacleMeshes.push(g);
    } else if (obs.id === 'statue_base') {
      // Octagonal reactor pad under THE CORE
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(6.4, 7, 1.1, 8),
        new THREE.MeshStandardMaterial({ color: C.metal, roughness: 0.5, metalness: 0.6 }),
      );
      pad.position.set(obs.x, 0.55, obs.z);
      pad.receiveShadow = true;
      scene.add(pad);
      obstacleMeshes.push(pad);
    }
  }
}

// --- VOID SURROUND ---
// The arena floats on a platform in a datacenter void: apron slab with
// under-glow rim + a distant server-rack skyline (medium+ tiers).
function buildVoidSurround(scene: THREE.Scene, level: LevelConfig): void {
  // Platform apron the arena sits on
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(level.mapWidth + 34, 3, level.mapHeight + 34),
    new THREE.MeshStandardMaterial({ color: 0x0a0d15, roughness: 0.85, metalness: 0.25 }),
  );
  apron.position.y = -1.6;
  scene.add(apron);
  obstacleMeshes.push(apron);

  // Under-glow rim: soft cyan halo beneath the platform edge
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(level.mapWidth + 90, level.mapHeight + 90),
    new THREE.MeshBasicMaterial({
      color: C.trimDim,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -3.4;
  scene.add(glow);
  obstacleMeshes.push(glow);

  // Distant server-rack skyline: a broken ring of monoliths with a few
  // emissive status strips. One merged mesh + one strip mesh. Deterministic
  // pseudo-random layout (no Math.random → same city every run).
  const rackParts: THREE.BufferGeometry[] = [];
  const stripParts: THREE.BufferGeometry[] = [];
  const _m = new THREE.Matrix4();
  const R0 = level.mapWidth * 1.35;
  const N = 34;
  for (let i = 0; i < N; i++) {
    const seed = Math.sin(i * 127.1) * 43758.5453;
    const f = seed - Math.floor(seed); // 0..1
    const angle = (i / N) * Math.PI * 2 + f * 0.12;
    const radius = R0 + f * 70;
    const w = 14 + f * 22;
    const h = 26 + ((f * 7919) % 1) * 58;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const g = new THREE.BoxGeometry(w, h, w);
    _m.makeRotationY(angle);
    g.applyMatrix4(_m);
    _m.makeTranslation(x, h / 2 - 6, z);
    g.applyMatrix4(_m);
    rackParts.push(g);

    if (i % 3 === 0) {
      const s = new THREE.BoxGeometry(0.8, h * 0.55, 0.8);
      _m.makeTranslation(
        x - Math.cos(angle) * (w / 2 + 0.6),
        h * 0.4,
        z - Math.sin(angle) * (w / 2 + 0.6),
      );
      s.applyMatrix4(_m);
      stripParts.push(s);
    }
  }
  const racks = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(rackParts),
    new THREE.MeshStandardMaterial({ color: 0x0d1019, roughness: 0.9, metalness: 0.3 }),
  );
  scene.add(racks);
  obstacleMeshes.push(racks);
  const strips = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(stripParts),
    new THREE.MeshBasicMaterial({ color: C.trimDim }),
  );
  scene.add(strips);
  obstacleMeshes.push(strips);

  // Skyline is atmosphere, not gameplay — cull it on the Low tier
  const applySkylineQuality = () => {
    const on = getQualityProfile().neonLights;
    racks.visible = on;
    strips.visible = on;
    glow.visible = on;
  };
  applySkylineQuality();
  onSettingsChange(applySkylineQuality);
}

/**
 * Generic obstacle fallback (debug sandbox / any non-sculpted obstacle).
 */
function spawnObstacle(scene: THREE.Scene, obstacle: Obstacle): void {
  const height = obstacle.height ?? (obstacle.type === 'wall' ? 6 : 3);
  const geometry = new THREE.BoxGeometry(obstacle.width, height, obstacle.depth);

  let material: THREE.MeshStandardMaterial;
  if (obstacle.type === 'wall') {
    if (!wallMaterial) {
      wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a3a45,
        roughness: 0.6,
        metalness: 0.2,
      });
    }
    material = wallMaterial;
  } else {
    if (!propMaterial) {
      propMaterial = new THREE.MeshStandardMaterial({
        color: 0x555566,
        roughness: 0.5,
        metalness: 0.4,
      });
    }
    material = propMaterial;
  }

  const meshMaterial = material.clone();
  if (obstacle.asset) {
    meshMaterial.map = loadTexture(obstacle.asset, 1);
    meshMaterial.color.setHex(0xbbbbbb);
  }

  const group = new THREE.Group();
  group.position.set(obstacle.x, 0, obstacle.z);
  const mainMesh = new THREE.Mesh(geometry, meshMaterial);
  mainMesh.position.y = height / 2;
  mainMesh.castShadow = true;
  mainMesh.receiveShadow = true;
  mainMesh.name = obstacle.id;
  group.add(mainMesh);
  scene.add(group);
  obstacleMeshes.push(group);
}

/**
 * Arena lighting: THE CORE radiates cool light from center; the four vault
 * corners each glow their accent color. Point lights are expensive on old
 * GPUs, so the whole set rides the existing quality toggle.
 */
const arenaLights: THREE.PointLight[] = [];

function addArenaLighting(scene: THREE.Scene): void {
  const coreLight = new THREE.PointLight(0x36e6ff, 1.1, 90);
  coreLight.position.set(0, 14, -20);

  const corners = [
    new THREE.PointLight(C.armory, 0.55, 65),
    new THREE.PointLight(C.bank, 0.55, 65),
    new THREE.PointLight(C.substation, 0.5, 65),
    new THREE.PointLight(C.stash, 0.5, 65),
  ];
  corners[0].position.set(-52, 14, -52);
  corners[1].position.set(52, 14, -52);
  corners[2].position.set(-52, 12, 52);
  corners[3].position.set(52, 12, 52);

  arenaLights.length = 0;
  arenaLights.push(coreLight, ...corners);

  const applyLightQuality = () => {
    const enabled = getQualityProfile().neonLights;
    for (const light of arenaLights) light.visible = enabled;
  };

  for (const light of arenaLights) scene.add(light);
  applyLightQuality();
  onSettingsChange(applyLightQuality);
}

/**
 * Clean up level resources
 */
export function disposeLevel(scene: THREE.Scene): void {
  if (groundMesh) {
    scene.remove(groundMesh);
    groundMesh.geometry.dispose();
    if (groundMesh.material instanceof THREE.Material) {
      groundMesh.material.dispose();
    }
    groundMesh = null;
  }

  for (const obj of obstacleMeshes) {
    scene.remove(obj);
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }
  obstacleMeshes.length = 0;

  if (wallMaterial) {
    wallMaterial.dispose();
    wallMaterial = null;
  }
  if (propMaterial) {
    propMaterial.dispose();
    propMaterial = null;
  }
}
