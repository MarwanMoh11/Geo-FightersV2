/**
 * OverloadSystem — per-character space-bar ultimates.
 *
 * Every character has a distinct overload, triggered at 100% charge:
 *  - CYPHER  System Reboot: massive shockwave — 500 dmg + 3s stun in 18u.
 *  - LASH    Static Field: leaves damaging spatial tears while sprinting (1.5× speed).
 *  - RAIL    Siege Mode: immobile bubble, weapons tick 4× faster.
 *  - NOVA    Singularity: gravity well that drags enemies in and grinds them.
 *  - BYTE    Salvage Vortex: vacuums every XP shard and credit on the field.
 *  - GHOST   Phase Shift: 4s untouchable phase-walk at 1.5× speed.
 *  - TITAN   Seismic Slam: instant 300 dmg quake + huge knockback + armor plate.
 *  - FLUX    Chaos Surge: roulette — nuke, weapon frenzy, full heal, or gold rush.
 *
 * Damage application is gated to solo/host (the host owns enemy HP in co-op);
 * visuals fire everywhere so the ult always LOOKS right on your screen.
 */

import { world } from '../core/world';
import { uiState, announce } from '../core/UIState.svelte.ts';
import * as THREE from 'three';
import { addTrauma } from './CameraSystem';
import { playExplosion, playCollect } from '../core/audio';
import { spawnDamageNumber } from './DamageNumberSystem';
import { handleEnemyDeath } from './CollisionSystem';
import { spawnCredit } from '../core/factories';

let wasOverloadActive = false;
let railBubbleMesh: THREE.Mesh | null = null;
let novaWellMesh: THREE.Mesh | null = null;
let lashSpawnTimer = 0;
let novaTickTimer = 0;
let titanArmorApplied = false;

// Geometries & Materials cached
const shockwaveGeo = new THREE.RingGeometry(0.1, 0.2, 32);
const bubbleGeo = new THREE.SphereGeometry(1.8, 16, 16);
const bubbleMat = new THREE.MeshBasicMaterial({
  color: 0x00ff88,
  wireframe: true,
  transparent: true,
  opacity: 0.25,
});

const tearGeo = new THREE.ConeGeometry(0.4, 0.8, 4);
const tearMat = new THREE.MeshBasicMaterial({
  color: 0xff00ff,
  wireframe: true,
});

const wellGeo = new THREE.TorusGeometry(2.2, 0.12, 8, 40);
const wellMat = new THREE.MeshBasicMaterial({
  color: 0xaa66ff,
  transparent: true,
  opacity: 0.55,
});

/** True when this machine is allowed to change enemy HP (solo or co-op host). */
function canDealDamage(): boolean {
  return !uiState.isMultiplayer || uiState.isHost;
}

