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
import { world, type Entity } from '../core/world';
import { spawnEnemy, EnemyType, spawnCredit } from '../core/factories';
import { getGameTime, LEVEL_DURATION, BOSS_SPAWN_TIME } from './ChestSystem';
import { triggerVictory } from './GameManager';
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
import { broadcastGameEvent, sendDirectEvent } from '../core/network';

// --- BOSS STATE ---
let bossSpawned = false;
let bossEntity: any = null;

const BOSS_SIZE = 9;

// Boss is now killable. This is the boss HP pool — tune freely. The run is also
// still winnable by simply surviving until the boss escapes at LEVEL_DURATION.
const BOSS_MAX_HEALTH = 20000;

// --- RESET ---
/**
 * Reset the boss spawn state for a fresh run.
 */
export function resetBoss() {
  bossSpawned = false;
  bossEntity = null;
}

// --- MAIN SYSTEM ---
/**
 * Main boss tick: spawn the boss at 8:00, drive its chase/attack/spawn logic,
 * resolve shockwave damage, and trigger victory if the boss escapes or is killed.
 *
 * @param {number} dt - delta time since last frame in seconds
 * @param {THREE.Scene} scene - the Three.js scene for spawning and VFX
 */
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
    // 0. Death check — a depleted boss is destroyed and the run is won.
    if (bossEntity.health && bossEntity.health.current <= 0) {
      dlog('[BOSS] SYSTEM CORRUPTION destroyed!');
      addTrauma(1.0);
      playExplosion();

      // Spawn 200 credits in total (5 shards of 40)
      const px = bossEntity.position.x;
      const pz = bossEntity.position.z;
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const xOffset = Math.cos(angle) * 1.5;
        const zOffset = Math.sin(angle) * 1.5;
        spawnCredit(scene, px + xOffset, pz + zOffset, 40);
      }

      despawnBoss(scene);
      broadcastGameEvent('victory'); // notify multiplayer clients (no-op in single-player)
      triggerVictory();
      return;
    }

    // 1. Slow chase toward the NEAREST LIVING player (co-op: don't lock onto a
    // downed ghost or only ever the first player entity).
    const chaseTarget = nearestLivingPlayer(bossEntity.position) ?? player;
    const dx = chaseTarget.position.x - bossEntity.position.x;
    const dz = chaseTarget.position.z - bossEntity.position.z;
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

    // Warning flash visual logic for 3D geometries
    const container = bossEntity.transform?.getObjectByName('mesh_container');
    if (bossEntity.chargeTimer > 0) {
      bossEntity.chargeTimer -= dt;
      const pulseSpeed = 25.0;
      const flash = Math.sin(Date.now() * 0.001 * pulseSpeed) > 0;
      const scalePulse = 1.0 + Math.sin(Date.now() * 0.001 * pulseSpeed) * 0.15;

      if (container) {
        container.scale.setScalar(scalePulse);
        container.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh && child.material) {
            const mat = child.material;
            if (!Array.isArray(mat)) {
              const standardMat = mat as THREE.MeshStandardMaterial;
              if (standardMat.color) standardMat.color.setHex(flash ? 0xff3333 : 0xffffff);
              if ('emissive' in standardMat && standardMat.emissive instanceof THREE.Color) {
                standardMat.emissive.setHex(flash ? 0xff3333 : 0x000000);
              }
            }
          }
        });
      }

      if (bossEntity.chargeTimer <= 0) {
        if (container) {
          container.scale.setScalar(1.0);
          resetBossMaterials(container);
        }
        fireGlitchRing(scene, bossEntity.position);
      }
    } else {
      if (container) {
        const ring1 = container.getObjectByName('ring1') as THREE.Mesh | undefined;
        if (
          ring1 &&
          ring1.material &&
          !Array.isArray(ring1.material) &&
          (ring1.material as THREE.MeshBasicMaterial).color.getHex() !== 0xff0033
        ) {
          resetBossMaterials(container);
        }
      }
    }

    // 3. Shockwave Cooldown Check
    if (bossEntity.shockwaveTimer >= 10.0) {
      bossEntity.shockwaveTimer = 0;
      triggerShockwave(scene, bossEntity.position);
    }

    // Sync transform position, run multiaxial rotations + menacing slow pulse
    if (bossEntity.transform) {
      bossEntity.transform.position.copy(bossEntity.position);

      const meshContainer = bossEntity.transform.getObjectByName('mesh_container');
      const ring1 = bossEntity.transform.getObjectByName('ring1');
      const ring2 = bossEntity.transform.getObjectByName('ring2');
      const ring3 = bossEntity.transform.getObjectByName('ring3');

      // Spin the wireframe boxes on different axes
      if (ring1) {
        ring1.rotation.x += dt * 0.8;
        ring1.rotation.y += dt * 0.5;
      }
      if (ring2) {
        ring2.rotation.y -= dt * 0.6;
        ring2.rotation.z += dt * 0.4;
      }
      if (ring3) {
        ring3.rotation.z -= dt * 0.3;
        ring3.rotation.x -= dt * 0.7;
      }

      // Menacing slow pulse (only when not charging/warning-flashing)
      if (meshContainer && bossEntity.chargeTimer <= 0) {
        const pulse = 1.0 + Math.sin(gameTime * 2.2) * 0.05;
        meshContainer.scale.setScalar(pulse);
      }
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
      broadcastGameEvent('victory'); // notify multiplayer clients (no-op in single-player)
      triggerVictory();
    }
  }

  // C. SHOCKWAVE DAMAGE LOGIC (Runs for any active shockwave)
  // Co-op: the ring damages EVERY living player it passes through, not just the
  // first. Each player is evaluated independently and knocked back on their own.
  const allPlayers = Array.from(world.with('isPlayer', 'position', 'health'));
  const shockwaves = Array.from(world.with('isBossShockwave', 'lifeTimer', 'maxLife', 'position'));
  for (const sw of shockwaves) {
    if (sw.lifeTimer === undefined || sw.maxLife === undefined) continue;

    const age = sw.lifeTimer / sw.maxLife;
    const currentRadius = age * (sw.shockwaveMaxRadius || 12.0);

    // Track who this ring has already struck so it hits each player exactly
    // once as it sweeps outward past them (not just the innermost one).
    if (!sw.hitList) sw.hitList = [];

    for (const p of allPlayers) {
      if (!p.health || p.health.current <= 0) continue; // ghosts pass through
      if (p.id !== undefined && sw.hitList.includes(p.id)) continue;

      const dx = p.position.x - sw.position.x;
      const dz = p.position.z - sw.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (Math.abs(dist - currentRadius) >= 0.6) continue;

      const isInvuln =
        (p.invulnTimer && p.invulnTimer > 0) ||
        (p.isLocalPlayer &&
          (uiState.showUpgrade ||
            uiState.showChestCeremony ||
            uiState.showProtocolChoice ||
            uiState.gameState === 'PAUSED' ||
            (uiState.overloadActive && uiState.selectedCharacter === 'lash')));
      if (isInvuln) continue;

      const baseDamage = 15;
      const armor = p.stats?.armor || 0;
      const actualDamage = Math.max(1, baseDamage - armor);

      p.health.current -= actualDamage;
      p.invulnTimer = 0.8;
      p.hitFlashTimer = 0.15;
      if (p.id !== undefined) sw.hitList.push(p.id);

      // Local player feels it now; a remote player's client is notified so the
      // shockwave hits feel identical there (host doesn't flash for teammates).
      if (p.isLocalPlayer) {
        playHurt();
        haptics.hit();
        uiState.damageFlash++;
        spawnDamageNumber(p.position, actualDamage, 'player');
        if (!p.knockback) p.knockback = new THREE.Vector3();
        p.knockback.add(new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(10));
      } else if (uiState.isHost && p.connectionId) {
        sendDirectEvent(p.connectionId, 'player-hit', {
          d: Math.round(actualDamage),
          t: 0.5,
          kx: Math.round(dx * 100) / 100,
          kz: Math.round(dz * 100) / 100,
          ks: 10,
        });
      }
    }
  }
}

