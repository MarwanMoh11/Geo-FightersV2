/**
 * CollisionSystem - VS-Style Optimized
 *
 * Optimizations applied:
 * 1. Squared distance checks (no sqrt)
 * 2. Reusable vectors (no per-frame allocations)
 * 3. One-way collision (bullets check enemies)
 * 4. Early-out on dead enemies
 * 5. Batch geometry damage for AoE
 */

import { world } from '../core/world';
import * as THREE from 'three';
import { addTrauma } from './CameraSystem';
import { WEAPONS } from '../core/WeaponRegistry';
import { spawnXP, spawnCredit } from '../core/factories';
import { offerSecondChanceOrEnd } from './GameManager';
import { playExplosion, playHurt, playCollect } from '../core/audio';
import { reportDamageTaken, reportKill } from '../core/FlowStateManager';
import { recordKill, recordDamage, recordVaultCracked } from '../core/ProgressManager';
import {
  spawnChest,
  tryDropEliteChest,
  registerGuaranteedChestDrop,
  rollChestRarity,
} from './ChestSystem';
import { uiState, announce } from '../core/UIState.svelte.ts';
import { spawnDamageNumber } from './DamageNumberSystem';
import { haptics } from '../core/haptics';
import { dlog } from '../core/debug';
import { scaleParticleCount } from '../core/quality';
import { sendDirectEvent } from '../core/network';
import {
  removeBody,
  getEventQueue,
  getEntityByColliderHandle,
  isRapierInitialized,
} from '../core/RapierWorld';

// --- REUSABLE VECTORS & ARRAYS (Zero GC pressure) ---
const _pushDir = new THREE.Vector3();
const _blastDir = new THREE.Vector3();
const _tempVec = new THREE.Vector3();
const _nearbyEnemies: any[] = [];

export function CollisionSystem(scene: THREE.Scene) {
  // --- RAPIER EVENT-DRIVEN COLLISION ---
  if (!isRapierInitialized()) return;

  try {
    const eventQueue = getEventQueue();

    // 1. DRAIN COLLISION EVENTS (Solid vs Solid & Sensor vs Solid)
    eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      processCollision(h1, h2, scene);
    });
  } catch {
    // Fail silently if physics not yet initialized
  }

  // 1b. ENEMY ↔ PLAYER CONTACT SWEEP (Phase 1.98 VS contact model)
  // Rapier only reports contact STARTS — an enemy that stays pressed against
  // the player fires one event and then never again, so sustained contact
  // dealt a trickle no matter the cooldown model. A direct distance sweep
  // makes touch damage continuous and per-enemy: density IS the threat.
  for (const player of world.with('isPlayer', 'position', 'health')) {
    if (!player.health || player.health.current <= 0) continue;
    if (player.invulnTimer && player.invulnTimer > 0) continue; // stagger window
    for (const enemy of world.with('isEnemy', 'position', 'health')) {
      const dx = enemy.position.x - player.position.x;
      const dz = enemy.position.z - player.position.z;
      // Bigger bodies have longer reach (boss/elite silhouettes)
      const reach = 1.4 + (enemy.size ?? 1.5) * 0.25;
      if (dx * dx + dz * dz < reach * reach) {
        handleEnemyPlayerCollision(enemy, player, scene);
        if (player.invulnTimer && player.invulnTimer > 0) break; // hit landed
      }
    }
  }

  // 2. LASH SPATIAL TEARS DAMAGE SWEEP
  for (const tear of world.with('isLashTear', 'position', 'hitList')) {
    const tearPos = tear.position;
    for (const enemy of world.with('isEnemy', 'position', 'health')) {
      if (!enemy.health || enemy.health.current <= 0) continue;
      if (tear.hitList && tear.hitList.includes(enemy.id || 0)) continue;

      const dx = enemy.position.x - tearPos.x;
      const dz = enemy.position.z - tearPos.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < 1.4 * 1.4) {
        if (tear.hitList) tear.hitList.push(enemy.id || 0);

        const pushDir = new THREE.Vector3(dx, 0, dz).normalize();
        applyDamage(enemy, 90, pushDir, 6, scene);
      }
    }
  }
}

