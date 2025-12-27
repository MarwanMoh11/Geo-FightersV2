import './style.css';
import * as THREE from 'three';
import { initRenderer } from './core/renderer';
import { spawnPlayer } from './core/factories';

// Systems
import { InputSystem } from './systems/InputSystem';
import { PlayerControlSystem } from './systems/PlayerControlSystem';
import { PhysicsSystem } from './systems/PhysicsSystem';
import { RenderSystem } from './systems/RenderSystem';
import { AimSystem } from './systems/AimSystem';
import { WeaponSystem } from './systems/WeaponSystem';
import { LifecycleSystem } from './systems/LifecycleSystem';
import { EnemySystem } from './systems/EnemySystem';
import { CollisionSystem } from './systems/CollisionSystem';
import { SpawnerSystem } from './systems/SpawnerSystem';
import { ParticleSystem } from './systems/ParticleSystem';
import { CameraSystem } from './systems/CameraSystem';
import { LootSystem } from './systems/LootSystem'; // <--- NEW IMPORT

const { scene, camera, renderer } = initRenderer();

// --- INITIAL SETUP ---
spawnPlayer(scene);

// --- GAME LOOP ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // 1. Logic
  InputSystem();
  AimSystem();
  PlayerControlSystem();
  EnemySystem(dt);
  SpawnerSystem(dt, scene);

  // 2. Combat
  WeaponSystem(dt, scene);
  CollisionSystem(scene);

  // 3. Physics/Visuals
  PhysicsSystem(dt);
  LifecycleSystem(dt, scene);
  ParticleSystem(dt);

  // 4. Loot
  LootSystem(dt, scene); // <--- RUN LOOT LOGIC

  RenderSystem(dt);
  CameraSystem(dt, camera);

  renderer.render(scene, camera);
}

animate();
