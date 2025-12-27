import './style.css';
import * as THREE from 'three';
import { initRenderer } from './core/renderer';

import { spawnPlayer } from './core/factories';
import { getCtx, startMusic } from './core/audio';
import { Profiler } from './core/debug';

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
btn.innerText = '📋 COPY DEBUG LOGS';
btn.style.position = 'absolute';
btn.style.bottom = '10px';
btn.style.left = '50%';
btn.style.transform = 'translateX(-50%)';
btn.style.zIndex = '10000';
btn.style.padding = '12px 24px';
btn.style.background = '#ff0055';
btn.style.color = 'white';
btn.style.border = '2px solid white';
btn.style.fontSize = '16px';
btn.style.borderRadius = '8px';
btn.style.fontFamily = 'monospace';
btn.onclick = async () => {
  const report = Profiler.getReport();
  try {
    await navigator.clipboard.writeText(report);
    btn.innerText = '✅ COPIED!';
    setTimeout(() => (btn.innerText = '📋 COPY DEBUG LOGS'), 2000);
  } catch (e) {
    alert('Failed to copy. Check console.');
    console.log(report);
  }
};
document.body.appendChild(btn);

// --- GAME LOOP ---
const clock = new THREE.Clock();

function measure(name: string, fn: () => void) {
  const start = performance.now();
  fn();
  Profiler.record(name, performance.now() - start);
}

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();

  if (isGamePaused || isGameOver) {
    renderer.render(scene, camera);
    return;
  }

  // 1. Logic
  measure('Input', () => InputSystem());
  measure('Aim', () => AimSystem());
  measure('PlayerCtrl', () => PlayerControlSystem());
  measure('Enemy', () => EnemySystem(dt));
  measure('Spawner', () => SpawnerSystem(dt, scene));

  // 2. Combat
  measure('Weapon', () => WeaponSystem(dt, scene));
  measure('Collision', () => CollisionSystem(scene));

  // 3. Physics/Visuals
  measure('Physics', () => PhysicsSystem(dt));
  measure('Lifecycle', () => LifecycleSystem(dt, scene));
  measure('Particle', () => ParticleSystem(dt));
  measure('Loot', () => LootSystem(dt, scene));

  // 4. UI & Camera
  measure('RenderSys', () => RenderSystem(dt));
  measure('Camera', () => CameraSystem(dt, camera));
  measure('UI', () => UISystem());

  const rStart = performance.now();
  renderer.render(scene, camera);
  Profiler.record('Renderer', performance.now() - rStart);
}

animate();