/** Nearest player with HP > 0 to a point, or null if the whole party is down. */
function nearestLivingPlayer(pos: THREE.Vector3): any {
  let best: any = null;
  let bestSq = Infinity;
  for (const p of world.with('isPlayer', 'position', 'health')) {
    if (!p.health || p.health.current <= 0) continue;
    const dx = p.position.x - pos.x;
    const dz = p.position.z - pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestSq) {
      bestSq = d;
      best = p;
    }
  }
  return best;
}

// --- BUILD BOSS VISUAL (shared by host spawn + client mirror) ---
/**
 * Construct the boss's visual hierarchy (core, plates, rings, spikes, shadow).
 *
 * @returns {THREE.Group} the assembled boss model group
 */
export function buildBossGroup(): THREE.Group {
  const group = new THREE.Group();

  const container = new THREE.Group();
  container.name = 'mesh_container';
  container.position.y = BOSS_SIZE * 0.45;
  group.add(container);

  // Central Core: inner glowing red energy sphere
  const innerCoreMat = new THREE.MeshStandardMaterial({
    color: 0xff0000,
    emissive: 0xff0000,
    emissiveIntensity: 2.0,
    roughness: 0.1,
    metalness: 0.9,
  });
  const innerCore = new THREE.Mesh(new THREE.SphereGeometry(BOSS_SIZE * 0.2, 16, 16), innerCoreMat);
  innerCore.name = 'innerCore';
  container.add(innerCore);

  // Volcanic dark metal protective plates (8 panels in a sphere shape with gaps)
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.8,
    metalness: 0.3,
  });
  const plateGeo = new THREE.BoxGeometry(BOSS_SIZE * 0.11, BOSS_SIZE * 0.11, BOSS_SIZE * 0.035);

  const platesGroup = new THREE.Group();
  platesGroup.name = 'platesGroup';

  const rotations = [
    [0, 0, 0],
    [Math.PI / 2, 0, 0],
    [-Math.PI / 2, 0, 0],
    [0, Math.PI / 2, 0],
    [0, -Math.PI / 2, 0],
    [0, Math.PI, 0],
    [Math.PI / 4, Math.PI / 4, 0],
    [-Math.PI / 4, -Math.PI / 4, 0],
  ];
  rotations.forEach((rot, idx) => {
    const pivot = new THREE.Group();
    pivot.name = `pivot_${idx}`;
    pivot.rotation.set(rot[0], rot[1], rot[2]);

    const plateMesh = new THREE.Mesh(plateGeo, plateMat.clone());
    plateMesh.name = `plateMesh_${idx}`;
    plateMesh.position.set(0, 0, BOSS_SIZE * 0.22); // base distance
    pivot.add(plateMesh);

    platesGroup.add(pivot);
  });
  container.add(platesGroup);

  // Concentric Cages of different shapes
  // 1. Inner glowing red wireframe Box
  const wireMat1 = new THREE.MeshBasicMaterial({
    color: 0xff0033,
    wireframe: true,
    transparent: true,
    opacity: 0.8,
  });
  const ring1 = new THREE.Mesh(
    new THREE.BoxGeometry(BOSS_SIZE * 0.5, BOSS_SIZE * 0.5, BOSS_SIZE * 0.5),
    wireMat1,
  );
  ring1.name = 'ring1';
  container.add(ring1);

  // 2. Middle glowing orange wireframe Octahedron
  const wireMat2 = new THREE.MeshBasicMaterial({
    color: 0xff6600,
    wireframe: true,
    transparent: true,
    opacity: 0.6,
  });
  const ring2 = new THREE.Mesh(new THREE.OctahedronGeometry(BOSS_SIZE * 0.44), wireMat2);
  ring2.name = 'ring2';
  container.add(ring2);

  // 3. Outer glowing magenta/pink wireframe Icosahedron
  const wireMat3 = new THREE.MeshBasicMaterial({
    color: 0xff00aa,
    wireframe: true,
    transparent: true,
    opacity: 0.45,
  });
  const ring3 = new THREE.Mesh(new THREE.IcosahedronGeometry(BOSS_SIZE * 0.54, 1), wireMat3);
  ring3.name = 'ring3';
  container.add(ring3);

  // Menacing orbiting spikes
  const spikeGroup = new THREE.Group();
  spikeGroup.name = 'spikeGroup';
  const spikeGeo = new THREE.OctahedronGeometry(BOSS_SIZE * 0.06);
  spikeGeo.scale(1.0, 3.5, 1.0); // stretch to look like shard-spikes
  const spikeMat = new THREE.MeshStandardMaterial({
    color: 0x1a0505,
    roughness: 0.6,
    metalness: 0.8,
    emissive: 0x440000,
  });
  for (let i = 0; i < 6; i++) {
    const spike = new THREE.Mesh(spikeGeo, spikeMat);
    spike.name = `spike_${i}`;
    spikeGroup.add(spike);
  }
  container.add(spikeGroup);

  // Shadow
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(BOSS_SIZE * 0.35, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  shadow.name = 'shadow';
  group.add(shadow);

  return group;
}

