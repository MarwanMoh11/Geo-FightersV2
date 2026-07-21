// --- LEVEL SYSTEM ---
// Spawns level geometry (ground, walls, props) into the scene

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

// CC0 texture cache (ambientCG — see public/textures/environments/CREDITS.txt)
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
    // Grazing-angle tiling (the top-down camera sees the ground at a slant)
    // shimmers without anisotropic filtering, worst on mobile screens
    tex.anisotropy = 4;
    textureCache.set(key, tex);
  }
  return tex;
}

// Shared materials for performance
let wallMaterial: THREE.MeshStandardMaterial | null = null;
let propMaterial: THREE.MeshStandardMaterial | null = null;

/**
 * Initialize the level - creates ground plane and spawns all obstacles
 */
export function initLevel(scene: THREE.Scene): void {
  const level = getCurrentLevel();

  dlog(`[LEVEL] Initializing: ${level.name}`);
  dlog(`[LEVEL] Map size: ${level.mapWidth}x${level.mapHeight}`);
  dlog(`[LEVEL] Obstacles: ${level.obstacles.length}`);

  // Set scene background + distance fog so the horizon melts into the void
  scene.background = new THREE.Color(level.backgroundColor);
  scene.fog = new THREE.Fog(level.backgroundColor, 70, 180);

  // Create ground plane
  createGround(scene, level);

  // Neon dress: faint grid overlay + glowing boundary strips
  addNeonGrid(scene, level);
  addBoundaryGlow(scene, level);

  // THE PIT dressing: void apron, center deck, maglev lane, data-gates, CORE
  addPitDecor(scene, level);

  // Spawn all obstacles (visual + physics)
  for (const obstacle of level.obstacles) {
    spawnObstacle(scene, obstacle);

    // Create Rapier physics collider for blocking obstacles
    if (obstacle.blocking && isRapierInitialized()) {
      const height = obstacle.height ?? (obstacle.type === 'wall' ? 6 : 3);
      createStaticCuboid(
        obstacle.x,
        obstacle.z,
        obstacle.width / 2, // halfWidth
        height / 2, // halfHeight
        obstacle.depth / 2, // halfDepth
      );
    }
  }

  // Add ambient neon lighting for cyberpunk mood
  addNeonLighting(scene);

  dlog(`[LEVEL] Initialization complete`);
  if (isRapierInitialized()) {
    dlog(`[LEVEL] ${level.obstacles.filter((o) => o.blocking).length} physics colliders created`);
  }
}

/**
 * Faint cyan grid laid over the ground — sells the "neon arena" look and
 * gives the player a motion reference while sprinting through empty areas.
 */
function addNeonGrid(scene: THREE.Scene, level: LevelConfig): void {
  const grid = new THREE.GridHelper(
    Math.max(level.mapWidth, level.mapHeight),
    Math.max(level.mapWidth, level.mapHeight) / 10,
    0x00e5ff,
    0x103044,
  );
  grid.position.y = 0.02;
  const gridMaterial = grid.material as THREE.Material;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.18;
  gridMaterial.depthWrite = false;
  grid.renderOrder = 2; // above the district decks (see addDistrictDecks)
  scene.add(grid);
  obstacleMeshes.push(grid);
}

/**
 * Glowing strips along the map edges so the playable bounds read at a
 * glance instead of being an invisible wall.
 */
function addBoundaryGlow(scene: THREE.Scene, level: LevelConfig): void {
  const halfW = level.mapWidth / 2;
  const halfH = level.mapHeight / 2;
  const stripMaterial = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
  const horizontal = new THREE.BoxGeometry(level.mapWidth, 0.5, 0.35);
  const vertical = new THREE.BoxGeometry(0.35, 0.5, level.mapHeight);

  const strips = [
    { geometry: horizontal, x: 0, z: -halfH },
    { geometry: horizontal, x: 0, z: halfH },
    { geometry: vertical, x: -halfW, z: 0 },
    { geometry: vertical, x: halfW, z: 0 },
  ];

  for (const { geometry, x, z } of strips) {
    const strip = new THREE.Mesh(geometry, stripMaterial);
    strip.position.set(x, 0.25, z);
    scene.add(strip);
    obstacleMeshes.push(strip);
  }
}

/**
 * Create the ground plane with texture
 */