function processCollision(h1: number, h2: number, scene: THREE.Scene) {
  const e1 = world.get(getEntityByColliderHandle(h1) as any);
  const e2 = world.get(getEntityByColliderHandle(h2) as any);

  if (!e1 || !e2) return;

  // Determine roles
  const projectile =
    e1.isProjectile && !e1.isEnemyProjectile
      ? e1
      : e2.isProjectile && !e2.isEnemyProjectile
        ? e2
        : null;
  const enemyProjectile = e1.isEnemyProjectile ? e1 : e2.isEnemyProjectile ? e2 : null;
  const enemy = e1.isEnemy ? e1 : e2.isEnemy ? e2 : null;
  const player = e1.isPlayer ? e1 : e2.isPlayer ? e2 : null;

  // A. BULLET VS ENEMY
  if (projectile && enemy) {
    handleProjectileEnemyCollision(projectile, enemy, scene);
  }

  // B. ENEMY VS PLAYER
  if (enemy && player) {
    handleEnemyPlayerCollision(enemy, player, scene);
  }

  // C. ENEMY PROJECTILE VS PLAYER
  if (enemyProjectile && player) {
    handleEnemyProjectilePlayerCollision(enemyProjectile, player, scene);
  }
}

function handleProjectileEnemyCollision(bullet: any, enemy: any, scene: THREE.Scene) {
  if (!bullet.projectile || !enemy.health || enemy.health.current <= 0) return;

  // PIERCE CHECK: Already hit
  if (enemy.id && bullet.projectile.hitList.includes(enemy.id)) return;

  // 1. APPLY DAMAGE
  applyDamage(
    enemy,
    bullet.damage || 1,
    bullet.velocity || new THREE.Vector3(0, 0, 0),
    bullet.projectile.knockback,
    scene,
    'enemy',
    bullet.weaponId,
    bullet.weapon?.bulletColor,
    bullet.ownerConnId,
  );

  // Spark FX on impact
  spawnImpactFX(bullet.position, scene, bullet.weaponId, bullet.weapon?.bulletColor, 2);

  // 2. REGISTER HIT
  bullet.projectile.hitList.push(enemy.id!);
  bullet.projectile.pierce -= 1;

  // 3. EXPLOSION LOGIC (AoE)
  if (bullet.projectile.explodeRadius > 0) {
    const blastRadiusSq = bullet.projectile.explodeRadius * bullet.projectile.explodeRadius;
    spawnBlastFX(bullet.position, bullet.projectile.explodeRadius, scene);
    addTrauma(0.3);
    playExplosion();

    const confusionDuration = bullet.projectile.confusionDuration || 0;

    _nearbyEnemies.length = 0;
    for (const target of world.with('isEnemy', 'position', 'health')) {
      _nearbyEnemies.push(target);
    }

    for (const target of _nearbyEnemies) {
      if (target === enemy) continue;
      if (!target.health || target.health.current <= 0) continue;

      const dx = target.position.x - bullet.position.x;
      const dz = target.position.z - bullet.position.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < blastRadiusSq) {
        if (confusionDuration > 0) {
          target.confusedTimer = confusionDuration;
          target.hitFlashTimer = 0.2;
        } else {
          _blastDir.set(dx, 0, dz).normalize();
          applyDamage(
            target,
            bullet.damage || 1,
            _blastDir.multiplyScalar(20),
            10,
            scene,
            'aoe',
            bullet.weaponId,
            bullet.weapon?.bulletColor,
            bullet.ownerConnId,
          );
        }
      }
    }
  }

  // 4. BULLET DEATH
  if (bullet.projectile.explodeRadius > 0 || bullet.projectile.pierce <= 0) {
    despawn(bullet, scene);
  }
}

