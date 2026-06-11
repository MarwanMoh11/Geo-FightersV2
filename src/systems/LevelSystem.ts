// --- LEVEL SYSTEM ---
// Spawns level geometry (ground, walls, props) into the scene

import * as THREE from 'three';
import { getCurrentLevel, type Obstacle, type LevelConfig } from '../core/LevelData';
import { loadTexture } from '../core/assets';
import { createStaticCuboid, isRapierInitialized } from '../core/RapierWorld';

// Store references for cleanup
let groundMesh: THREE.Mesh | null = null;
const obstacleMeshes: THREE.Object3D[] = [];

// Shared materials for performance
let wallMaterial: THREE.MeshStandardMaterial | null = null;
let propMaterial: THREE.MeshStandardMaterial | null = null;

/**
 * Initialize the level - creates ground plane and spawns all obstacles
 */
export function initLevel(scene: THREE.Scene): void {
  const level = getCurrentLevel();

  console.log(`[LEVEL] Initializing: ${level.name}`);
  console.log(`[LEVEL] Map size: ${level.mapWidth}x${level.mapHeight}`);
  console.log(`[LEVEL] Obstacles: ${level.obstacles.length}`);

  // Set scene background
  scene.background = new THREE.Color(level.backgroundColor);

  // Create ground plane
  createGround(scene, level);

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

  console.log(`[LEVEL] Initialization complete`);
  if (isRapierInitialized()) {
    console.log(
      `[LEVEL] ✅ ${level.obstacles.filter((o) => o.blocking).length} physics colliders created`,
    );
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

  // Ground material - lighter asphalt for better visibility
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a3a4a, // Brightened from 0x1a1a22
    roughness: 0.85,
    metalness: 0.05,
  });

  // Try to load ground texture if specified
  if (level.groundTexture) {
    try {
      const texture = loadTexture(level.groundTexture);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(level.mapWidth / 50, level.mapHeight / 50);
      groundMaterial.map = texture;
    } catch {
      console.warn('[LEVEL] Ground texture not found, using solid color');
    }
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
  const height = obstacle.height ?? (obstacle.type === 'wall' ? 6 : 3); // Reduced wall height from 8 to 6

  // Create geometry
  const geometry = new THREE.BoxGeometry(obstacle.width, height, obstacle.depth);

  // Get or create material
  let material: THREE.MeshStandardMaterial;
  if (obstacle.type === 'wall') {
    if (!wallMaterial) {
      wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x8a8a9a, // Lighter base color for texture visibility
        roughness: 0.6,
        metalness: 0.15,
      });
      // Try to load wall texture
      try {
        const texture = loadTexture('/textures/environments/wall_texture.png');
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(0.05, 0.1); // Tile based on wall size
        wallMaterial.map = texture;
      } catch {
        console.warn('[LEVEL] Wall texture not found');
      }
    }
    material = wallMaterial;
  } else {
    if (!propMaterial) {
      propMaterial = new THREE.MeshStandardMaterial({
        color: 0x7a7a8a, // Brightened from 0x3a3a45
        roughness: 0.5,
        metalness: 0.35,
      });
    }
    material = propMaterial;
  }

  // Clone material if we need per-obstacle customization
  const meshMaterial = material.clone();

  // Add some color variation based on obstacle type (brightened colors)
  if (obstacle.id.includes('taxi')) {
    meshMaterial.color.setHex(0x8a7a5a); // Brightened yellow/tan
  } else if (obstacle.id.includes('vending')) {
    meshMaterial.color.setHex(0x4a7a9a); // Brightened cyan-ish
    meshMaterial.emissive.setHex(0x00ffff);
    meshMaterial.emissiveIntensity = 0.3; // Boosted glow
  } else if (obstacle.id.includes('bench')) {
    meshMaterial.color.setHex(0x7a7a6a); // Brightened
  } else if (obstacle.id.includes('scrap') || obstacle.id.includes('mech')) {
    meshMaterial.color.setHex(0x9a7a5a); // Brightened rust
  } else if (obstacle.id.includes('container')) {
    meshMaterial.color.setHex(0x5a8a6a); // Brightened green
  } else if (obstacle.id.includes('gate')) {
    meshMaterial.color.setHex(0x7a7a8a); // Brightened grey
  } else if (obstacle.id.includes('barrier')) {
    meshMaterial.color.setHex(0x9a5a5a); // Brightened red
    meshMaterial.emissive.setHex(0xff4400);
    meshMaterial.emissiveIntensity = 0.15; // Boosted
  }

  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.position.set(obstacle.x, height / 2, obstacle.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = obstacle.id;

  scene.add(mesh);
  obstacleMeshes.push(mesh);
}

/**
 * Add neon lighting to enhance cyberpunk atmosphere
 */
function addNeonLighting(scene: THREE.Scene): void {
  // Cyan accent light (Neon Courtyard area) - boosted
  const cyanLight = new THREE.PointLight(0x00ffff, 1.0, 300);
  cyanLight.position.set(100, 25, 100);
  scene.add(cyanLight);

  // Magenta accent light (Industrial Gate area) - boosted
  const magentaLight = new THREE.PointLight(0xff0055, 0.8, 250);
  magentaLight.position.set(-300, 20, -300);
  scene.add(magentaLight);

  // Orange accent light (Scrap Yards) - boosted
  const orangeLight = new THREE.PointLight(0xff6600, 0.6, 280);
  orangeLight.position.set(-300, 20, 100);
  scene.add(orangeLight);

  // Blue accent light (Main Street) - boosted
  const blueLight = new THREE.PointLight(0x0066ff, 0.6, 300);
  blueLight.position.set(100, 20, -300);
  scene.add(blueLight);
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

  // Remove all obstacle meshes
  for (const mesh of obstacleMeshes) {
    scene.remove(mesh);
    if (mesh instanceof THREE.Mesh) {
      mesh.geometry.dispose();
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
    }
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
