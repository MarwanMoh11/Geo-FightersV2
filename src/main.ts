import './style.css';
import * as THREE from 'three';
import { initRenderer } from './core/renderer';
import { world } from './core/world';

// --- SYSTEMS ---
import { InputSystem } from './systems/InputSystem';
import { PlayerControlSystem } from './systems/PlayerControlSystem'; // Replaces MovementSystem
import { PhysicsSystem } from './systems/PhysicsSystem'; // Handles all movement
import { RenderSystem } from './systems/RenderSystem'; // Syncs visuals + Juice
import { AimSystem } from './systems/AimSystem'; // Radar
import { WeaponSystem } from './systems/WeaponSystem'; // Spawns bullets
import { LifecycleSystem } from './systems/LifecycleSystem'; // Cleans up bullets

// 1. Initialize Renderer
const { scene, camera, renderer } = initRenderer();

// 2. Spawn Player (The Red Box with a Gun)
function createPlayer() {
  const geometry = new THREE.BoxGeometry(0.8, 0.8, 1.5);
  const material = new THREE.MeshStandardMaterial({ color: 0xff0044 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  scene.add(mesh);

  world.add({
    isPlayer: true,
    position: new THREE.Vector3(0, 0.5, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    input: { x: 0, y: 0, isShooting: false },
    aimTarget: new THREE.Vector3(),
    transform: mesh,

    // NEW: Weapon Stats
    weapon: {
      cooldownTimer: 0,
      fireRate: 0.1, // Fast fire (10 shots/sec)
      damage: 10,
      bulletSpeed: 20,
      bulletColor: 0xffff00, // Yellow
      bulletLifetime: 2.0, // Range cap (time based)
    },
  });
}

// 3. Spawn Enemy (The Blue Target Dummies)
function createEnemy(x: number, z: number) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x0088ff }); // Blue
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, 0.5, z);
  mesh.castShadow = true;
  scene.add(mesh);

  world.add({
    isEnemy: true,
    position: mesh.position, // Static for now
    transform: mesh,
  });
}

// Execute Spawns
createPlayer();
createEnemy(5, 5);
createEnemy(-5, 5);

// 4. The Game Loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();

  // --- LOGIC PHASE ---
  InputSystem(); // Read keyboard
  AimSystem(); // Update aimTarget (Radar)
  PlayerControlSystem(); // Update velocity based on Input

  // --- COMBAT PHASE ---
  WeaponSystem(dt, scene); // Spawn projectiles if shooting

  // --- PHYSICS PHASE ---
  PhysicsSystem(dt); // Move Player AND Projectiles
  LifecycleSystem(dt, scene); // Delete old projectiles

  // --- RENDER PHASE ---
  RenderSystem(dt); // Sync meshes + Tilt/Bob juice

  // Camera Follow
  const player = world.with('isPlayer', 'transform').first;
  if (player) {
    camera.position.x = player.transform.position.x;
    camera.position.z = player.transform.position.z + 15;
    camera.lookAt(player.transform.position);
  }

  renderer.render(scene, camera);
}

// Start
animate();
