import './style.css';
import * as THREE from 'three';
import { initRenderer } from './core/renderer';

import { spawnPlayer } from './core/factories';
import { getCtx, startMusic } from './core/audio';
import { Profiler } from './core/profiler';

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

// --- DEBUG BUTTON ---
const btn = document.createElement('button');
btn.innerText = '🔍 PROFILE';
btn.style.cssText = `
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10001;
  padding: 8px 16px;
  background: rgba(255, 0, 85, 0.9);
  color: white;
  border: 1px solid white;
  font-family: monospace;
  font-weight: bold;
  font-size: 14px;
  pointer-events: auto;
`;
btn.onclick = async () => {
  Profiler.log('Manually requesting debug report');
  const report = Profiler.getDetailedReport();
  try {
    await navigator.clipboard.writeText(report);
    const originalText = btn.innerText;
    btn.innerText = '✅ COPIED!';
    setTimeout(() => (btn.innerText = originalText), 2000);
  } catch (e) {
    console.error('Copy failed', e);
    console.log(report);
    alert('Detailed report logged to console (Copy unsupported)');
  }
};
document.body.appendChild(btn);

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

  // 5. Profiling
  Profiler.captureFrame(renderer, dt);
}

animate();
