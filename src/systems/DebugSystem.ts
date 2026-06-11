import { world } from '../core/world';
import { setCurrentLevel, getCurrentLevel, LEVEL_DEBUG } from '../core/LevelData';
import { initLevel, disposeLevel } from './LevelSystem';
import { WEAPONS, type WeaponDef } from '../core/WeaponRegistry';
import * as THREE from 'three';

// --- CONFIG ---
const DEBUG_COMBO = ['ShiftLeft', 'AltLeft', 'KeyD'];
const pressedKeys = new Set<string>();

// --- STATE ---
let isDebugActive = false;
let debugPanel: HTMLElement | null = null;

// --- LISTENERS ---
window.addEventListener('keydown', (e) => {
  pressedKeys.add(e.code);
  checkCombo();
});

window.addEventListener('keyup', (e) => {
  pressedKeys.delete(e.code);
});

function checkCombo() {
  if (DEBUG_COMBO.every((key) => pressedKeys.has(key))) {
    toggleDebugMode();
    // Clear keys to prevent rapid toggling
    pressedKeys.clear();
  }
}

// --- MAIN TOGGLE ---
function toggleDebugMode() {
  isDebugActive = !isDebugActive;
  console.log(`[DEBUG] Mode ${isDebugActive ? 'ACTIVATED' : 'DEACTIVATED'}`);

  if (isDebugActive) {
    activateDebugLevel();
    showDebugUI();
  } else {
    // Optional: Could reload or switch back, but for now just hide UI
    // To truly exit, user might need to reload page or we implement a "Return to Title"
    hideDebugUI();
  }
}

// --- ACTIONS ---
function activateDebugLevel() {
  // 1. Get Scene (hacky access via world or we need to pass it? We can find it via components if needed, or better, main.ts should handle level switching.
  // BUT: standard way in this engine seems to be calling systems.
  // We need access to the Three.js SCENE.
  // We'll search for an entity that holds the scene or similar, OR we assume global access (not ideal).
  // Actually, Main.ts passes scene to systems. We might need to store it statically in a singleton or pass it to DebugSystem.
  // For now, let's assume we can find the scene via a hack or we'll export it from Renderer.
  // Let's use a "SceneManager" or similar if available.
  // Wait, I saw initLevel(scene).
  // WORKAROUND: We will capture the scene in the main loop if we export DebugSystem as a functional system (factory pattern).
  // See below export.
}

// --- UI MANAGEMENT ---
function showDebugUI() {
  if (!debugPanel) createDebugUI();
  debugPanel!.classList.remove('hidden');
}

function hideDebugUI() {
  if (debugPanel) debugPanel!.classList.add('hidden');
}

function createDebugUI() {
  debugPanel = document.getElementById('debug-panel');
  if (!debugPanel) return;

  // Clear existing (if re-created)
  debugPanel.innerHTML = '';

  const title = document.createElement('h2');
  title.innerText = 'DEBUG CONSOLE';
  debugPanel.appendChild(title);

  // 1. HEAL BUTTON
  const btnHeal = createButton('FULL HEAL', () => {
    const player = world.with('isPlayer', 'health').first;
    if (player && player.health) {
      player.health.current = player.health.max;
      console.log('[DEBUG] Player healed');
    }
  });
  debugPanel.appendChild(btnHeal);

  // 2. GOD MODE TOGGLE
  const btnGod = createButton('TOGGLE GOD MODE', () => {
    const player = world.with('isPlayer').first as any;
    if (player) {
      player.isInvulnerable = !player.isInvulnerable;
      btnGod.style.backgroundColor = player.isInvulnerable ? '#00ff00' : '';
      console.log(`[DEBUG] God Mode: ${player.isInvulnerable}`);
    }
  });
  debugPanel.appendChild(btnGod);

  // 3. SPAWN ENEMY DROPDOWN
  const enemySelect = document.createElement('select');
  // Populate with known types (will gather from HordeSystem)
  const enemyTypes = [
    'cyber_wolf',
    'drone_eye',
    'tentacle_beast',
    'glitch_specter',
    'spider_mech',
    'raptor_strike',
    'plasma_dragon',
    'titan_overlord',
  ];
  enemyTypes.forEach((type) => {
    const opt = document.createElement('option');
    opt.value = type;
    opt.innerText = type;
    enemySelect.appendChild(opt);
  });
  debugPanel.appendChild(enemySelect);

  const btnSpawn = createButton('SPAWN ENEMY', () => {
    const type = enemySelect.value;
    spawnDebugEnemy(type);
  });
  debugPanel.appendChild(btnSpawn);

  // 4. ADD WEAPON DROPDOWN
  const weaponSelect = document.createElement('select');
  Object.values(WEAPONS).forEach((w: WeaponDef) => {
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.innerText = w.name;
    weaponSelect.appendChild(opt);
  });
  debugPanel.appendChild(weaponSelect);

  const btnWeapon = createButton('ADD WEAPON', () => {
    addDebugWeapon(weaponSelect.value);
  });
  debugPanel.appendChild(btnWeapon);
}

