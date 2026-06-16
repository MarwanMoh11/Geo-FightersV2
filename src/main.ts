import './style.css';
import * as THREE from 'three';
import { initRenderer } from './core/renderer';
import { setNetworkScene, sendClientUpdate, sendHostUpdate } from './core/network';

import { spawnPlayer } from './core/factories';
import { getCtx, startMusic } from './core/audio';
import { isPlaying } from './core/GameState';
import { uiState } from './core/UIState.svelte.ts';
import { DEBUG, dlog } from './core/debug';

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
import { DebugSystem } from './systems/DebugSystem';
import { initParticleComputeSystem, ParticleComputeSystem } from './systems/ParticleComputeSystem';
import { initEnemyComputeSystem, EnemyComputeSystem } from './systems/EnemyComputeSystem';
import { initDamageNumbers, DamageNumberSystem } from './systems/DamageNumberSystem';

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

// --- LOADING SCREEN MANAGEMENT ---
const loadingScreen = document.getElementById('loading-screen');
const loadingBar = document.getElementById('loading-bar-fill');
const loadingText = document.getElementById('loading-text');

import { preloadTextures } from './core/assets';

function updateLoadingProgress(loaded: number, total: number) {
  const percent = (loaded / total) * 100;
  if (loadingBar) loadingBar.style.width = `${percent}%`;
  if (loadingText) loadingText.textContent = `LOADING ASSETS ${loaded}/${total}`;
}

function hideLoadingScreen() {
  if (loadingScreen) {
    loadingScreen.classList.add('hidden');
    // Remove from DOM after fade out
    setTimeout(() => {
      loadingScreen.remove();
    }, 500);
  }
}

// --- PRELOAD ALL ASSETS THEN START GAME ---
preloadTextures(updateLoadingProgress).then(async () => {
  if (loadingText) loadingText.textContent = 'INITIALIZING RENDERER';

  const { scene, camera, renderer } = await initRenderer();
  setNetworkScene(scene);

  // Renderer backend indicator (debug builds only)
  if (DEBUG) {
    const backendDebug = document.createElement('div');
    backendDebug.style.cssText =
      'position:fixed;bottom:10px;left:10px;color:#00ff00;background:rgba(0,0,0,0.5);' +
      'padding:5px 10px;font-family:monospace;z-index:9999;pointer-events:none';
    const backend = (renderer as { backend?: { isWebGPUBackend?: boolean } }).backend ?? {};
    backendDebug.textContent = `Renderer: ${backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2'}`;
    document.body.appendChild(backendDebug);
  }

  // --- RAPIER PHYSICS INITIALIZATION ---
  if (loadingText) loadingText.textContent = 'INITIALIZING PHYSICS';
  const { initRapier } = await import('./core/RapierWorld');
  await initRapier();
  // ------------------------------------

  // --- LEVEL SETUP ---
  initLevel(scene); // Spawn ground, obstacles, neon lighting + physics colliders

  // --- COMPUTE SYSTEMS SETUP (WebGPU) ---
  initParticleComputeSystem();
  initEnemyComputeSystem();

  // --- INITIAL SETUP ---
  spawnPlayer(scene);
  initDamageNumbers();

  const { mount } = await import('svelte');
  const App = (await import('./ui/App.svelte')).default;
  mount(App, { target: document.getElementById('app')! });
  initMinimap(); // Initialize minimap canvas (now that Svelte has rendered it)

  hideLoadingScreen();

  startGameLoop(scene, camera, renderer);
});

// --- GAME LOOP (separated for clarity) ---
import { spawnChest } from './systems/ChestSystem';
import { world } from './core/world';

function startGameLoop(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: { render: (scene: THREE.Scene, camera: THREE.Camera) => void },
) {
  // DEBUG ONLY: Press 'C' to spawn a chest for testing (requires ?debug)
  if (DEBUG) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'c' || e.key === 'C') {
        const player = world.with('isPlayer', 'position').first;
        if (player) {
          const x = player.position.x + (Math.random() - 0.5) * 4;
          const z = player.position.z + (Math.random() - 0.5) * 4;
          const rarities: ('common' | 'rare' | 'epic')[] = ['common', 'rare', 'epic'];
          const rarity = rarities[Math.floor(Math.random() * 3)];
          spawnChest(scene, x, z, rarity);
          dlog('[DEBUG] Spawned', rarity, 'chest at', x.toFixed(1), z.toFixed(1));
        }
      }
    });
  }

  // Auto-pause temporarily disabled for multiplayer parallel tab testing
  /*
  const autoPause = () => {
    if (isPlaying() && !isGamePaused && !isGameOver && !uiState.showUpgrade) {
      setGameState('PAUSED');
    }
  };
  window.addEventListener('blur', autoPause);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) autoPause();
  });
  */

  // --- GAME LOOP ---
  const clock = new THREE.Clock();
  // Clamp dt so a backgrounded tab doesn't cause physics to tunnel on return
  const MAX_DT = 1 / 20;
  let netSyncTimer = 0;
  const NET_SYNC_INTERVAL = 1 / 30; // 30Hz throttled network sync

  function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), MAX_DT);

    // Update FPS counter
    updateFPS(performance.now());

    const isMultiplayer = uiState.isMultiplayer;

    // Check if game should run (not in menu, not paused by upgrade modal, not game over)
    let shouldRunGame = false;
    if (isMultiplayer) {
      shouldRunGame = (uiState.gameState === 'PLAYING' || uiState.gameState === 'PAUSED') && !isGameOver;
    } else {
      shouldRunGame = isPlaying() && !isGamePaused && !isGameOver;
    }

    if (!shouldRunGame) {
      // Still render the scene even when paused
      renderer.render(scene, camera);
      return;
    }
    const isHost = uiState.isHost;

    // 1. Logic
    InputSystem();
    AimSystem();
    PlayerControlSystem(dt);

    if (!isMultiplayer || isHost) {
      EnemySystem(dt, scene);
      TimelineSpawnerSystem(dt, scene);
    }

    // 2. Combat
    WeaponSystem(dt, scene);

    if (!isMultiplayer || isHost) {
      CollisionSystem(scene);
    }

    // 3. Physics/Visuals
    PhysicsSystem(dt);
    LifecycleSystem(dt, scene);

    // GPU compute systems (no-op placeholders until WebGPU compute lands;
    // the CPU equivalents below own these updates to avoid double-applying)
    ParticleComputeSystem(dt, renderer);
    EnemyComputeSystem(dt, renderer);

    ParticleSystem(dt);
    LootSystem(dt, scene);
    PassiveEffectsSystem(dt); // Apply health regen, etc.
    OrbitalSystem(dt); // Update orbital weapon projectiles

    if (!isMultiplayer || isHost) {
      ChestSystem(dt, scene);
      FinaleBossSystem(dt, scene);
    }

    // Sync network states (throttled to 30Hz to prevent packet flooding)
    if (isMultiplayer) {
      netSyncTimer += dt;
      if (netSyncTimer >= NET_SYNC_INTERVAL) {
        netSyncTimer = 0;
        if (isHost) {
          sendHostUpdate();
        } else {
          sendClientUpdate();
        }
      }
    }

    // 4. UI & Camera
    RenderSystem(dt);
    CameraSystem(dt, camera);
    DamageNumberSystem(dt, camera);
    UISystem();
    MinimapSystem(); // Update minimap
    if (DEBUG) DebugSystem(scene); // Debug panel (Shift+Alt+D, requires ?debug)

    renderer.render(scene, camera);
  }

  animate();
}