// How long the player is untouchable after taking a hit
const PLAYER_IFRAME_DURATION = 0.8;

/**
 * Play the "I got hit" feedback for a player after damage is applied.
 * - Local player (host or solo): fire the effects right here, like single-player.
 * - Remote player (host is simulating their damage): send a targeted event to
 *   THAT player's client so it plays the same juice at its own position. This
 *   is why the joining player now feels hits identically to the host — and it
 *   stops the host's own screen from flashing when a teammate is hit.
 * `dirX/dirZ` point from the damage source toward the player (knockback dir).
 */
function applyPlayerHitFeedback(
  player: any,
  damage: number,
  trauma: number,
  dirX: number,
  dirZ: number,
  knockStrength: number,
) {
  player.hitFlashTimer = 0.15; // flash the avatar on this machine's screen

  if (player.isLocalPlayer) {
    reportDamageTaken(damage);
    addTrauma(trauma);
    playHurt();
    haptics.hit();
    spawnDamageNumber(player.position, damage, 'player');
    uiState.damageFlash++; // drives the HUD red vignette
    if (!player.knockback) player.knockback = new THREE.Vector3();
    _tempVec.set(dirX, 0, dirZ).normalize().multiplyScalar(knockStrength);
    player.knockback.add(_tempVec);
  } else if (uiState.isHost && player.connectionId) {
    // Remote player, host-side: their client owns the feedback + knockback.
    sendDirectEvent(player.connectionId, 'player-hit', {
      d: Math.round(damage),
      t: trauma,
      kx: Math.round(dirX * 100) / 100,
      kz: Math.round(dirZ * 100) / 100,
      ks: knockStrength,
    });
  }
}

// VS contact model (Phase 1.98): every enemy carries its OWN contact cooldown,
// so incoming damage scales with how many bodies are touching you — density IS
// the threat. The old model was one flat hit behind a global 0.8s i-frame:
// 6.25 HP/s maximum whether 3 enemies touched you or 300, which made the
// entire horde cosmetic. A short global stagger keeps same-frame pile hits
// reading as a drumbeat instead of an instant burst.
const ENEMY_CONTACT_COOLDOWN = 1.0;
const PLAYER_CONTACT_STAGGER = 0.15;
const CONTACT_DAMAGE: Record<string, number> = {
  virus: 4,
  glitch: 6,
  firewall: 12,
  enforcer: 14,
  warden: 10,
  colossus: 18,
  hydra: 16,
  overseer: 20,
};

function handleEnemyPlayerCollision(enemy: any, player: any, _scene: THREE.Scene) {
  if (!enemy.health || enemy.health.current <= 0 || !player.health || player.health.current <= 0)
    return;

  // This enemy already landed its hit recently
  if (enemy.contactCooldown && enemy.contactCooldown > 0) return;
  // Global stagger window (kept short — it spaces hits, it doesn't gate them)
  if (player.invulnTimer && player.invulnTimer > 0) return;

  // INVULNERABILITY: ignore contact while player is in a menu or in Lash's invuln overload state
  if (
    player.isUpgrading ||
    (player.isLocalPlayer &&
      (uiState.showUpgrade ||
        uiState.showChestCeremony ||
        uiState.showProtocolChoice ||
        uiState.gameState === 'PAUSED' ||
        (uiState.overloadActive && uiState.selectedCharacter === 'lash')))
  ) {
    return;
  }

  const baseDamage = CONTACT_DAMAGE[enemy.enemyType as string] ?? 5;
  const armor = player.stats?.armor || 0;
  let actualDamage = Math.max(1, baseDamage - armor);
  // Map 1 Aegis Relay: halve incoming damage for the buff window
  if (player.isLocalPlayer && uiState.shrineArmorTimer > 0) {
    actualDamage = Math.max(1, Math.ceil(actualDamage * 0.5));
  }

  player.health.current -= actualDamage;
  player.invulnTimer = PLAYER_CONTACT_STAGGER;
  enemy.contactCooldown = ENEMY_CONTACT_COOLDOWN;

  const dx = player.position.x - enemy.position.x;
  const dz = player.position.z - enemy.position.z;

  // Feedback (local: play now; remote: sent to their client) + knockback
  applyPlayerHitFeedback(player, actualDamage, 0.45, dx, dz, 9);

  // Knock enemy back a bit
  _pushDir.set(-dx, 0, -dz).normalize().multiplyScalar(5);
  enemy.velocity.add(_pushDir);
  enemy.stunTimer = 0.5;

  if (player.health.current <= 0) {
    // Cooperative multiplayer check: only game over if ALL players are dead
    let anyAlive = false;
    for (const p of world.with('isPlayer', 'health')) {
      if (p.health && p.health.current > 0) {
        anyAlive = true;
        break;
      }
    }
    if (!anyAlive) {
      offerSecondChanceOrEnd();
    }
  }
}

