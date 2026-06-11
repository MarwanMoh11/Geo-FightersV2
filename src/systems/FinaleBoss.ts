/**
 * FinaleBoss System - The Unkillable Climax
 *
 * The boss is NOT a DPS check. It's a pressure orchestrator.
 * Goal: Survive until the boss escapes at LEVEL_DURATION.
 *
 * Design:
 * - Spawns at 8:00 (BOSS_SPAWN_TIME)
 * - Escapes at 10:00 (LEVEL_DURATION)
 * - Functionally infinite HP
 * - Continuously spawns enemies
 * - Victory = survival
 */

import * as THREE from 'three';
import { world } from '../core/world';
import { spawnEnemy, EnemyType } from '../core/factories';
import { getGameTime, LEVEL_DURATION, BOSS_SPAWN_TIME } from './ChestSystem';
import { triggerVictory } from './GameManager';
import { loadTexture } from '../core/assets';
import { addTrauma } from './CameraSystem';
import { playExplosion } from '../core/audio';
import { dlog } from '../core/debug';

// --- BOSS STATE ---
let bossSpawned = false;
let bossEntity: any = null;

const BOSS_SIZE = 9;

// --- RESET ---
export function resetBoss() {
  bossSpawned = false;
  bossEntity = null;
}

// --- MAIN SYSTEM ---
export function FinaleBossSystem(dt: number, scene: THREE.Scene) {
  const gameTime = getGameTime();

  // EARLY RETURN: Skip entirely if boss hasn't spawned and we're not close to spawn time
  if (!bossSpawned && gameTime < BOSS_SPAWN_TIME - 10) {
    return; // Nothing to do yet
  }

  const player = world.with('isPlayer', 'position').first;
  if (!player) return;

  // A. BOSS SPAWN CHECK (8:00)
  if (!bossSpawned && gameTime >= BOSS_SPAWN_TIME) {
    spawnBoss(scene, player.position.x, player.position.z);
    bossSpawned = true;
    dlog('[BOSS] SYSTEM CORRUPTION has emerged!');
  }

  // B. BOSS BEHAVIOR
  if (bossEntity) {
    // 1. Slow chase toward player
    const dx = player.position.x - bossEntity.position.x;
    const dz = player.position.z - bossEntity.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 2) {
      const speed = 0.8;
      bossEntity.velocity.x = (dx / dist) * speed;
      bossEntity.velocity.z = (dz / dist) * speed;
    } else {
      bossEntity.velocity.x *= 0.9;
      bossEntity.velocity.z *= 0.9;
    }

    // Apply velocity
    bossEntity.position.x += bossEntity.velocity.x * dt;
    bossEntity.position.z += bossEntity.velocity.z * dt;

    // Sync transform + menacing slow pulse
    if (bossEntity.transform) {
      bossEntity.transform.position.copy(bossEntity.position);
      const pulse = 1 + Math.sin(gameTime * 2.2) * 0.05;
      bossEntity.transform.scale.setScalar(pulse);
    }

    // 2. Continuous enemy spawning (every 2 seconds)
    if (!bossEntity.spawnTimer) bossEntity.spawnTimer = 0;
    bossEntity.spawnTimer += dt;

    if (bossEntity.spawnTimer >= 2.0) {
      bossEntity.spawnTimer = 0;

      // Spawn a wave of enemies around the boss
      const enemies = [EnemyType.VIRUS, EnemyType.VIRUS, EnemyType.GLITCH];
      for (let i = 0; i < 3; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 5 + Math.random() * 3;
        const x = bossEntity.position.x + Math.cos(angle) * radius;
        const z = bossEntity.position.z + Math.sin(angle) * radius;
        const type = enemies[Math.floor(Math.random() * enemies.length)];
        spawnEnemy(scene, x, z, type);
      }
    }

    // 3. Boss escape check (10:00)
    if (gameTime >= LEVEL_DURATION) {
      dlog('[BOSS] SYSTEM CORRUPTION is retreating...');
      despawnBoss(scene);
      triggerVictory();
    }
  }
}

// --- SPAWN BOSS ---
function spawnBoss(scene: THREE.Scene, nearX: number, nearZ: number) {
  // Spawn at edge of screen
  const angle = Math.random() * Math.PI * 2;
  const x = nearX + Math.cos(angle) * 20;
  const z = nearZ + Math.sin(angle) * 20;

  // Billboard the Overseer sprite (matches the rest of the enemy art style)
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const texture = loadTexture('/sprites/enemies/enemy_overseer.png');
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: 0xff8888 }));
  sprite.scale.set(BOSS_SIZE, BOSS_SIZE, 1);
  sprite.position.y = BOSS_SIZE / 2;
  group.add(sprite);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(BOSS_SIZE * 0.3, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.05;
  group.add(shadow);

  scene.add(group);

  // ENTRANCE: heavy rumble + boom so the spawn is felt, not just seen
  addTrauma(0.8);
  playExplosion();

  bossEntity = world.add({
    isBoss: true,
    isEnemy: true,
    position: group.position,
    velocity: new THREE.Vector3(0, 0, 0),
    health: { current: 50000, max: 50000 }, // Functionally infinite
    transform: group,
    spawnTimer: 0,
  });
}

// --- DESPAWN BOSS ---
function despawnBoss(scene: THREE.Scene) {
  if (bossEntity && bossEntity.transform) {
    scene.remove(bossEntity.transform);
    world.remove(bossEntity);
    bossEntity = null;
  }
}
