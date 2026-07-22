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
import { corruptionDamage } from '../core/corruption';
import { spawnDamageNumber } from './DamageNumberSystem';
import { haptics } from '../core/haptics';
import { dlog } from '../core/debug';
import { scaleParticleCount } from '../core/quality';
import { sendDirectEvent } from '../core/network';
import { removeBody } from '../core/RapierWorld';

// --- REUSABLE VECTORS & ARRAYS (Zero GC pressure) ---
const _pushDir = new THREE.Vector3();
const _blastDir = new THREE.Vector3();
const _tempVec = new THREE.Vector3();

// --- FRAME CACHES (materialized once, shared by every sweep) ---
const _enemies: any[] = [];
const _players: any[] = [];

// --- SPATIAL GRID over living enemies ---
// Cell size 4u ≥ the largest interaction radius (boss hit-reach ~2.7u, contact
// reach ~3.4u), so a 3×3 neighborhood query can never miss a pair. Cells are
// pooled index arrays — rebuilt per frame with zero allocation.
const GRID_CELL = 4.0;
const GRID_OFFSET = 1024;
const _grid = new Map<number, number[]>();
const _cellPool: number[][] = [];
let _cellPoolUsed = 0;

function gridKey(cx: number, cz: number): number {
  return (cx + GRID_OFFSET) * 4096 + (cz + GRID_OFFSET);
}

function gridCellFor(key: number): number[] {
  let cell = _grid.get(key);
  if (!cell) {
    cell = _cellPool[_cellPoolUsed] ?? (_cellPool[_cellPoolUsed] = []);
    _cellPoolUsed++;
    cell.length = 0;
    _grid.set(key, cell);
  }
  return cell;
}

/** Bullet hit radius matches the old Rapier pair sum (bullet 0.3 + enemy ball). */
function enemyHitRadius(enemy: any): number {
  return 0.3 + Math.max(0.6, (enemy.size ?? 1.5) * 0.3);
}