function handleEnemyProjectilePlayerCollision(bullet: any, player: any, scene: THREE.Scene) {
  if (!player.health || player.health.current <= 0) return;

  // I-FRAMES: ignore contact while the post-hit window is active
  if (player.invulnTimer && player.invulnTimer > 0) return;

  // INVULNERABILITY: ignore contact while player is in a menu or in Lash's invuln overload state
  if (
    player.isUpgrading ||
    (player.isLocalPlayer &&
      (uiState.showUpgrade ||
        uiState.showChestCeremony ||
        uiState.showProtocolChoice ||
        uiState.gameState === 'PAUSED' ||
        (uiState.overloadActive && uiState.selectedCharacter === 'lash')))
  ) {
    return;
  }

  const baseDamage = bullet.damage || 8;
  const armor = player.stats?.armor || 0;
  let actualDamage = Math.max(1, baseDamage - armor);
  if (player.isLocalPlayer && uiState.shrineArmorTimer > 0) {
    actualDamage = Math.max(1, Math.ceil(actualDamage * 0.5));
  }

  player.health.current -= actualDamage;
  player.invulnTimer = PLAYER_IFRAME_DURATION;

  // Knockback direction follows the bullet's travel
  const bvx = bullet.velocity?.x || 0;
  const bvz = bullet.velocity?.z || 0;
  applyPlayerHitFeedback(player, actualDamage, 0.35, bvx, bvz, 6);

  // Clear projectile
  despawn(bullet, scene);

  if (player.health.current <= 0) {
    let anyAlive = false;
    for (const p of world.with('isPlayer', 'health')) {
      if (p.health && p.health.current > 0) {
        anyAlive = true;
        break;
      }
    }
    if (!anyAlive) {
      offerSecondChanceOrEnd();
    }
  }
}

// --- HELPER: Damage Application (with array mutation awareness) ---
function applyDamage(
  enemy: any,
  dmg: number,
  vel: THREE.Vector3,
  knockback: number,
  scene: THREE.Scene,
  variant: 'enemy' | 'aoe' = 'enemy',
  weaponId?: string,
  bulletColor?: number,
  killerConnId?: string,
) {
  if (!enemy.health) return;

  const player = world.with('isLocalPlayer', 'stats').first;
  const luckMult = player?.stats?.luck || 1.0;

  // Roll for Critical Hit (base 5% chance, scaled by luck)
  const critChance = 0.05 * luckMult;
  const isCrit = Math.random() < critChance;
  const finalDamage = isCrit ? Math.round(dmg * 2.5) : dmg;
  recordDamage(finalDamage);

  if (enemy.isBoss) {
    // Boss takes real damage and can now be killed. Death/cleanup is owned by
    // FinaleBossSystem (it manages the boss entity, rapier body and victory
    // trigger), so we only apply the damage here — no knockback/stun, and no
    // generic enemy death/XP/chest handling.
    enemy.health.current -= finalDamage;
    spawnDamageNumber(enemy.position, finalDamage, variant, isCrit);
    enemy.hitFlashTimer = 0.1;
    return;
  }

  enemy.health.current -= finalDamage;
  spawnDamageNumber(enemy.position, finalDamage, variant, isCrit);

  // Juice
  enemy.hitFlashTimer = 0.1;
  _pushDir.copy(vel).normalize();
  _pushDir.y = 0;
  enemy.velocity.add(_pushDir.multiplyScalar(knockback));
  enemy.stunTimer = 0.2;

  // Death
  if (enemy.health.current <= 0) {
    handleEnemyDeath(enemy, scene, weaponId, bulletColor, killerConnId);
  }
}

