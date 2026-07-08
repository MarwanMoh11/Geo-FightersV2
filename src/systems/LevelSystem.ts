// --- LEVEL SYSTEM ---
// Spawns level geometry (ground, walls, props) into the scene

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { getCurrentLevel, type Obstacle, type LevelConfig } from '../core/LevelData';
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

  // Map 1 dressing: district ground decks, holo-statue, market signs, transit rail
  addDistrictDecks(scene);
  addSlumsDecor(scene);

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
 * District ground decks: large textured patches that make each zone read as
 * its own place from the air. Two static quads — negligible cost.
 */
function addDistrictDecks(scene: THREE.Scene): void {
  // Neon Courtyard: riveted metal plaza deck
  const courtyard = new THREE.Mesh(
    new THREE.PlaneGeometry(540, 540),
    new THREE.MeshStandardMaterial({
      map: loadTexture('/textures/environments/deck_metalplates.jpg', 9),
      color: 0x4c5260,
      roughness: 0.7,
      metalness: 0.35,
    }),
  );
  courtyard.rotation.x = -Math.PI / 2;
  courtyard.position.set(125, 0.012, 125);
  scene.add(courtyard);
  obstacleMeshes.push(courtyard);

  // Scrap Yards: rusted-over floor
  const scrapyard = new THREE.Mesh(
    new THREE.PlaneGeometry(215, 540),
    new THREE.MeshStandardMaterial({
      map: loadTexture('/textures/environments/prop_rust.jpg', 4, 9),
      color: 0x5a4c42,
      roughness: 0.9,
      metalness: 0.1,
    }),
  );
  scrapyard.rotation.x = -Math.PI / 2;
  scrapyard.position.set(-292, 0.012, 125);
  scene.add(scrapyard);
  obstacleMeshes.push(scrapyard);
}

/**
 * Neon Block Slums set dressing: the courtyard holo-statue landmark, the
 * market-row neon signs, and the transit rail line. Everything is static
 * and merged where it repeats — a handful of draw calls total.
 */
function addSlumsDecor(scene: THREE.Scene): void {
  // --- THE FOUNDER: holographic statue on the courtyard pedestal ---
  const statue = new THREE.Group();
  statue.position.set(100, 0, 100);
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 7, 5, 8),
    new THREE.MeshStandardMaterial({ color: 0x1c2430, roughness: 0.4, metalness: 0.8 }),
  );
  pedestal.position.y = 4.5; // rises out of the statue_base plinth
  statue.add(pedestal);
  const holo = new THREE.Mesh(
    new THREE.OctahedronGeometry(4, 1),
    new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
    }),
  );
  holo.position.y = 11;
  statue.add(holo);
  const holoCore = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color: 0x66f2ff, transparent: true, opacity: 0.7 }),
  );
  holoCore.position.y = 11;
  statue.add(holoCore);
  scene.add(statue);
  obstacleMeshes.push(statue);

  // --- MARKET ROW NEON SIGNS: merged into two meshes (poles + panels) ---
  const poleParts: THREE.BufferGeometry[] = [];
  const panelParts: THREE.BufferGeometry[] = [];
  const panelColors = [0x00e5ff, 0xff3d77, 0xffaa00];
  const signSpots = [
    { x: -40, z: -382 },
    { x: 40, z: -382 },
    { x: 130, z: -382 },
    { x: -100, z: -338 },
    { x: 80, z: -308 },
    { x: 250, z: -348 },
  ];
  const _m = new THREE.Matrix4();
  signSpots.forEach((spot, i) => {
    const pole = new THREE.BoxGeometry(0.5, 8, 0.5);
    _m.makeTranslation(spot.x, 4, spot.z);
    pole.applyMatrix4(_m);
    poleParts.push(pole);

    let panel: THREE.BufferGeometry = new THREE.BoxGeometry(6.5, 2.6, 0.3);
    _m.makeTranslation(spot.x, 8.6, spot.z);
    panel = panel.applyMatrix4(_m).toNonIndexed();
    const color = new THREE.Color(panelColors[i % 3]);
    const count = panel.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let v = 0; v < count; v++) {
      colors[v * 3] = color.r;
      colors[v * 3 + 1] = color.g;
      colors[v * 3 + 2] = color.b;
    }
    panel.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    panelParts.push(panel);
  });
  const poles = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(poleParts),
    new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.5, metalness: 0.7 }),
  );
  scene.add(poles);
  obstacleMeshes.push(poles);
  const panels = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(panelParts),
    new THREE.MeshBasicMaterial({ vertexColors: true }),
  );
  scene.add(panels);
  obstacleMeshes.push(panels);

  // --- TRANSIT RAIL: dead maglev line separating street from courtyard ---
  const railParts: THREE.BufferGeometry[] = [];
  for (const zOff of [-1.2, 1.2]) {
    const rail = new THREE.BoxGeometry(800, 0.08, 0.35);
    _m.makeTranslation(0, 0.04, -190 + zOff);
    rail.applyMatrix4(_m);
    railParts.push(rail);
  }
  const rails = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(railParts),
    new THREE.MeshBasicMaterial({ color: 0x00b8cc }),
  );
  scene.add(rails);
  obstacleMeshes.push(rails);
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