/** Expanding ring visual, reused by several ults. */
function spawnRing(scene: THREE.Scene, pos: THREE.Vector3, color: number, radius: number) {
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(shockwaveGeo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(pos);
  mesh.position.y = 0.1;
  scene.add(mesh);
  world.add({
    isParticle: true,
    position: pos.clone(),
    velocity: new THREE.Vector3(),
    transform: mesh,
    lifeTimer: 0,
    maxLife: 1.0,
    ringGrow: radius / 0.2 - 1,
  });
}

/** Radial burst: damage + stun + optional knockback around a point. */
function radialBlast(
  scene: THREE.Scene,
  pos: THREE.Vector3,
  radius: number,
  damage: number,
  stun: number,
  knock: number,
) {
  if (!canDealDamage()) return;
  // NOTE: don't require 'stunTimer' in the query — fresh enemies that were
  // never hit don't have it yet and would be silently immune to the blast
  // (this bug shipped in the original Cypher ult).
  const enemies = Array.from(world.with('isEnemy', 'position', 'health'));
  for (const enemy of enemies) {
    if (!enemy.health || enemy.health.current <= 0) continue;
    const dx = enemy.position.x - pos.x;
    const dz = enemy.position.z - pos.z;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;

    enemy.health.current -= damage;
    enemy.stunTimer = stun;
    enemy.hitFlashTimer = 0.15;
    spawnDamageNumber(enemy.position, damage, 'enemy');

    if (knock > 0 && enemy.velocity) {
      const inv = 1 / (Math.sqrt(distSq) || 1);
      enemy.velocity.x += dx * inv * knock;
      enemy.velocity.z += dz * inv * knock;
    }

    if (enemy.health.current <= 0) {
      handleEnemyDeath(enemy, scene);
    }
  }
}

/**
 * Per-frame overload tick: handle rising/falling edges for each character's
 * ultimate, run continuous effects (rail bubble, lash tears, nova gravity,
 * byte vacuum, ghost phase), and manage the overload timer.
 *
 * @param {number} dt - delta time since last frame in seconds
 * @param {THREE.Scene} scene - the Three.js scene for VFX and projectiles
 */
export function OverloadSystem(dt: number, scene: THREE.Scene) {
  const player = world.with('isLocalPlayer', 'position', 'id').first;
  if (!player) return;

  const isActive = uiState.overloadActive;
  const char = uiState.selectedCharacter;

  // Passive trickle charging when not active
  if (!isActive && uiState.gameState === 'PLAYING') {
    uiState.overloadCharge = Math.min(100, uiState.overloadCharge + 0.3 * dt);
  }

  // 1. Rising Edge (Triggering the overload)
  if (isActive && !wasOverloadActive) {
    wasOverloadActive = true;
    lashSpawnTimer = 0;
    novaTickTimer = 0;

    switch (char) {
      case 'cypher': {
        // SYSTEM REBOOT — screen-clearing shockwave + stun
        announce('SYSTEM REBOOT');
        addTrauma(1.0);
        playExplosion();
        spawnRing(scene, player.position, 0x00d5ff, 16);
        radialBlast(scene, player.position, 18, 500, 3.0, 0);
        break;
      }
      case 'rail': {
        // SIEGE MODE — bubble shield (4× fire handled in WeaponSystem)
        announce('SIEGE MODE');
        railBubbleMesh = new THREE.Mesh(bubbleGeo, bubbleMat);
        railBubbleMesh.position.copy(player.position);
        scene.add(railBubbleMesh);
        break;
      }
      case 'lash': {
        announce('STATIC FIELD');
        break; // tears spawn continuously below
      }
      case 'nova': {
        // SINGULARITY — gravity well follows the player
        announce('SINGULARITY');
        novaWellMesh = new THREE.Mesh(wellGeo, wellMat);
        novaWellMesh.rotation.x = -Math.PI / 2;
        novaWellMesh.position.copy(player.position);
        novaWellMesh.position.y = 0.25;
        scene.add(novaWellMesh);
        spawnRing(scene, player.position, 0xaa66ff, 14);
        break;
      }
      case 'byte': {
        // SALVAGE VORTEX — hoover the entire battlefield's loot
        announce('SALVAGE VORTEX');
        playCollect(1.4);
        spawnRing(scene, player.position, 0xffcc00, 20);
        break;
      }
      case 'ghost': {
        // PHASE SHIFT — untouchable sprint (invuln applied continuously below)
        announce('PHASE SHIFT');
        spawnRing(scene, player.position, 0xccccff, 6);
        break;
      }
      case 'titan': {
        // SEISMIC SLAM — instant quake + temporary armor plating
        announce('SEISMIC SLAM');
        addTrauma(0.9);
        playExplosion();
        spawnRing(scene, player.position, 0xff8844, 12);
        radialBlast(scene, player.position, 10, 300, 2.5, 25);
        if (player.stats && !titanArmorApplied) {
          player.stats.armor += 5;
          titanArmorApplied = true;
        }
        break;
      }
      case 'flux': {
        // CHAOS SURGE — spin the wheel
        const effects = ['nuke', 'frenzy', 'heal', 'gold'] as const;
        const rolled = effects[Math.floor(Math.random() * effects.length)];
        uiState.fluxEffect = rolled;
        switch (rolled) {
          case 'nuke':
            announce('CHAOS: OBLITERATE');
            addTrauma(1.0);
            playExplosion();
            spawnRing(scene, player.position, 0xff3377, 16);
            radialBlast(scene, player.position, 18, 600, 2.0, 10);
            break;
          case 'frenzy':
            announce('CHAOS: FRENZY'); // 3× weapon tick in WeaponSystem
            spawnRing(scene, player.position, 0xff3377, 8);
            break;
          case 'heal': {
            announce('CHAOS: RESTORE');
            const hp = (player as { health?: { current: number; max: number } }).health;
            if (hp) hp.current = hp.max;
            player.invulnTimer = 2.0;
            spawnRing(scene, player.position, 0x00ff88, 8);
            break;
          }
          case 'gold':
            announce('CHAOS: GOLD RUSH');
            playCollect(1.5);
            spawnRing(scene, player.position, 0xffd75e, 10);
            for (let i = 0; i < 12; i++) {
              const a = (i / 12) * Math.PI * 2;
              spawnCredit(
                scene,
                player.position.x + Math.cos(a) * 2.5,
                player.position.z + Math.sin(a) * 2.5,
                5,
              );
            }
            break;
        }
        break;
      }
    }
  }

  // 2. Continuous updates while active
  if (isActive) {
    uiState.overloadTimer -= dt;

    if (uiState.overloadTimer <= 0) {
      uiState.overloadActive = false;
      deactivateOverload(scene, player);
    } else {
      switch (char) {
        case 'rail': {
          if (railBubbleMesh) {
            railBubbleMesh.position.copy(player.position);
            railBubbleMesh.rotation.y += dt * 1.5;
            railBubbleMesh.rotation.x += dt * 0.5;
          }
          break;
        }
        case 'lash': {
          lashSpawnTimer += dt;
          if (lashSpawnTimer >= 0.15) {
            lashSpawnTimer = 0;
            const mesh = new THREE.Mesh(tearGeo, tearMat);
            mesh.position.copy(player.position);
            mesh.position.y = 0.4;
            mesh.rotation.x = Math.PI; // point downwards
            scene.add(mesh);
            world.add({
              isLashTear: true,
              isParticle: true, // Auto cleaned up by LifecycleSystem if transform exists
              position: player.position.clone(),
              velocity: new THREE.Vector3(),
              transform: mesh,
              lifeTimer: 0,
              maxLife: 3.0,
              hitList: [] as number[],
            });
          }
          break;
        }
        case 'nova': {
          // Gravity well: drag enemies toward the player, grind the close ones
          if (novaWellMesh) {
            novaWellMesh.position.copy(player.position);
            novaWellMesh.position.y = 0.25;
            novaWellMesh.rotation.z += dt * 4.0;
            const pulse = 1 + Math.sin(uiState.overloadTimer * 8) * 0.12;
            novaWellMesh.scale.setScalar(pulse * 2.2);
          }
          const pull = 26; // u/s of suction
          for (const enemy of world.with('isEnemy', 'position', 'velocity', 'health')) {
            if (enemy.isBoss) continue;
            if (!enemy.health || enemy.health.current <= 0) continue;
            const dx = player.position.x - enemy.position.x;
            const dz = player.position.z - enemy.position.z;
            const distSq = dx * dx + dz * dz;
            if (distSq > 16 * 16 || distSq < 0.01) continue;
            const inv = 1 / Math.sqrt(distSq);
            enemy.velocity.x = dx * inv * pull;
            enemy.velocity.z = dz * inv * pull;
          }
          // Grinder tick: damage everything caught near the core
          novaTickTimer += dt;
          if (novaTickTimer >= 0.4) {
            novaTickTimer = 0;
            radialBlast(scene, player.position, 5, 30, 0.3, 0);
          }
          break;
        }
        case 'byte': {
          // Vacuum ALL loot on the field toward the player
          const suck = 38;
          for (const gem of world.with('isXP', 'position', 'velocity')) {
            const dx = player.position.x - gem.position.x;
            const dz = player.position.z - gem.position.z;
            const inv = 1 / (Math.hypot(dx, dz) || 1);
            gem.velocity.x = dx * inv * suck;
            gem.velocity.z = dz * inv * suck;
          }
          for (const c of world.with('isCredit', 'position', 'velocity')) {
            const dx = player.position.x - c.position.x;
            const dz = player.position.z - c.position.z;
            const inv = 1 / (Math.hypot(dx, dz) || 1);
            c.velocity.x = dx * inv * suck;
            c.velocity.z = dz * inv * suck;
          }
          break;
        }
        case 'ghost': {
          // Continuous phase: existing i-frame checks make the player
          // untouchable (contact, projectiles, shockwaves) and RenderSystem's
          // invuln blink doubles as the phase visual.
          if (player.invulnTimer === undefined || player.invulnTimer < 0.25) {
            player.invulnTimer = 0.25;
          }
          break;
        }
      }
    }
  }

  // 3. Falling Edge (Deactivation check from external means)
  if (!isActive && wasOverloadActive) {
    deactivateOverload(scene, player);
  }
}

function deactivateOverload(scene: THREE.Scene, player: { stats?: { armor: number } }) {
  wasOverloadActive = false;
  uiState.overloadActive = false;
  uiState.overloadTimer = 0;
  uiState.fluxEffect = '';

  if (railBubbleMesh) {
    scene.remove(railBubbleMesh);
    railBubbleMesh = null;
  }
  if (novaWellMesh) {
    scene.remove(novaWellMesh);
    novaWellMesh = null;
  }
  if (titanArmorApplied) {
    if (player.stats) player.stats.armor -= 5;
    titanArmorApplied = false;
  }
}
