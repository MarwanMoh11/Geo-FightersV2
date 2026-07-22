import './style.css';
import * as THREE from 'three';
import { initRenderer } from './core/renderer';
import {
  setNetworkScene,
  sendClientUpdate,
  sendHostUpdate,
  NetSmoothingSystem,
} from './core/network';

import { spawnPlayer, initializePlayerForRun, applyCharacterModel } from './core/factories';
import { getCtx, startMusic, muteForBackground, unmuteFromBackground } from './core/audio';
import { isPlaying, onStateChange, setGameState } from './core/GameState';
import { uiState } from './core/UIState.svelte.ts';
import { DEBUG, dlog } from './core/debug';
import { initPWA } from './core/pwa';
import { getFpsLimit } from './core/SettingsManager';
import { portalLoadingFinished, isPortalEmbed } from './core/portal';
import { updateDynamicResolution } from './core/quality';

// Register service worker + install-prompt brokering as early as possible —
// but never inside a portal iframe: the portal's CDN origin isn't ours, and a
// SW/install prompt there is at best dead weight, at worst a QA rejection.
// (Portal SDK boot itself already ran in boot.ts before this module loaded.)
if (!isPortalEmbed()) initPWA();

// Systems
import { InputSystem } from './systems/InputSystem';
import { PlayerControlSystem } from './systems/PlayerControlSystem';
import { PhysicsSystem } from './systems/PhysicsSystem';
import { RenderSystem, prewarmEnemyMeshes } from './systems/RenderSystem';
import { AimSystem } from './systems/AimSystem';
import { WeaponSystem } from './systems/WeaponSystem';
import { LifecycleSystem } from './systems/LifecycleSystem';
import { EnemySystem } from './systems/EnemySystem';
import { CollisionSystem } from './systems/CollisionSystem';
import { TimelineSpawnerSystem } from './systems/TimelineSpawner';
import { ParticleSystem } from './systems/ParticleSystem';
import { CameraSystem } from './systems/CameraSystem';
import { LootSystem, LootRenderSystem } from './systems/LootSystem';
import { ChestSystem } from './systems/ChestSystem';
import { UISystem } from './systems/UISystem';
import { isGamePaused } from './systems/UpgradeSystem';
import { isGameOver, SoloDeathWatchdog } from './systems/GameManager';
import { FinaleBossSystem } from './systems/FinaleBoss';
import { PassiveEffectsSystem } from './systems/PassiveEffectsSystem';
import { OrbitalSystem } from './systems/OrbitalSystem';
import { OverloadSystem } from './systems/OverloadSystem';
import { AnomalySystem } from './systems/AnomalySystem';
import { updateFPS } from './systems/MainMenuSystem';
import { MusicDirector } from './systems/MusicDirector';
import { initLevel, updateGateFx } from './systems/LevelSystem';
// MinimapSystem + WayfindingSystem retired with THE PIT: the whole 140-unit
// arena is on/near screen, so a radar and off-screen arrows were clutter.
// Both modules stay in the repo for future large stages.
import { DebugSystem } from './systems/DebugSystem';
import { benchmark } from './core/Benchmark';
import { initParticleComputeSystem, ParticleComputeSystem } from './systems/ParticleComputeSystem';
import { initEnemyComputeSystem, EnemyComputeSystem } from './systems/EnemyComputeSystem';
import { initDamageNumbers, DamageNumberSystem } from './systems/DamageNumberSystem';
import { CoopSystem } from './systems/CoopSystem';
import { ShrineSystem } from './systems/ShrineSystem';
import { DestructibleSystem } from './systems/DestructibleSystem';
import { PickupSystem } from './systems/PickupSystem';
import { MapEventSystem } from './systems/MapEventSystem';
import { BreachSystem } from './systems/BreachSystem';
import { ClientCombatFxSystem } from './systems/ClientCombatFxSystem';

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

  const { scene, camera, renderer, renderFrame } = await initRenderer();
  setNetworkScene(scene);

  // Debug hook: expose UI state + ECS world for the dev console / automated tests
  if (DEBUG) {
    (window as unknown as { uiState: typeof uiState }).uiState = uiState;
    (window as unknown as { world: typeof world }).world = world;
    // Swap the local player's model live (character rig inspection)
    (window as unknown as { applyCharacterModel: typeof applyCharacterModel }).applyCharacterModel =
      applyCharacterModel;
    // Balance harness: scripted bot + metrics sampler (window.__balance)
    import('./core/BalanceHarness').then((m) => m.initBalanceHarness());
  }

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

  // Pre-warm every enemy type's instanced meshes + shaders now, then render one
  // frame so WebGL compiles their (heavy) programs while the loading screen is
  // still up. Without this, each new enemy type's first appearance mid-run
  // (first FIREWALL at 3:00, elites on schedule) compiled its shader on the
  // spot — a brief but jarring hitch. See prewarmEnemyMeshes().
  prewarmEnemyMeshes(scene);
  renderFrame();

  onStateChange((newState, oldState) => {
    if (newState === 'PLAYING' && oldState === 'MENU') {
      initializePlayerForRun(scene);

      // First solo run ever: show the one-time how-to-play overlay. Skipped in
      // co-op (teammates are mid-run) and after the player has seen it once.
      if (!uiState.isMultiplayer && localStorage.getItem('geo_onboarded') !== '1') {
        uiState.showOnboarding = true;
      }
    }
  });

  const { mount } = await import('svelte');
  const App = (await import('./ui/App.svelte')).default;
  mount(App, { target: document.getElementById('app')! });

  hideLoadingScreen();
  portalLoadingFinished();

  startGameLoop(scene, camera, renderer, renderFrame);
});