function createGround(scene: THREE.Scene, level: LevelConfig): void {
  // Clean up existing ground
  if (groundMesh) {
    scene.remove(groundMesh);
    groundMesh.geometry.dispose();
    if (groundMesh.material instanceof THREE.Material) {
      groundMesh.material.dispose();
    }
  }

  // Create ground geometry
  const groundGeometry = new THREE.PlaneGeometry(level.mapWidth, level.mapHeight);

  // Ground: tiled CC0 asphalt, tinted dark so the neon reads on top of it
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x565a68, // multiplies the texture — keeps the slums murky
    roughness: 0.85,
    metalness: 0.15,
  });
  if (level.groundTexture) {
    groundMaterial.map = loadTexture(level.groundTexture, level.mapWidth / 40);
  }

  groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
  groundMesh.rotation.x = -Math.PI / 2; // Lay flat
  groundMesh.position.y = 0;
  groundMesh.receiveShadow = true;

  scene.add(groundMesh);
}

/**
 * Spawn a single obstacle (wall or prop) into the scene
 */
function spawnObstacle(scene: THREE.Scene, obstacle: Obstacle): void {
  const height = obstacle.height ?? (obstacle.type === 'wall' ? 6 : 3);

  // Create geometry
  const geometry = new THREE.BoxGeometry(obstacle.width, height, obstacle.depth);

  // Get or create material
  let material: THREE.MeshStandardMaterial;
  if (obstacle.type === 'wall') {
    if (!wallMaterial) {
      wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a3a45, // Cyber-grey monolith
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

  // Clone material if we need per-obstacle customization
  const meshMaterial = material.clone();

  // Real surface texture when the obstacle declares one (CC0 assets)
  if (obstacle.asset) {
    meshMaterial.map = loadTexture(obstacle.asset, 1);
    meshMaterial.color.setHex(0xbbbbbb); // near-white so the texture shows through
  }

  // Add some color variation based on obstacle type
  if (obstacle.id.includes('taxi')) {
    meshMaterial.color.setHex(0x8a7a5a); // Dull yellow
  } else if (obstacle.id.includes('vending')) {
    meshMaterial.color.setHex(0x3a4c5a); // Dull blue
    meshMaterial.emissive.setHex(0x00aaff);
    meshMaterial.emissiveIntensity = 0.4;
  } else if (obstacle.id.includes('bench')) {
    meshMaterial.color.setHex(0x5a5a66);
  } else if (obstacle.id.includes('scrap') || obstacle.id.includes('mech')) {
    meshMaterial.color.setHex(0x7a6555); // Rust
  } else if (obstacle.id.includes('container')) {
    meshMaterial.color.setHex(0x3a5a4a); // Cyber-green
  } else if (obstacle.id.includes('barrier')) {
    meshMaterial.color.setHex(0x8a3a3a); // Red warning
    meshMaterial.emissive.setHex(0xff3300);
    meshMaterial.emissiveIntensity = 0.25;
  }

  const group = new THREE.Group();
  group.position.set(obstacle.x, 0, obstacle.z);

  const mainMesh = new THREE.Mesh(geometry, meshMaterial);
  mainMesh.position.y = height / 2;
  mainMesh.castShadow = true;
  mainMesh.receiveShadow = true;
  mainMesh.name = obstacle.id;
  group.add(mainMesh);

  // If it's a wall, add a glowing neon-cyan cap plate on top
  if (obstacle.type === 'wall') {
    const capGeo = new THREE.BoxGeometry(obstacle.width * 1.02, 0.1, obstacle.depth * 1.02);
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 1.2,
    });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = height + 0.05;
    cap.name = `${obstacle.id}_cap`;
    group.add(cap);
  }

  scene.add(group);
  obstacleMeshes.push(group);
}

/**
 * Add neon lighting to enhance cyberpunk atmosphere.
 * Point lights are expensive per-fragment on old GPUs, so the whole set is
 * toggled off on the Low quality tier (live, when the setting changes).
 */
const neonLights: THREE.PointLight[] = [];

function addNeonLighting(scene: THREE.Scene): void {
  // Cyan accent light (Neon Courtyard area) - boosted
  const cyanLight = new THREE.PointLight(0x00ffff, 1.0, 300);
  cyanLight.position.set(100, 25, 100);

  // Magenta accent light (Industrial Gate area) - boosted
  const magentaLight = new THREE.PointLight(0xff0055, 0.8, 250);
  magentaLight.position.set(-300, 20, -300);

  // Orange accent light (Scrap Yards) - boosted
  const orangeLight = new THREE.PointLight(0xff6600, 0.6, 280);
  orangeLight.position.set(-300, 20, 100);

  // Blue accent light (Main Street) - boosted
  const blueLight = new THREE.PointLight(0x0066ff, 0.6, 300);
  blueLight.position.set(100, 20, -300);

  neonLights.length = 0;
  neonLights.push(cyanLight, magentaLight, orangeLight, blueLight);

  const applyLightQuality = () => {
    const enabled = getQualityProfile().neonLights;
    for (const light of neonLights) light.visible = enabled;
  };

  for (const light of neonLights) scene.add(light);
  applyLightQuality();
  onSettingsChange(applyLightQuality);
}