export function CollisionSystem(scene: THREE.Scene) {
  // Materialize living enemies + players ONCE per frame. All sweeps below run
  // over plain arrays and the shared grid — no per-bullet ECS re-iteration.
  _enemies.length = 0;
  for (const e of world.with('isEnemy', 'position', 'health')) {
    if (e.health && e.health.current > 0) _enemies.push(e);
  }
  _players.length = 0;
  for (const p of world.with('isPlayer', 'position', 'health')) {
    if (p.health && p.health.current > 0) _players.push(p);
  }

  _grid.clear();
  _cellPoolUsed = 0;
  for (let i = 0; i < _enemies.length; i++) {
    const e = _enemies[i];
    const cx = Math.floor(e.position.x / GRID_CELL);
    const cz = Math.floor(e.position.z / GRID_CELL);
    gridCellFor(gridKey(cx, cz)).push(i);
  }

  // 1. BULLET → ENEMY (grid query: 3×3 cells around the bullet)
  for (const bullet of world.with('isProjectile', 'position', 'projectile', 'damage')) {
    if (bullet.isEnemyProjectile || !bullet.projectile) continue;
    const bcx = Math.floor(bullet.position.x / GRID_CELL);
    const bcz = Math.floor(bullet.position.z / GRID_CELL);
    let despawned = false;
    for (let gx = bcx - 1; gx <= bcx + 1 && !despawned; gx++) {
      for (let gz = bcz - 1; gz <= bcz + 1 && !despawned; gz++) {
        const cell = _grid.get(gridKey(gx, gz));
        if (!cell) continue;
        for (let k = 0; k < cell.length; k++) {
          const enemy = _enemies[cell[k]];
          if (!enemy.health || enemy.health.current <= 0) continue;
          const dx = enemy.position.x - bullet.position.x;
          const dz = enemy.position.z - bullet.position.z;
          const hr = enemyHitRadius(enemy);
          if (dx * dx + dz * dz < hr * hr) {
            handleProjectileEnemyCollision(bullet, enemy, scene);
            // Handler despawns the bullet when pierce runs out or it explodes
            if (bullet.projectile.explodeRadius > 0 || bullet.projectile.pierce <= 0) {
              despawned = true;
              break;
            }
          }
        }
      }
    }
  }

  // 1b. ENEMY PROJECTILE → PLAYER (few of each, plain sweep)
  for (const bullet of world.with('isEnemyProjectile', 'position', 'velocity', 'damage')) {
    for (const player of _players) {
      const dx = player.position.x - bullet.position.x;
      const dz = player.position.z - bullet.position.z;
      if (dx * dx + dz * dz < 1.4 * 1.4) {
        handleEnemyProjectilePlayerCollision(bullet, player, scene);
        break;
      }
    }
  }

  // 2. ENEMY ↔ PLAYER CONTACT (grid query, continuous touch damage per enemy)
  for (const player of _players) {
    if (player.invulnTimer && player.invulnTimer > 0) continue;
    const pcx = Math.floor(player.position.x / GRID_CELL);
    const pcz = Math.floor(player.position.z / GRID_CELL);
    let landed = false;
    for (let gx = pcx - 1; gx <= pcx + 1 && !landed; gx++) {
      for (let gz = pcz - 1; gz <= pcz + 1 && !landed; gz++) {
        const cell = _grid.get(gridKey(gx, gz));
        if (!cell) continue;
        for (let k = 0; k < cell.length; k++) {
          const enemy = _enemies[cell[k]];
          if (!enemy.health || enemy.health.current <= 0) continue;
          const dx = enemy.position.x - player.position.x;
          const dz = enemy.position.z - player.position.z;
          const reach = 1.4 + (enemy.size ?? 1.5) * 0.25;
          if (dx * dx + dz * dz < reach * reach) {
            handleEnemyPlayerCollision(enemy, player, scene);
            if (player.invulnTimer && player.invulnTimer > 0) {
              landed = true;
              break;
            }
          }
        }
      }
    }
  }

  // 3. LASH SPATIAL TEARS (grid query)
  for (const tear of world.with('isLashTear', 'position', 'hitList')) {
    const tearPos = tear.position;
    const tcx = Math.floor(tearPos.x / GRID_CELL);
    const tcz = Math.floor(tearPos.z / GRID_CELL);
    for (let gx = tcx - 1; gx <= tcx + 1; gx++) {
      for (let gz = tcz - 1; gz <= tcz + 1; gz++) {
        const cell = _grid.get(gridKey(gx, gz));
        if (!cell) continue;
        for (let k = 0; k < cell.length; k++) {
          const enemy = _enemies[cell[k]];
          if (!enemy.health || enemy.health.current <= 0) continue;
          if (tear.hitList && tear.hitList.includes(enemy.id || 0)) continue;

          const dx = enemy.position.x - tearPos.x;
          const dz = enemy.position.z - tearPos.z;
          if (dx * dx + dz * dz < 1.4 * 1.4) {
            if (tear.hitList) tear.hitList.push(enemy.id || 0);
            applyDamage(enemy, 90, _pushDir.set(dx, 0, dz).normalize(), 6, scene);
          }
        }
      }
    }
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

    // AoE scans the frame's materialized enemy list — no ECS re-iteration
    for (const target of _enemies) {
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

  // Contact damage scales with corruption only past the standard (5) — the
  // horde bites harder at the brutal tiers, not at the default.
  const baseDamage =
    (CONTACT_DAMAGE[enemy.enemyType as string] ?? 5) * corruptionDamage(uiState.corruption);
  const armor = player.stats?.armor || 0;
  let actualDamage = Math.max(1, Math.round(baseDamage - armor));
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
  // Dead enemies take no further damage — the frame's materialized arrays can
  // hold an entity for a few more sweeps after it died this frame, and without
  // this guard a second hit would trigger death (XP/chest drops) twice.
  if (!enemy.health || enemy.health.current <= 0) return;

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

// Hard ceiling on live particle entities — kill bursts at horde density would
// otherwise flood the ECS with debris faster than LifecycleSystem drains it.
const MAX_PARTICLE_ENTITIES = 1200;

export function spawnImpactFX(
  pos: THREE.Vector3,
  _scene: THREE.Scene,
  weaponId?: string,
  color?: number,
  count: number = 5,
) {
  if (world.count('isParticle') >= MAX_PARTICLE_ENTITIES) return;
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

  // Remove from the world BEFORE nulling the body, so the rigidBody index
  // doesn't keep a stale reference to a despawned entity.
  const rb = entity.rigidBody;
  world.remove(entity);
  if (rb) {
    removeBody(rb);
    entity.rigidBody = undefined;
    entity.collider = undefined;
  }
}