// --- GAME LOOP (separated for clarity) ---
import { spawnChest } from './systems/ChestSystem';
import { world } from './core/world';

function startGameLoop(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: { render: (scene: THREE.Scene, camera: THREE.Camera) => void },
  renderFrame: () => void,
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

  // Auto-pause when the tab/window loses focus (required by web game portals).
  // Multiplayer sessions are exempt: the host must keep simulating for the
  // other players, and clients would desync if they froze.
  const autoPause = () => {
    if (uiState.isMultiplayer) return;
    if (isPlaying() && !isGamePaused && !isGameOver && !uiState.showUpgrade) {
      setGameState('PAUSED');
    }
  };
  window.addEventListener('blur', autoPause);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      autoPause();
      muteForBackground(); // silence music/SFX in every state, incl. the menu
    } else {
      unmuteFromBackground();
    }
  });

  // --- GAME LOOP ---
  // dt is derived from the rAF timestamp (vsync-aligned), NOT from a
  // performance.now() sample taken inside the callback. The callback fires at a
  // jittery offset from vsync under load — sampling the wall clock there makes
  // the measured dt disagree with the interval the frame is actually shown for,
  // and since everything advances by `pos += vel * dt`, that noise turns into a
  // whole-view micro-stutter (worst on mobile / high-refresh panels, and worse
  // the more per-frame CPU work is on screen). The rAF timestamp is the frame's
  // scheduled present time, so successive deltas track the real display cadence.
  let prevFrameTime = 0; // ms, last rendered frame's rAF timestamp
  let smoothDt = 1 / 60; // low-passed dt fed to gameplay
  // Clamp dt so a backgrounded tab doesn't cause physics to tunnel on return
  const MAX_DT = 1 / 20;
  // Light delta smoothing: strips residual per-frame jitter while preserving the
  // average (so every dt-accumulating timer stays real-time). SNAP_DT is the gap
  // at which we treat the change as real (a genuine 60→30 drop / a hitch) and
  // jump instead of easing, so smoothing never lags an actual framerate change.
  const DT_SMOOTH = 0.15; // per-frame blend toward the raw delta (~100ms settle)
  const SNAP_DT = 0.008; // >8ms disagreement = real rate change, snap don't ease
  let netSyncTimer = 0;
  const NET_SYNC_INTERVAL = 1 / 30; // 30Hz throttled network sync

  // --- FRAME LIMITER (battery) ---
  // rAF fires at display refresh (120-165Hz on modern screens) — pure battery
  // burn for a 60fps-class game. Frames outside the budget are skipped before
  // any work happens; the clock keeps accumulating so simulation stays
  // real-time. Menus/pause force a 30fps ceiling regardless of the setting.
  const MENU_FPS = 30;
  let nextFrameAt = 0;

  function animate(rafTime: number) {
    requestAnimationFrame(animate);

    const userCap = getFpsLimit(); // 0 = uncapped
    const inGame = uiState.gameState === 'PLAYING';
    const cap = inGame ? userCap : userCap > 0 ? Math.min(userCap, MENU_FPS) : MENU_FPS;
    if (cap > 0) {
      const now = performance.now();
      const budget = 1000 / cap;
      if (now < nextFrameAt) return; // skip: too early for the next frame
      // Drift-free schedule; resync after long stalls (tab switch etc.)
      nextFrameAt = nextFrameAt + budget > now ? nextFrameAt + budget : now + budget;
    }

    // Vsync-aligned delta from the rAF timestamp (spans skipped frames, since
    // prevFrameTime only advances on frames that actually run). Guard the first
    // frame and any missing timestamp with a 60fps fallback.
    const frameTime = rafTime || performance.now();
    const rawDt = Math.min(prevFrameTime ? (frameTime - prevFrameTime) / 1000 : 1 / 60, MAX_DT);
    prevFrameTime = frameTime;

    // Low-pass the delta to remove scheduling jitter; snap on real rate changes.
    smoothDt =
      Math.abs(rawDt - smoothDt) > SNAP_DT ? rawDt : smoothDt + (rawDt - smoothDt) * DT_SMOOTH;
    const dt = smoothDt;

    // Update FPS counter
    updateFPS(performance.now());

    // Score the game (menus + win screens too) — picks the musical cue and
    // intensity from live state, so it runs before the shouldRunGame gate.
    MusicDirector(dt);

    // Adaptive resolution: feed the un-clamped frame time so sustained slowness
    // scales the render resolution down (and back up when there's headroom).
    // Skip while intentionally capped below its "slow" threshold (menu 30fps /
    // a user 30fps cap) or it would misread the cap as GPU overload.
    if (inGame && (userCap === 0 || userCap >= 60)) {
      updateDynamicResolution(rawDt);
    }

    const isMultiplayer = uiState.isMultiplayer;

    // Check if game should run (not in menu, not paused by upgrade modal, not game over)
    let shouldRunGame = false;
    if (isMultiplayer) {
      shouldRunGame =
        (uiState.gameState === 'PLAYING' || uiState.gameState === 'PAUSED') && !isGameOver;
    } else {
      shouldRunGame =
        isPlaying() &&
        !isGamePaused &&
        !isGameOver &&
        !uiState.showVictoryChoice &&
        !uiState.showChestCeremony &&
        !uiState.showProtocolChoice &&
        !uiState.showSecondChance;
    }

    if (!shouldRunGame) {
      // Still render the scene even when paused
      renderFrame();
      return;
    }
    const isHost = uiState.isHost;

    // 1. Logic
    let _t: () => void;
    _t = benchmark.trace('MusicDirector'); MusicDirector(dt); _t();
    _t = benchmark.trace('InputSystem'); InputSystem(); _t();
    _t = benchmark.trace('AimSystem'); AimSystem(); _t();
    _t = benchmark.trace('PlayerControlSystem'); PlayerControlSystem(dt); _t();

    if (!isMultiplayer || isHost) {
      _t = benchmark.trace('EnemySystem'); EnemySystem(dt, scene); _t();
      _t = benchmark.trace('TimelineSpawnerSystem'); TimelineSpawnerSystem(dt, scene); _t();
    }

    // 2. Combat
    _t = benchmark.trace('WeaponSystem'); WeaponSystem(dt, scene); _t();

    if (!isMultiplayer || isHost) {
      _t = benchmark.trace('CollisionSystem'); CollisionSystem(scene); _t();
    }
    if (!isMultiplayer) SoloDeathWatchdog();

    // 3. Physics/Visuals
    _t = benchmark.trace('PhysicsSystem'); PhysicsSystem(dt); _t();
    _t = benchmark.trace('LifecycleSystem'); LifecycleSystem(dt, scene); _t();

    // GPU compute systems (no-op placeholders until WebGPU compute lands;
    // the CPU equivalents below own these updates to avoid double-applying)
    ParticleComputeSystem(dt, renderer);
    EnemyComputeSystem(dt, renderer);

    _t = benchmark.trace('ParticleSystem'); ParticleSystem(dt, scene); _t();
    // Loot (XP/credit collection + leveling) is HOST-authoritative in co-op:
    // clients running it locally double-collected the synced XP mirrors and
    // triggered duplicate level-ups on top of the host's.
    if (!isMultiplayer || isHost) {
      _t = benchmark.trace('LootSystem'); LootSystem(dt, scene); _t();
    }
    // ...but the instanced XP/credit gems are DRAWN for everyone, or the
    // joining player sees no orbs at all.
    _t = benchmark.trace('LootRenderSystem'); LootRenderSystem(scene); _t();
    _t = benchmark.trace('PassiveEffectsSystem'); PassiveEffectsSystem(dt); _t();
    _t = benchmark.trace('OrbitalSystem'); OrbitalSystem(dt); _t();
    _t = benchmark.trace('OverloadSystem'); OverloadSystem(dt, scene); _t();
    _t = benchmark.trace('AnomalySystem'); AnomalySystem(dt, scene); _t();
    _t = benchmark.trace('ShrineSystem'); ShrineSystem(dt, scene); _t();
    _t = benchmark.trace('DestructibleSystem'); DestructibleSystem(dt, scene); _t();
    _t = benchmark.trace('PickupSystem'); PickupSystem(scene); _t();
    _t = benchmark.trace('MapEventSystem'); MapEventSystem(dt, scene); _t();
    _t = benchmark.trace('BreachSystem'); BreachSystem(dt, scene); _t();
    _t = benchmark.trace('updateGateFx'); updateGateFx(dt); _t();

    if (!isMultiplayer || isHost) {
      _t = benchmark.trace('ChestSystem'); ChestSystem(dt, scene); _t();
      _t = benchmark.trace('FinaleBossSystem'); FinaleBossSystem(dt, scene); _t();
      _t = benchmark.trace('CoopSystem'); CoopSystem(dt); _t();
    } else {
      // Client: ease remote players/enemies/boss toward their net targets
      NetSmoothingSystem(dt);
      // Cosmetic combat feedback (bullet impacts/flash) so the joiner's fight
      // feels like single-player; damage/kills stay host-authoritative.
      ClientCombatFxSystem(dt, scene);
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
    _t = benchmark.trace('RenderSystem'); RenderSystem(dt, scene); _t();
    _t = benchmark.trace('CameraSystem'); CameraSystem(dt, camera); _t();
    _t = benchmark.trace('DamageNumberSystem'); DamageNumberSystem(dt, camera); _t();
    _t = benchmark.trace('UISystem'); UISystem(); _t();
    if (DEBUG) DebugSystem(scene); // Debug panel (Shift+Alt+D, requires ?debug)

    benchmark.endFrame();
    renderFrame();
  }

  requestAnimationFrame(animate); // first frame gets a real vsync timestamp too
}
