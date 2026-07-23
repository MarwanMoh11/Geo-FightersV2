/**
 * ClientCombatFxSystem — COSMETIC combat feedback for the joining player.
 *
 * On a co-op client the host owns all damage/kills, so the client is a passive
 * mirror: its bullets sail straight through enemies with no spark, no flash,
 * no sound — combat feels dead. This system runs ONLY on clients and gives the
 * cause-and-effect juice locally, without touching authoritative state:
 *   - each projectile that reaches an enemy spawns impact debris, flashes that
 *     enemy, plays the shoot-impact tick, and is consumed (pierce/despawn) so
 *     bullets visibly connect instead of passing through.
 *   - enemy HEALTH and DEATH stay host-authoritative (we never change hp here);
 *     death FX + XP-pickup sounds are handled in the host-state sync.
 *
 * Uses a per-frame spatial hash of enemies so it stays cheap with hundreds of
 * bullets and enemies.
 */

import * as THREE from 'three';
import { world } from '../core/world';
import { uiState } from '../core/UIState.svelte.ts';
import { spawnImpactFX } from './CollisionSystem';
import { playCollect, playExplosion } from '../core/audio';

const CELL = 1.2; // ~ bullet + enemy radius
const GRID_OFFSET = 1024;
const _grid = new Map<number, any[]>();
const _cellPool: any[][] = [];
let _cellPoolUsed = 0;

// Rate-limit the impact "tick" sound so a wall of bullets doesn't machine-gun
// the audio; the visuals (sparks/flash) still fire on every hit.
let lastImpactSound = 0;
const IMPACT_SOUND_INTERVAL = 0.06;

function key(cx: number, cz: number): number {
  return (cx + GRID_OFFSET) * 4096 + (cz + GRID_OFFSET);
}

/**
 * Client-side cosmetic combat feedback: spawn impact sparks, flash enemies,
 * and consume projectiles on hit so bullets visually connect. Runs only on
 * co-op clients — the host owns authoritative damage.
 *
 * @param {number} _dt - delta time since last frame in seconds
 * @param {THREE.Scene} scene - the Three.js scene for impact VFX
 */
export function ClientCombatFxSystem(_dt: number, scene: THREE.Scene): void {
  if (!uiState.isMultiplayer || uiState.isHost) return;

  // Build the enemy spatial hash for this frame
  _grid.clear();
  _cellPoolUsed = 0;
  let enemyCount = 0;
  for (const e of world.with('isEnemy', 'position')) {
    if (e.isBoss) continue;
    if (e.health && e.health.current <= 0) continue;
    const cx = Math.floor(e.position.x / CELL);
    const cz = Math.floor(e.position.z / CELL);
    const k = key(cx, cz);
    let cell = _grid.get(k);
    if (!cell) {
      cell = _cellPool[_cellPoolUsed] ?? (_cellPool[_cellPoolUsed] = []);
      _cellPoolUsed++;
      cell.length = 0;
      _grid.set(k, cell);
    }
    cell.push(e);
    enemyCount++;
  }
  if (enemyCount === 0) return;

  const now = performance.now() / 1000;

  // Test each active player projectile against nearby enemies
  for (const p of world.with('isProjectile', 'position', 'projectile')) {
    if (p.isEnemyProjectile) continue;
    const hitList = p.projectile!.hitList;
    const cx = Math.floor(p.position.x / CELL);
    const cz = Math.floor(p.position.z / CELL);

    let hitEnemy: any = null;
    outer: for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const cell = _grid.get(key(cx + ox, cz + oz));
        if (!cell) continue;
        for (const e of cell) {
          if (e.id !== undefined && hitList.includes(e.id)) continue;
          const dx = e.position.x - p.position.x;
          const dz = e.position.z - p.position.z;
          const r = (e.size ?? 1) * 0.5 + 0.35;
          if (dx * dx + dz * dz <= r * r) {
            hitEnemy = e;
            break outer;
          }
        }
      }
    }

    if (!hitEnemy) continue;

    // Cosmetic impact: sparks, enemy flash, hit registration — NO hp change.
    spawnImpactFX(p.position, scene, p.weaponId, p.weapon?.bulletColor, 2);
    hitEnemy.hitFlashTimer = 0.1;
    if (hitEnemy.id !== undefined) hitList.push(hitEnemy.id);

    // Local knockback shove: the host's real knockback reaches us filtered
    // through the 30Hz position lerp (reads as mushy drift), so kick the
    // enemy immediately in the bullet's direction. NetSmoothingSystem applies
    // and decays the impulse; the authoritative position reasserts right after.
    const kv = p.velocity;
    if (kv && (kv.x !== 0 || kv.z !== 0)) {
      const kb = p.projectile!.knockback ?? 5;
      const inv = 1 / (Math.hypot(kv.x, kv.z) || 1);
      hitEnemy.fxKickX = (hitEnemy.fxKickX ?? 0) + kv.x * inv * kb;
      hitEnemy.fxKickZ = (hitEnemy.fxKickZ ?? 0) + kv.z * inv * kb;
    }
    if (now - lastImpactSound > IMPACT_SOUND_INTERVAL) {
      lastImpactSound = now;
      playCollect(0.85); // short, dry "tick" — reuses the pickup blip low-pitched
    }

    // Consume the bullet like the real thing so it doesn't pass through
    p.projectile!.pierce -= 1;
    if (p.projectile!.pierce <= 0 || (p.projectile!.explodeRadius ?? 0) > 0) {
      if (p.transform) scene.remove(p.transform);
      world.remove(p);
    }
  }
}

/**
 * Play the XP pickup blip when the host removes an XP gem that was next to the
 * local player (i.e. we just collected it). Called from the host-state sync.
 */
const _collectStreak = { n: 0, last: -Infinity };
/**
 * Play the XP pickup blip when the host removes an XP gem that was next to the
 * local player. Rapid pickups climb in pitch for dopamine feedback.
 */
export function playLocalXpPickup(): void {
  const now = performance.now() / 1000;
  _collectStreak.n = now - _collectStreak.last < 1 ? _collectStreak.n + 1 : 0;
  _collectStreak.last = now;
  playCollect(1 + Math.min(_collectStreak.n, 12) * 0.05);
}

// Death FX for an enemy the host just removed near us (a kill, not a far
// despawn). Explosion sound is throttled so a big clear doesn't blow the mix.
let lastDeathSound = 0;
/**
 * Spawn death VFX for an enemy the host just killed near the local player.
 *
 * @param {THREE.Vector3} pos - world position of the killed enemy
 * @param {number} color - enemy color for the particle burst
 * @param {THREE.Scene} scene - the Three.js scene for death VFX
 */
export function spawnClientDeathFx(pos: THREE.Vector3, color: number, scene: THREE.Scene): void {
  spawnImpactFX(pos, scene, undefined, color, 6);
  const now = performance.now() / 1000;
  if (now - lastDeathSound > 0.08) {
    lastDeathSound = now;
    playExplosion();
  }
}
