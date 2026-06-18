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
import { playExplosion, playHurt } from '../core/audio';
import { dlog } from '../core/debug';
import {
  createDynamicBody,
  createKinematicBody,
  isRapierInitialized,
  removeBody,
} from '../core/RapierWorld';
import { spawnDamageNumber } from './DamageNumberSystem';
import { uiState } from '../core/UIState.svelte';
import { haptics } from '../core/haptics';
import { createCustomProjectileMesh } from '../core/projectileVisuals';

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
  if (!player || !player.health) return;

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

    // Ticks special attack timers
    if (bossEntity.barrageTimer === undefined) bossEntity.barrageTimer = 0;
    if (bossEntity.shockwaveTimer === undefined) bossEntity.shockwaveTimer = 0;
    if (bossEntity.chargeTimer === undefined) bossEntity.chargeTimer = 0;

    bossEntity.barrageTimer += dt;
    bossEntity.shockwaveTimer += dt;

    // 2. Glitch Barrage Cooldown Check
    if (bossEntity.barrageTimer >= 6.0) {
      bossEntity.chargeTimer = 1.2;
      bossEntity.barrageTimer = 0;
    }

    // Warning flash visual logic
    const spriteObj = bossEntity.transform?.children[0] as THREE.Sprite | undefined;
    if (bossEntity.chargeTimer > 0) {
      bossEntity.chargeTimer -= dt;
      if (spriteObj && spriteObj.material) {
        const pulseSpeed = 25.0;
        const flash = Math.sin(Date.now() * 0.001 * pulseSpeed) > 0;
        spriteObj.material.color.setHex(flash ? 0xff3333 : 0xffffff);
        const scalePulse = BOSS_SIZE * (1.0 + Math.sin(Date.now() * 0.001 * pulseSpeed) * 0.12);
        spriteObj.scale.set(scalePulse, scalePulse, 1);
      }

      if (bossEntity.chargeTimer <= 0) {
        if (spriteObj && spriteObj.material) {
          spriteObj.material.color.setHex(0xff8888);
          spriteObj.scale.set(BOSS_SIZE, BOSS_SIZE, 1);
        }
        fireGlitchRing(scene, bossEntity.position);
      }
    } else {
      if (spriteObj && spriteObj.material && spriteObj.material.color.getHex() !== 0xff8888) {
        spriteObj.material.color.setHex(0xff8888);
      }
    }

    // 3. Shockwave Cooldown Check
    if (bossEntity.shockwaveTimer >= 10.0) {
      bossEntity.shockwaveTimer = 0;
      triggerShockwave(scene, bossEntity.position);
    }

    // Sync transform + menacing slow pulse (only if not charging)
    if (bossEntity.transform && bossEntity.chargeTimer <= 0) {
      bossEntity.transform.position.copy(bossEntity.position);
      const pulse = 1 + Math.sin(gameTime * 2.2) * 0.05;
      bossEntity.transform.scale.setScalar(pulse);
    } else if (bossEntity.transform) {
      bossEntity.transform.position.copy(bossEntity.position);
    }

    // 4. Continuous enemy spawning (every 2.5 seconds)
    if (!bossEntity.spawnTimer) bossEntity.spawnTimer = 0;
    bossEntity.spawnTimer += dt;

    if (bossEntity.spawnTimer >= 2.5) {
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

    // 5. Boss escape check (10:00)
    if (gameTime >= LEVEL_DURATION) {
      dlog('[BOSS] SYSTEM CORRUPTION is retreating...');
      despawnBoss(scene);
      triggerVictory();
    }
  }

  // C. SHOCKWAVE DAMAGE LOGIC (Runs for any active shockwave)
  const shockwaves = Array.from(world.with('isBossShockwave', 'lifeTimer', 'maxLife', 'position'));
  for (const sw of shockwaves) {
    if (sw.shockwaveDamageDealt) continue;
    if (sw.lifeTimer === undefined || sw.maxLife === undefined) continue;

    const age = sw.lifeTimer / sw.maxLife;
    const currentRadius = age * (sw.shockwaveMaxRadius || 12.0);

    const dx = player.position.x - sw.position.x;
    const dz = player.position.z - sw.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (Math.abs(dist - currentRadius) < 0.6) {
      if (!player.invulnTimer || player.invulnTimer <= 0) {
        const baseDamage = 15;
        const armor = player.stats?.armor || 0;
        const actualDamage = Math.max(1, baseDamage - armor);

        player.health.current -= actualDamage;
        player.invulnTimer = 0.8;
        player.hitFlashTimer = 0.15;
        playHurt();
        haptics.hit();
        spawnDamageNumber(player.position, actualDamage, 'player');
        uiState.damageFlash++;

        sw.shockwaveDamageDealt = true;

        if (!player.knockback) player.knockback = new THREE.Vector3();
        const push = new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(10);
        player.knockback.add(push);
      }
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

  // Create Rapier rigid body for the boss
  if (isRapierInitialized() && bossEntity.id !== undefined) {
    const radius = BOSS_SIZE * 0.35; // Appropriate collision radius
    const { rigidBody, collider } = createDynamicBody(x, z, radius, bossEntity.id);
    bossEntity.rigidBody = rigidBody;
    bossEntity.collider = collider;
  }
}

// --- DESPAWN BOSS ---
function despawnBoss(scene: THREE.Scene) {
  if (bossEntity) {
    if (bossEntity.transform) scene.remove(bossEntity.transform);
    if (bossEntity.rigidBody) {
      removeBody(bossEntity.rigidBody);
      bossEntity.rigidBody = undefined;
      bossEntity.collider = undefined;
    }
    world.remove(bossEntity);
    bossEntity = null;
  }
}

const shockwaveGeo = new THREE.RingGeometry(0.1, 0.2, 32);

export function fireGlitchRing(scene: THREE.Scene, pos: THREE.Vector3) {
  const count = 12;
  const speed = 12.0;
  const bulletColor = 0xff3333; // bright red
  const bulletLifetime = 2.5;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));

    // Create custom projectile mesh for 'smart_rail_needles' (the SHARD style visual)
    const mesh = createCustomProjectileMesh(
      'smart_rail_needles',
      bulletColor,
      0.15, // width
      0.8, // length
      dir,
    );

    // Initial position slightly offset from boss center to avoid instant collision
    mesh.position.copy(pos).add(dir.clone().multiplyScalar(1.5));
    mesh.position.y = 0.5;
    scene.add(mesh);

    const velocity = dir.clone().multiplyScalar(speed);

    const proj = world.add({
      isProjectile: true,
      isEnemyProjectile: true,
      weaponId: 'smart_rail_needles',
      position: mesh.position,
      velocity: velocity,
      lifeTimer: 0,
      maxLife: bulletLifetime,
      transform: mesh,
      damage: 12, // boss projectile damage
      projectile: {
        pierce: 1,
        explodeRadius: 0,
        knockback: 6,
        hitList: [],
      },
    });

    const isHostOrSingle = !uiState.isMultiplayer || uiState.isHost;
    if (isHostOrSingle && isRapierInitialized() && proj.id !== undefined) {
      const { rigidBody, collider } = createKinematicBody(
        mesh.position.x,
        mesh.position.z,
        0.2, // collider radius
        proj.id,
      );
      proj.rigidBody = rigidBody;
      proj.collider = collider;
    }
  }
}

export function triggerShockwave(scene: THREE.Scene, pos: THREE.Vector3) {
  // Holographic purple basic wireframe material
  const mat = new THREE.MeshBasicMaterial({
    color: 0x8800ff,
    wireframe: true,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(shockwaveGeo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(pos);
  mesh.position.y = 0.1; // lie flat slightly above ground
  scene.add(mesh);

  // Play a sound or trauma
  addTrauma(0.5);
  playExplosion();

  world.add({
    isBossShockwave: true,
    isParticle: true,
    position: pos.clone(),
    velocity: new THREE.Vector3(0, 0, 0),
    transform: mesh,
    lifeTimer: 0,
    maxLife: 2.5,
    shockwaveMaxRadius: 12.0,
    ringGrow: 12.0 / 0.2 - 1, // grow from scale 1 (0.2 radius) to scale 60 (12.0 radius)
  });
}
