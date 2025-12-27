import './style.css';
import * as THREE from 'three';
import { initRenderer } from './core/renderer';
import { world } from './core/world';

// Systems
import { InputSystem } from './systems/InputSystem';
import { PlayerControlSystem } from './systems/PlayerControlSystem';
import { PhysicsSystem } from './systems/PhysicsSystem';
import { RenderSystem } from './systems/RenderSystem';
import { AimSystem } from './systems/AimSystem';
import { WeaponSystem } from './systems/WeaponSystem';
import { LifecycleSystem } from './systems/LifecycleSystem';
import { EnemySystem } from './systems/EnemySystem';         // NEW
import { CollisionSystem } from './systems/CollisionSystem'; // NEW

const { scene, camera, renderer } = initRenderer();

// --- PLAYER ---
function createPlayer() {
  // Same as before
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
    weapon: {
      cooldownTimer: 0,
      fireRate: 0.1,
      damage: 10,
      bulletSpeed: 20,
      bulletColor: 0xffff00,
      bulletLifetime: 2.0
    }
  });
}

// --- ENEMY ---
function createEnemy(x: number, z: number) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x0088ff });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, 0.5, z);
  mesh.castShadow = true;
  scene.add(mesh);

  world.add({
    isEnemy: true,
    position: mesh.position,
    velocity: new THREE.Vector3(0, 0, 0), // NEW: Needs velocity to move
    health: { current: 10, max: 10 },     // NEW: Needs health to die
    transform: mesh
  });
}

// Spawn
createPlayer();
createEnemy(10, 10);
createEnemy(-10, 10);
createEnemy(10, -10);
createEnemy(-10, -10);

// --- LOOP ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // 1. Logic
  InputSystem();
  AimSystem();
  PlayerControlSystem();
  EnemySystem(dt); // Move Enemies

  // 2. Combat
  WeaponSystem(dt, scene);
  CollisionSystem(scene); // Kill Enemies

  // 3. Physics/Visuals
  PhysicsSystem(dt);
  LifecycleSystem(dt, scene);
  RenderSystem(dt);

  // Camera
  const player = world.with('isPlayer', 'transform').first;
  if (player) {
    camera.position.x = player.transform.position.x;
    camera.position.z = player.transform.position.z + 15;
    camera.lookAt(player.transform.position);
  }

  renderer.render(scene, camera);
}

animate();