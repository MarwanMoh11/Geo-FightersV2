import './style.css';
import * as THREE from 'three';
import { initRenderer } from './core/renderer';

import { spawnPlayer } from './core/factories';
import { getCtx, startMusic } from './core/audio';
import { isPlaying } from './core/GameState';

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
import { TimelineSpawnerSystem } from './systems/TimelineSpawner';
import { ParticleSystem } from './systems/ParticleSystem';
import { CameraSystem } from './systems/CameraSystem';
import { LootSystem } from './systems/LootSystem';
import { ChestSystem } from './systems/ChestSystem';
import { UISystem } from './systems/UISystem';
import { isGamePaused } from './systems/UpgradeSystem';
import { isGameOver } from './systems/GameManager';
import { updateFPS } from './systems/MainMenuSystem';

// --- AUDIO UNLOCK & MUSIC START ---
const unlockAudio = () => {
  const ctx = getCtx();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().then(() => {
      startMusic();
    });
  } else {
    startMusic();
  }
};

// Listen for first interaction
document.body.addEventListener('click', unlockAudio, { once: true });
document.body.addEventListener('touchstart', unlockAudio, { once: true });
const { scene, camera, renderer } = initRenderer();

// --- INITIAL SETUP ---
spawnPlayer(scene);

// --- DEBUG: Press 'C' to spawn a chest for testing ---
import { spawnChest } from './systems/ChestSystem';
import { world } from './core/world';

document.addEventListener('keydown', (e) => {
  if (e.key === 'c' || e.key === 'C') {
    const player = world.with('isPlayer', 'position').first;
    if (player) {
      const x = player.position.x + (Math.random() - 0.5) * 4;
      const z = player.position.z + (Math.random() - 0.5) * 4;
      const rarities: ('common' | 'rare' | 'epic')[] = ['common', 'rare', 'epic'];
      const rarity = rarities[Math.floor(Math.random() * 3)];
      spawnChest(scene, x, z, rarity);
      console.log('[DEBUG] Spawned', rarity, 'chest at', x.toFixed(1), z.toFixed(1));
    }
  }
});

// --- GAME LOOP ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();

  // Update FPS counter
  updateFPS(performance.now());

  // Check if game should run (not in menu, not paused by upgrade modal, not game over)
  const shouldRunGame = isPlaying() && !isGamePaused && !isGameOver;

  if (!shouldRunGame) {
    // Still render the scene even when paused
    renderer.render(scene, camera);
    return;
  }

  // 1. Logic
  InputSystem();
  AimSystem();
  PlayerControlSystem();
  EnemySystem(dt);
  TimelineSpawnerSystem(dt, scene);

  // 2. Combat
  WeaponSystem(dt, scene);
  CollisionSystem(scene);

  // 3. Physics/Visuals
  PhysicsSystem(dt);
  LifecycleSystem(dt, scene);
  ParticleSystem(dt);
  LootSystem(dt, scene);
  ChestSystem(dt, scene);

  // 4. UI & Camera
  RenderSystem(dt);
  CameraSystem(dt, camera);
  UISystem();

  renderer.render(scene, camera);
}

animate();