// Kill-combo chain: kills within the window extend the chain; callouts fire
// at escalating thresholds (the "something every 5 seconds" dopamine rule).
const COMBO_WINDOW_MS = 2000;
const COMBO_MILESTONES = [25, 50, 100, 250, 500, 1000];
let comboExpiresAt = 0;

export function tickCombo(): void {
  if (uiState.combo > 0 && performance.now() > comboExpiresAt) {
    uiState.combo = 0;
  }
}

function chainCombo(): void {
  const now = performance.now();
  uiState.combo = now > comboExpiresAt ? 1 : uiState.combo + 1;
  comboExpiresAt = now + COMBO_WINDOW_MS;
  if (uiState.combo > uiState.bestCombo) uiState.bestCombo = uiState.combo;
  if (COMBO_MILESTONES.includes(uiState.combo)) {
    announce(`COMBO ×${uiState.combo}`);
    playCollect(1 + COMBO_MILESTONES.indexOf(uiState.combo) * 0.15);
  }
}

/**
 * Credit a kill to the player who landed it (co-op scoreboard). Falls back to
 * the local player when no connection id is attached (melee tears, anomalies,
 * overload bursts, single-player).
 */
function creditKill(killerConnId?: string) {
  let killer: any = null;
  if (killerConnId) {
    for (const p of world.with('isPlayer')) {
      if (p.connectionId === killerConnId) {
        killer = p;
        break;
      }
    }
  }
  if (!killer) killer = world.with('isLocalPlayer').first;
  if (killer) {
    killer.kills = (killer.kills || 0) + 1;
    if (killer.isLocalPlayer) uiState.kills = killer.kills;
  } else {
    uiState.kills++;
  }
}

