import './style.css';
import * as THREE from 'three';
import { initRenderer } from './core/renderer';

import { spawnPlayer } from './core/factories';
import { getCtx, startMusic } from './core/audio'; // <--- NEW IMPORT

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
import { LootSystem } from './systems/LootSystem';
import { UISystem } from './systems/UISystem';
import { isGamePaused } from './systems/UpgradeSystem';
import { isGameOver } from './systems/GameManager';

// --- AUDIO UNLOCK & MUSIC START ---
const unlockAudio = () => {
  const ctx = getCtx();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  }
  // Start the Cyberpunk Loop
  startMusic();
};

// Listen for first interaction
document.body.addEventListener('click', unlockAudio, { once: true });
document.body.addEventListener('touchstart', unlockAudio, { once: true });
const { scene, camera, renderer } = initRenderer();

// --- INITIAL SETUP ---
spawnPlayer(scene);

// --- GAME LOOP ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();

  if (isGamePaused || isGameOver) {
    renderer.render(scene, camera);
    return;
  }

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
  LootSystem(dt, scene);

  // 4. UI & Camera
  RenderSystem(dt);
  CameraSystem(dt, camera);
  UISystem();

  renderer.render(scene, camera);
}

animate();