// --- SPAWN BOSS (host / single-player authority) ---
function spawnBoss(scene: THREE.Scene, nearX: number, nearZ: number) {
  // Spawn at edge of screen
  const angle = Math.random() * Math.PI * 2;
  const x = nearX + Math.cos(angle) * 20;
  const z = nearZ + Math.sin(angle) * 20;

  const group = buildBossGroup();
  group.position.set(x, 0, z);
  scene.add(group);

  // ENTRANCE: heavy rumble + boom so the spawn is felt, not just seen
  addTrauma(0.8);
  playExplosion();

  bossEntity = world.add({
    isBoss: true,
    isEnemy: true,
    position: group.position,
    velocity: new THREE.Vector3(0, 0, 0),
    health: { current: BOSS_MAX_HEALTH, max: BOSS_MAX_HEALTH },
    transform: group,
    spawnTimer: 0,
    chargeTimer: 0, // Ensure chargeTimer is initialized
  });

  // Create Rapier rigid body for the boss
  if (isRapierInitialized() && bossEntity.id !== undefined) {
    const radius = BOSS_SIZE * 0.35; // Appropriate collision radius
    const { rigidBody, collider } = createDynamicBody(x, z, radius, bossEntity.id);
    bossEntity.rigidBody = rigidBody;
    bossEntity.collider = collider;
  }
}