export function handleEnemyDeath(
  enemy: any,
  scene: THREE.Scene,
  weaponId = '',
  bulletColor = 0xb0b0b0,
  killerConnId?: string,
) {
  reportKill();
  creditKill(killerConnId);
  recordKill();
  chainCombo();

  spawnImpactFX(enemy.position, scene, weaponId, bulletColor, 6);
  spawnXP(scene, enemy.position.x, enemy.position.z, enemy.xpValue || 10);

  const type = enemy.enemyType;

  // Elite/miniboss deaths punch a shockwave ring into the ground — trash
  // keeps the cheap particle burst (this fires at elite rates only).
  const ELITE_DEATH_RING: Record<string, number> = {
    enforcer: 0x00ffcc,
    colossus: 0xffaa00,
    warden: 0xff00cc,
    hydra: 0xff2244,
    overseer: 0xaa44ff,
  };
  if (type && ELITE_DEATH_RING[type] !== undefined) {
    spawnBlastFX(enemy.position, (enemy.size ?? 3) * 1.1, scene, ELITE_DEATH_RING[type]);
  }
  const px = enemy.position.x;
  const pz = enemy.position.z;

  const player = world.with('isLocalPlayer', 'stats').first;
  const luckMult = player?.stats?.luck || 1.0;

  // Data vault greed event: cracking it showers credits + guarantees a chest
  // (rarity rolls with time/luck but never below rare — it's the greed prize).
  if (enemy.isVault) {
    recordVaultCracked();
    announce('VAULT CRACKED');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      spawnCredit(scene, px + Math.cos(a) * 1.2, pz + Math.sin(a) * 1.2, 2);
    }
    registerGuaranteedChestDrop();
    const vaultRarity = rollChestRarity(luckMult + 0.5);
    spawnChest(scene, px, pz, vaultRarity === 'common' ? 'rare' : vaultRarity);

    // The vault reuses the firewall enemy type — skip the regular elite
    // credit/chest branches below or it would double-pay.
    despawn(enemy, scene);
    return;
  }

  // === CREDIT DROPS ===
  let insideLeakZone = false;
  for (const zone of world.with('isAnomaly', 'anomalyType', 'size', 'position')) {
    if (zone.anomalyType === 'leak') {
      const halfSize = (zone.size || 6.0) / 2;
      const zx = zone.position.x;
      const zz = zone.position.z;
      if (
        px >= zx - halfSize &&
        px <= zx + halfSize &&
        pz >= zz - halfSize &&
        pz <= zz + halfSize
      ) {
        insideLeakZone = true;
        break;
      }
    }
  }
  const scavengerMult = uiState.activeProtocolId === 'scavenger_daemon' ? 3 : 1;
  const creditMultiplier = (insideLeakZone ? 5 : 1) * scavengerMult;

  // Basic: 5% * luck chance to drop 1 Credit
  if (Math.random() < 0.05 * luckMult) {
    spawnCredit(scene, px, pz, 1 * creditMultiplier);
  }

  // Elites & Mini-bosses drop credits 100% of the time
  if (type === 'firewall' || type === 'enforcer' || type === 'warden') {
    const amt = (Math.floor(Math.random() * 6) + 5) * creditMultiplier; // 5-10 base
    spawnCredit(scene, px, pz, amt);
  } else if (type === 'colossus') {
    const amt = (Math.floor(Math.random() * 11) + 20) * creditMultiplier; // 20-30 base
    spawnCredit(scene, px, pz, amt);
  } else if (type === 'hydra') {
    spawnCredit(scene, px, pz, 50 * creditMultiplier);
  } else if (type === 'overseer') {
    spawnCredit(scene, px, pz, 100 * creditMultiplier);
  }

  // === CHEST DROPS BY ENEMY TYPE ===
  // Standard elites go through the chest governor (at most one chest per
  // cooldown window — firewalls spawn in packs late game and used to rain
  // chests). A denied drop pays credits instead so the kill still rewards.
  if (type === 'firewall' || type === 'enforcer' || type === 'warden') {
    if (tryDropEliteChest(scene, px, pz, luckMult)) {
      dlog(`[Chest] ${type} dropped a chest`);
    } else {
      spawnCredit(scene, px, pz, 3 * creditMultiplier);
    }
  }
  // Mid-tier elite: also gated, but pays a bigger consolation.
  else if (type === 'colossus') {
    if (tryDropEliteChest(scene, px, pz, luckMult + 0.5)) {
      dlog(`[Chest] ${type} dropped a chest`);
    } else {
      spawnCredit(scene, px, pz, 8 * creditMultiplier);
    }
  }
  // Mini-boss HYDRA: one guaranteed epic (was 3 rares — chained 3 ceremony
  // modals back-to-back) plus a credit fan.
  else if (type === 'hydra') {
    registerGuaranteedChestDrop();
    spawnChest(scene, px, pz, 'epic');
    for (let i = 0; i < 4; i++) {
      spawnCredit(scene, px + (i - 1.5) * 1.2, pz + 1.2, 6 * creditMultiplier);
    }
    dlog(`[Chest] HYDRA dropped an epic chest`);
  }
  // Major boss OVERSEER: two epics (was 5 — five chained ceremonies and a
  // free full build) plus a credit ring.
  else if (type === 'overseer') {
    registerGuaranteedChestDrop();
    spawnChest(scene, px - 1.5, pz, 'epic');
    spawnChest(scene, px + 1.5, pz, 'epic');
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      spawnCredit(
        scene,
        px + Math.cos(angle) * 2.2,
        pz + Math.sin(angle) * 2.2,
        8 * creditMultiplier,
      );
    }
    dlog(`[Chest] OVERSEER dropped 2 epic chests`);
  }

  despawn(enemy, scene);
}

