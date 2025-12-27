import './style.css';
import * as THREE from 'three';
import { initRenderer } from './core/renderer';
import { world } from './core/world';
import { spawnPlayer } from './core/factories'; // <--- Import Factory

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
import { SpawnerSystem } from './systems/SpawnerSystem'; // <--- Import Spawner

const { scene, camera, renderer } = initRenderer();

// --- INITIAL SETUP ---
spawnPlayer(scene);

// Note: We don't manually spawn enemies anymore!
// The SpawnerSystem will start doing it automatically.

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
  SpawnerSystem(dt, scene); // <--- Run Spawner

  // 2. Combat
  WeaponSystem(dt, scene);
  CollisionSystem(scene);

  // 3. Physics/Visuals
  PhysicsSystem(dt);
  LifecycleSystem(dt, scene);
  RenderSystem(dt);

  // Camera Follow
  const player = world.with('isPlayer', 'transform').first;
  if (player) {
    camera.position.x = player.transform.position.x;
    camera.position.z = player.transform.position.z + 15;
    camera.lookAt(player.transform.position);
  }

  renderer.render(scene, camera);
}

animate();