/**
 * THE PIT set dressing: the void apron the arena floats on, the riveted
 * center deck, the maglev hazard lane crossing z=0, THE CORE monument, and
 * the eight data-gates enemies pour in from. Everything static and merged
 * where it repeats — a handful of draw calls total.
 */
function addPitDecor(scene: THREE.Scene, level: LevelConfig): void {
  const half = level.mapWidth / 2;
  const _m = new THREE.Matrix4();

  // Mobile z-fight guard: ground decals sit 0.012 above the ground plane,
  // which 16-bit / tiled mobile depth buffers cannot resolve at camera
  // distance — the planes flicker through each other. Decals never write
  // depth; painter's order (renderOrder) layers them over the ground.
  const deckLayer = (mesh: THREE.Mesh) => {
    (mesh.material as THREE.Material).depthWrite = false;
    mesh.renderOrder = 1;
  };

  // --- VOID APRON: a dark platform under/around the arena so the camera
  // never shows raw background past the walls — the pit floats in a
  // datacenter void, and the seam reads intentional.
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(level.mapWidth * 4, level.mapHeight * 4),
    new THREE.MeshStandardMaterial({ color: 0x06060d, roughness: 0.95, metalness: 0.05 }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -1.5;
  scene.add(apron);
  obstacleMeshes.push(apron);

  // --- CENTER DECK: riveted metal plaza around THE CORE
  const deck = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 64),
    new THREE.MeshStandardMaterial({
      map: loadTexture('/textures/environments/deck_metalplates.jpg', 4),
      color: 0x4c5260,
      roughness: 0.7,
      metalness: 0.35,
    }),
  );
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(0, 0.012, 0);
  deckLayer(deck);
  scene.add(deck);
  obstacleMeshes.push(deck);

  // --- MAGLEV LANE: the hazard line crossing the arena's center (z = 0).
  // MapEventSystem's MAGLEV RUN sends the train down this lane.
  const railParts: THREE.BufferGeometry[] = [];
  for (const zOff of [-1.2, 1.2]) {
    const rail = new THREE.BoxGeometry(level.mapWidth, 0.1, 0.55);
    _m.makeTranslation(0, 0.04, zOff);
    rail.applyMatrix4(_m);
    railParts.push(rail);
  }
  railsMesh = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(railParts),
    // Idle rails whisper (the lane crosses mid-screen constantly in the
    // small arena); setRailGlow flares them white-hot for the MAGLEV RUN.
    new THREE.MeshBasicMaterial({ color: RAIL_IDLE_COLOR, depthWrite: false }),
  );
  railsMesh.renderOrder = 3; // ground decal — see the z-fight note above
  scene.add(railsMesh);
  obstacleMeshes.push(railsMesh);

  // --- THE CORE: holographic monument on the center plinth
  const statue = new THREE.Group();
  statue.position.set(0, 0, -20); // atop the statue_base obstacle
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 3.6, 3, 8),
    new THREE.MeshStandardMaterial({ color: 0x1c2430, roughness: 0.4, metalness: 0.8 }),
  );
  pedestal.position.y = 2.5;
  statue.add(pedestal);
  const holo = new THREE.Mesh(
    new THREE.OctahedronGeometry(2.6, 1),
    new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
    }),
  );
  holo.position.y = 7;
  statue.add(holo);
  const holoCore = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color: 0x66f2ff, transparent: true, opacity: 0.7 }),
  );
  holoCore.position.y = 7;
  statue.add(holoCore);
  scene.add(statue);
  obstacleMeshes.push(statue);

  // --- DATA-GATES: for each gate, a glowing panel set into the wall's inner
  // face + a floor threshold decal. Frame posts merge into one mesh. Panel
  // materials are stored per-gate so the spawner can telegraph breaches
  // (pulseGate → updateGateFx decay).
  gateMats.length = 0;
  gateHeat.length = 0;
  const postParts: THREE.BufferGeometry[] = [];
  for (const gate of PIT_GATES) {
    const alongX = gate.nz !== 0; // gate opening runs along the X axis
    const panelW = gate.width;
    const panelH = 7;

    const panelMat = new THREE.MeshBasicMaterial({
      color: GATE_IDLE_COLOR,
      transparent: true,
      opacity: 0.85,
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), panelMat);
    // Flush against the wall's inner face, looking into the arena
    panel.position.set(gate.x + gate.nx * 0.4, panelH / 2, gate.z + gate.nz * 0.4);
    panel.rotation.y = Math.atan2(gate.nx, gate.nz);
    scene.add(panel);
    obstacleMeshes.push(panel);
    gateMats.push(panelMat);
    gateHeat.push(0);

    // Floor threshold: a short decal strip in front of the gate
    const threshold = new THREE.Mesh(
      new THREE.PlaneGeometry(alongX ? panelW : 3.4, alongX ? 3.4 : panelW),
      new THREE.MeshBasicMaterial({
        color: GATE_IDLE_COLOR,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    threshold.rotation.x = -Math.PI / 2;
    threshold.position.set(gate.x + gate.nx * 2.4, 0.03, gate.z + gate.nz * 2.4);
    threshold.renderOrder = 3;
    scene.add(threshold);
    obstacleMeshes.push(threshold);

    // Frame posts at the opening's edges
    for (const side of [-1, 1]) {
      const post = new THREE.BoxGeometry(1.1, 9.6, 1.1);
      const px = gate.x + (alongX ? side * (panelW / 2 + 0.8) : gate.nx * 0.2);
      const pz = gate.z + (alongX ? gate.nz * 0.2 : side * (panelW / 2 + 0.8));
      _m.makeTranslation(px, 4.8, pz);
      post.applyMatrix4(_m);
      postParts.push(post);
    }
  }
  const posts = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(postParts),
    new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.5, metalness: 0.7 }),
  );
  scene.add(posts);
  obstacleMeshes.push(posts);

  // Corner accent light for the pit replaces the slums district lights via
  // addNeonLighting (positions there are player-scale, still fine here).
  void half;
}