function createButton(text: string, onClick: () => void) {
  const btn = document.createElement('button');
  btn.innerText = text;
  btn.onclick = onClick;
  btn.className = 'debug-btn';
  return btn;
}

// --- HELPER LOGIC ---
let _scene: THREE.Scene | null = null;

function spawnDebugEnemy(type: string) {
  if (!_scene) {
    console.warn('[DEBUG] Scene not captured yet');
    return;
  }

  // Spawn 10 units away in random direction
  const player = world.with('isPlayer', 'position').first;
  const px = player ? player.position.x : 0;
  const pz = player ? player.position.z : 0;

  const angle = Math.random() * Math.PI * 2;
  const dist = 15;
  const x = px + Math.cos(angle) * dist;
  const z = pz + Math.sin(angle) * dist;

  import('../core/factories').then(({ spawnEnemy }) => {
    spawnEnemy(_scene!, x, z, type as any);
    console.log(`[DEBUG] Spawned ${type} at ${x.toFixed(1)}, ${z.toFixed(1)}`);
  });
}

function addDebugWeapon(weaponId: string) {
  const player = world.with('isPlayer', 'weaponSlots').first;
  if (!player) return;

  // Check if already owned
  const slots = player.weaponSlots || [];
  if (slots.some((s: any) => s.weaponId === weaponId)) {
    console.log('[DEBUG] Weapon already owned:', weaponId);
    return;
  }

  // Add to slots
  slots.push({ weaponId, level: 1 });
  player.weaponSlots = slots;

  // Spawn weapon entity
  const def = WEAPONS[weaponId];
  if (!def) return;

  import('../core/WeaponRegistry').then(({ getWeaponStatsAtLevel }) => {
    const stats = getWeaponStatsAtLevel(weaponId, 1)!;
    world.add({
      isWeapon: true,
      weaponId: weaponId,
      ownerId: player.id,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      weapon: {
        cooldownTimer: 0.5,
        fireRate: stats.cooldown,
        damage: stats.damage,
        bulletSpeed: def.baseSpeed,
        bulletColor: def.color,
        bulletLifetime: def.baseLifetime,
        category: def.category,
        bulletWidth: def.bulletWidth,
        bulletLength: def.bulletLength,
        visualStyle: def.visualStyle,
        bulletCount: stats.projectiles,
        bulletSpread: def.baseSpread,
        knockback: def.baseKnockback,
        bulletPierce: stats.pierce,
        bulletExplodeRadius: def.explodeRadius,
      },
    });
    console.log(`[DEBUG] Added weapon: ${def.name}`);
  });
}

// --- SYSTEM EXPORT ---

// We need to capture the scene from main loop
export function DebugSystem(scene: THREE.Scene) {
  _scene = scene;

  // One-time setup if needed?
  // We can check if level needs switching here if a flag is set.
  if (isDebugActive && getCurrentLevel() !== LEVEL_DEBUG) {
    // Switch level!
    disposeLevel(scene);
    setCurrentLevel(LEVEL_DEBUG);
    initLevel(scene);

    // Reset player position
    const player = world.with('isPlayer', 'position').first;
    if (player) {
      player.position.set(0, 0, 0);
    }

    // Kill all enemies
    for (const ent of world.with('isEnemy')) {
      world.remove(ent);
      if (ent.transform) scene.remove(ent.transform);
    }
  }
}
