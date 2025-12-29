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
import { FinaleBossSystem } from './systems/FinaleBoss';
import { PassiveEffectsSystem } from './systems/PassiveEffectsSystem';
import { OrbitalSystem } from './systems/OrbitalSystem';
import { updateFPS } from './systems/MainMenuSystem';
import { initLevel } from './systems/LevelSystem';
import { initMinimap, MinimapSystem } from './systems/MinimapSystem';

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

// --- LEVEL SETUP ---
initLevel(scene); // Spawn ground, obstacles, neon lighting
initMinimap();    // Initialize minimap canvas

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
  PassiveEffectsSystem(dt); // Apply health regen, etc.
  OrbitalSystem(dt); // Update orbital weapon projectiles

  // === PROFILED NEW SYSTEMS ===
  const t0 = performance.now();
  ChestSystem(dt, scene);
  const t1 = performance.now();
  FinaleBossSystem(dt, scene);
  const t2 = performance.now();

  // 4. UI & Camera
  RenderSystem(dt);
  CameraSystem(dt, camera);
  const t3 = performance.now();
  UISystem();
  MinimapSystem();  // Update minimap
  const t4 = performance.now();

  // Log slow frames (> 2ms total for new systems)
  const chestTime = t1 - t0;
  const bossTime = t2 - t1;
  const uiTime = t4 - t3;
  const totalNew = chestTime + bossTime + uiTime;

  if (totalNew > 2) {
    console.warn(`[PERF] Slow frame: Chest=${chestTime.toFixed(2)}ms, Boss=${bossTime.toFixed(2)}ms, UI=${uiTime.toFixed(2)}ms`);
  }

  renderer.render(scene, camera);
}

animate();