// --- CLIENT BOSS MIRROR ---
// Visual-only boss representation on a multiplayer client. The host owns the boss
// simulation; the client just renders its model and tracks its synced health so the
// boss bar and on-screen body stay in sync. No physics body (host is authoritative).
/**
 * Spawn a visual-only boss entity on a multiplayer client for rendering.
 *
 * @param {THREE.Scene} scene - the Three.js scene to add the boss model to
 * @param {number} x - spawn X position
 * @param {number} z - spawn Z position
 * @param {number} hpCurrent - current boss HP from host sync
 * @param {number} hpMax - max boss HP from host sync
 * @returns the spawned boss entity
 */
export function spawnClientBoss(
  scene: THREE.Scene,
  x: number,
  z: number,
  hpCurrent: number,
  hpMax: number,
) {
  const group = buildBossGroup();
  group.position.set(x, 0, z);
  scene.add(group);

  return world.add({
    isBoss: true,
    isEnemy: true,
    position: group.position,
    velocity: new THREE.Vector3(0, 0, 0),
    health: { current: hpCurrent, max: hpMax },
    transform: group,
    chargeTimer: 0,
  });
}

/**
 * Remove a client-side boss entity from the scene and the world.
 *
 * @param {THREE.Scene} scene - the Three.js scene to remove the boss model from
 * @param {Entity} entity - the boss entity to remove
 */
export function removeClientBoss(scene: THREE.Scene, entity: Entity) {
  if (entity.transform) scene.remove(entity.transform);
  world.remove(entity);
}

function resetBossMaterials(container: THREE.Object3D) {
  const innerCore = container.getObjectByName('innerCore') as THREE.Mesh | undefined;
  const platesGroup = container.getObjectByName('platesGroup');
  const ring1 = container.getObjectByName('ring1') as THREE.Mesh | undefined;
  const ring2 = container.getObjectByName('ring2') as THREE.Mesh | undefined;
  const ring3 = container.getObjectByName('ring3') as THREE.Mesh | undefined;

  if (innerCore && innerCore.material && !Array.isArray(innerCore.material)) {
    const mat = innerCore.material as THREE.MeshStandardMaterial;
    if (mat.color) mat.color.setHex(0xff0000);
    if (mat.emissive) mat.emissive.setHex(0xff0000);
  }
  if (platesGroup) {
    platesGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material && !Array.isArray(child.material)) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat.color) mat.color.setHex(0x111111);
        if (mat.emissive) mat.emissive.setHex(0x000000);
      }
    });
  }
  if (ring1 && ring1.material && !Array.isArray(ring1.material)) {
    const mat = ring1.material as THREE.MeshBasicMaterial;
    if (mat.color) mat.color.setHex(0xff0033);
  }
  if (ring2 && ring2.material && !Array.isArray(ring2.material)) {
    const mat = ring2.material as THREE.MeshBasicMaterial;
    if (mat.color) mat.color.setHex(0xff6600);
  }
  if (ring3 && ring3.material && !Array.isArray(ring3.material)) {
    const mat = ring3.material as THREE.MeshBasicMaterial;
    if (mat.color) mat.color.setHex(0xff00aa);
  }
}

// --- DESPAWN BOSS ---
/** Full reset for a no-reload restart: forget the boss and re-arm the spawn. */
export function resetFinaleBoss(scene: THREE.Scene): void {
  despawnBoss(scene);
  bossSpawned = false;
}

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

/**
 * Fire a ring of glitch projectiles outward from a point (boss barrage attack).
 *
 * @param {THREE.Scene} scene - the Three.js scene to spawn projectiles into
 * @param {THREE.Vector3} pos - center position of the ring
 */
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

/**
 * Spawn an expanding shockwave ring that damages and knocks back players it passes through.
 *
 * @param {THREE.Scene} scene - the Three.js scene to add the shockwave visual to
 * @param {THREE.Vector3} pos - center position of the shockwave
 */
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