export function spawnImpactFX(
  pos: THREE.Vector3,
  _scene: THREE.Scene,
  weaponId?: string,
  color?: number,
  count: number = 5,
) {
  const finalColor = color ?? (weaponId ? WEAPONS[weaponId]?.color : 0xff0055) ?? 0xff0055;

  // Cosmetic debris count scales with the graphics quality tier
  const scaledCount = scaleParticleCount(count);
  for (let i = 0; i < scaledCount; i++) {
    // Determine scale & shape based on weapon
    let particleScale = 1.0;
    if (weaponId === 'monowire_lash' || weaponId === 'nanofiber_guillotine') {
      particleScale = 1.4;
    } else if (weaponId === 'smart_rail_needles' || weaponId === 'magnetic_railstorm') {
      particleScale = 0.55;
    } else if (weaponId === 'cryo_foam_disperser' || weaponId === 'thermal_collapse') {
      particleScale = 1.35;
    }

    let scaleX = particleScale;
    let scaleY = particleScale;
    let scaleZ = particleScale;

    if (weaponId === 'monowire_lash' || weaponId === 'nanofiber_guillotine') {
      scaleX = 0.03 * particleScale;
      scaleY = 0.03 * particleScale;
      scaleZ = 0.3 * particleScale;
    }

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * (weaponId ? 18 : 15),
      Math.random() * 8 + 2,
      (Math.random() - 0.5) * (weaponId ? 18 : 15),
    );

    world.add({
      isParticle: true,
      isInstancedParticle: true,
      position: pos.clone(),
      velocity: vel,
      scaleX,
      scaleY,
      scaleZ,
      rotationX: 0,
      rotationZ: 0,
      lifeTimer: 0,
      maxLife: 0.22 + Math.random() * 0.15,
      // Randomized tumble so each shard spins differently
      spinX: (Math.random() - 0.5) * 20,
      spinZ: (Math.random() - 0.5) * 14,
      particleColor: finalColor,
    });
  }
}

const blastGeo = new THREE.RingGeometry(0.1, 0.2, 16);
const blastMat = new THREE.MeshBasicMaterial({
  color: 0x9900ff,
  transparent: true,
  opacity: 0.8,
  side: THREE.DoubleSide,
});

function spawnBlastFX(pos: THREE.Vector3, radius: number, scene: THREE.Scene, color?: number) {
  // Clone the material so the fade-out doesn't affect other live rings
  const mesh = new THREE.Mesh(blastGeo, blastMat.clone());
  if (color !== undefined) (mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(pos);
  mesh.position.y = 0.5;
  scene.add(mesh);

  world.add({
    isParticle: true,
    position: pos.clone(),
    velocity: new THREE.Vector3(0, 0, 0),
    transform: mesh,
    lifeTimer: 0,
    maxLife: 0.35,
    // RingGeometry outer radius is 0.2, so scale to reach the blast radius
    ringGrow: radius / 0.2 - 1,
  });
}

function despawn(entity: any, scene: THREE.Scene) {
  if (entity.transform) scene.remove(entity.transform);

  // Clean up Rapier rigid body
  if (entity.rigidBody) {
    removeBody(entity.rigidBody);
    entity.rigidBody = undefined;
    entity.collider = undefined;
  }

  world.remove(entity);
}