// --- DATA-GATE TELEGRAPH FX ---
// The spawner pulses a gate when enemies pour through it; the panel flares
// hot and decays back to idle. One color lerp per gate per frame — free.
const GATE_IDLE_COLOR = 0x0d4a55;
const GATE_HOT_COLOR = 0xff3d77;
const gateMats: THREE.MeshBasicMaterial[] = [];
const gateHeat: number[] = [];
const _gateIdle = new THREE.Color(GATE_IDLE_COLOR);
const _gateHot = new THREE.Color(GATE_HOT_COLOR);
let gatesSealed = false;

/** Flare a gate's panel (index into PIT_GATES). Called by the spawner. */
export function pulseGate(index: number): void {
  if (index >= 0 && index < gateHeat.length) gateHeat[index] = 1;
}

/** Boss arena: gates seal (hold hot red) while true. */
export function setGatesSealed(sealed: boolean): void {
  gatesSealed = sealed;
}

/** Per-frame gate glow decay. Called from the main loop. */
export function updateGateFx(dt: number): void {
  for (let i = 0; i < gateMats.length; i++) {
    if (gatesSealed) {
      gateMats[i].color.copy(_gateHot);
      continue;
    }
    if (gateHeat[i] <= 0) continue;
    gateHeat[i] = Math.max(0, gateHeat[i] - dt * 1.6);
    gateMats[i].color.copy(_gateIdle).lerp(_gateHot, gateHeat[i]);
  }
}

// MAGLEV RUN event hook: the rails flare white-hot during the telegraph
const RAIL_IDLE_COLOR = 0x0e3d46;
let railsMesh: THREE.Mesh | null = null;
export function setRailGlow(on: boolean): void {
  if (!railsMesh) return;
  (railsMesh.material as THREE.MeshBasicMaterial).color.setHex(on ? 0xaef8ff : RAIL_IDLE_COLOR);
  railsMesh.scale.y = on ? 8 : 1;
}

/**
 * Clean up level resources
 */
export function disposeLevel(scene: THREE.Scene): void {
  // Remove ground
  if (groundMesh) {
    scene.remove(groundMesh);
    groundMesh.geometry.dispose();
    if (groundMesh.material instanceof THREE.Material) {
      groundMesh.material.dispose();
    }
    groundMesh = null;
  }

  // Remove and dispose all obstacle groups and sub-meshes
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

  // Dispose shared materials
  if (wallMaterial) {
    wallMaterial.dispose();
    wallMaterial = null;
  }
  if (propMaterial) {
    propMaterial.dispose();
    propMaterial = null;
  }
}
