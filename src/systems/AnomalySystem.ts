import { world } from '../core/world';
import { uiState } from '../core/UIState.svelte.ts';
import { spawnDamageNumber } from './DamageNumberSystem';
import * as THREE from 'three';
import { handleEnemyDeath } from './CollisionSystem';

let spawnTimer = 15.0; // spawn first anomaly after 15 seconds, then every 45 seconds
let damageTimer = 0;

const zoneGeo = new THREE.PlaneGeometry(6, 6);

export function AnomalySystem(dt: number, scene: THREE.Scene) {
  if (uiState.gameState !== 'PLAYING') return;

  const player = world.with('isLocalPlayer', 'position', 'health').first;
  if (!player || !player.health) return;

  // 1. Tick Spawner
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = 45.0; // reset to 45 seconds

    // Pick type
    const types: ('overclock' | 'defrag' | 'leak')[] = ['overclock', 'defrag', 'leak'];
    const type = types[Math.floor(Math.random() * types.length)];

    // Colors
    let color = 0x00d5ff; // overclock cyan
    if (type === 'defrag') color = 0xbb00ff; // defrag purple
    if (type === 'leak') color = 0xff3300; // leak red

    // Mesh setup
    const mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      wireframe: true,
    });
    const mesh = new THREE.Mesh(zoneGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    
    // Position near player
    const ax = player.position.x + (Math.random() - 0.5) * 16;
    const az = player.position.z + (Math.random() - 0.5) * 16;
    mesh.position.set(ax, 0.02, az); // flat on ground

    scene.add(mesh);

    // Add to world
    world.add({
      isAnomaly: true,
      isParticle: true, // let LifecycleSystem handle cleanup automatically
      position: new THREE.Vector3(ax, 0.02, az),
      velocity: new THREE.Vector3(0, 0, 0),
      transform: mesh,
      lifeTimer: 0,
      maxLife: 20.0, // persists 20 seconds
      anomalyType: type,
      size: 6.0, // 6x6 bounds
    });
  }

  // 2. Process Overlaps & Modifiers
  const activeAnomalies = Array.from(world.with('isAnomaly', 'position', 'anomalyType', 'size'));

  let insideOverclock = false;
  let insideDefrag = false;
  let insideLeak = false;

  const px = player.position.x;
  const pz = player.position.z;

  for (const zone of activeAnomalies) {
    const halfSize = (zone.size || 6.0) / 2;
    const zx = zone.position.x;
    const zz = zone.position.z;

    if (px >= zx - halfSize && px <= zx + halfSize && pz >= zz - halfSize && pz <= zz + halfSize) {
      if (zone.anomalyType === 'overclock') insideOverclock = true;
      if (zone.anomalyType === 'defrag') insideDefrag = true;
      if (zone.anomalyType === 'leak') insideLeak = true;
    }
  }

  // Sync to Svelte UI State
  uiState.insideOverclockZone = insideOverclock;
  uiState.insideDefragZone = insideDefrag;
  uiState.insideLeakZone = insideLeak;

  // Apply Player tick modifiers
  if (insideDefrag) {
    // Heal player 3 HP per second
    player.health.current = Math.min(player.health.max, player.health.current + 3.0 * dt);
  }

  if (insideLeak) {
    // Damage player 12 HP per second
    const damageVal = 12.0 * dt;
    player.health.current = Math.max(0, player.health.current - damageVal);

    // Flashes damage indicator overlay on HUD occasionally
    damageTimer += dt;
    if (damageTimer >= 0.45) {
      damageTimer = 0;
      uiState.damageFlash++;
      spawnDamageNumber(player.position, Math.ceil(damageVal * 3), 'player');
    }
  }

  // Apply Enemy leak damage & speed modifiers
  for (const enemy of world.with('isEnemy', 'position', 'health', 'velocity')) {
    if (!enemy.health || enemy.health.current <= 0) continue;

    let enemyInsideDefrag = false;
    let enemyInsideLeak = false;

    const ex = enemy.position.x;
    const ez = enemy.position.z;

    for (const zone of activeAnomalies) {
      const halfSize = (zone.size || 6.0) / 2;
      const zx = zone.position.x;
      const zz = zone.position.z;

      if (ex >= zx - halfSize && ex <= zx + halfSize && ez >= zz - halfSize && ez <= zz + halfSize) {
        if (zone.anomalyType === 'defrag') enemyInsideDefrag = true;
        if (zone.anomalyType === 'leak') enemyInsideLeak = true;
      }
    }

    // Defrag: Enemy speed boosted by +30% inside purple zones
    if (enemyInsideDefrag) {
      // Speed multiplier ticks are applied in PhysicsSystem, or we can just apply a direct push force here:
      enemy.velocity.multiplyScalar(1.05); // push them slightly faster
    }

    // Leak: Enemy takes DoT damage inside red zones
    if (enemyInsideLeak) {
      const dot = 90.0 * dt; // 90 damage per second
      enemy.health.current -= dot;
      enemy.hitFlashTimer = 0.1;

      if (enemy.health.current <= 0) {
        handleEnemyDeath(enemy, scene);
      }
    }
  }
}
