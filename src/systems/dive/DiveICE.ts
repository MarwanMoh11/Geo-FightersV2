// --- DIVE ICE ---
// The hostile constructs inside a dive. The arena's EnemySystem, RenderSystem
// and CollisionSystem are all frozen while a dive owns the frame, so ICE need
// their own steering, their own meshes and their own damage model. This module
// owns all three.
//
// Design notes on what changed and why:
//   • HP is derived from the player's own damage, not ENEMY_STATS. The old
//     dive spawned VIRUS at hpMult 0.6 → 2 effective HP against a 24-damage
//     dive shot, so every construct died to a single bullet at every security
//     level, at every point in the run. Anchoring HP to `shots × shotDamage`
//     keeps the fight honest whether the player's Might is 1.0 or 4.0.
//   • Meshes share cached geometry and clone only materials. The old path
//     allocated a fresh BoxGeometry/IcosahedronGeometry plus two materials per
//     construct, on every wave, for the whole dive.
//   • Constructs separate. Without it the whole pack converges to a single
//     point and reads as one enemy with one hitbox.

import * as THREE from 'three';
import { world, type Entity } from '../../core/world';
import { spawnEnemy, EnemyType } from '../../core/factories';
import { THEME } from '../../core/DiveScenes';
import type { BreachKind } from '../BreachSystem';

export const ICE_CONTACT_DAMAGE = 9;
/** Per-construct swing cooldown — one construct can't chain-hit you. */
const ICE_SWING_COOLDOWN = 0.9;
/** Global player i-frames after any hit — a pack can't delete you instantly. */
export const ICE_HIT_IFRAMES = 0.55;
const CONTACT_DIST = 1.35;
const SEPARATION_DIST = 1.5;
const SEPARATION_PUSH = 3.4;
const SPAWN_ANIM = 0.4;
const DEATH_ANIM = 0.2;

/** How many dive shots each construct type should take to kill. */
const SHOTS_TO_KILL: Record<string, number> = {
  [EnemyType.VIRUS]: 2,
  [EnemyType.FIREWALL]: 6,
  [EnemyType.WARDEN]: 4,
};

const BASE_SPEED: Record<string, number> = {
  [EnemyType.VIRUS]: 4.0,
  [EnemyType.FIREWALL]: 2.4,
  [EnemyType.WARDEN]: 5.0,
};

export interface Ice {
  entity: Entity;
  mesh: THREE.Group;
  mats: THREE.Material[];
  type: string;
  speed: number;
  /** Counts down after a swing connects. */
  swingTimer: number;
  /** Counts down after taking damage — drives the hit flash. */
  flashTimer: number;
  /** Counts up from 0 while materialising. */
  spawnTimer: number;
  /** Counts down while dying; the construct is removed at 0. */
  deathTimer: number;
  scale: number;
  seed: number;
  /** Wireframe colour to restore after a hit flash blows it out to white. */
  accent: number;
}

// ---------------------------------------------------------------------------
// Cached geometry — built once, shared by every construct of a type, never
// disposed (a few hundred bytes each).
// ---------------------------------------------------------------------------

let GEO: Record<string, THREE.BufferGeometry> | null = null;
function geo(): Record<string, THREE.BufferGeometry> {
  if (!GEO) {
    GEO = {
      virus: new THREE.IcosahedronGeometry(0.62, 0),
      firewall: new THREE.BoxGeometry(1.35, 1.35, 1.35),
      warden: new THREE.OctahedronGeometry(0.85, 0),
      crown: new THREE.BoxGeometry(0.38, 0.38, 0.38),
    };
  }
  return GEO;
}

function bodyGeoFor(type: string): THREE.BufferGeometry {
  const g = geo();
  if (type === EnemyType.FIREWALL) return g.firewall;
  if (type === EnemyType.WARDEN) return g.warden;
  return g.virus;
}

/**
 * Build the ghost mesh for one construct: a translucent fill plus a bright
 * wireframe shell, tinted to the building's theme.
 */
function buildIceMesh(
  type: string,
  kind: BreachKind,
  scale: number,
): { mesh: THREE.Group; mats: THREE.Material[] } {
  const theme = THEME[kind] ?? THEME.depot;
  const g = geo();
  const body = bodyGeoFor(type);

  const fill = new THREE.MeshBasicMaterial({
    color: theme.gridAccent,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const wire = new THREE.MeshBasicMaterial({
    color: theme.accent,
    wireframe: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });

  const mesh = new THREE.Group();
  mesh.add(new THREE.Mesh(body, fill));
  mesh.add(new THREE.Mesh(body, wire));

  if (type === EnemyType.WARDEN) {
    const crown = new THREE.Mesh(g.crown, wire);
    crown.position.y = 0.95;
    mesh.add(crown);
  }

  mesh.scale.setScalar(scale);
  return { mesh, mats: [fill, wire] };
}

/**
 * Spawn one construct into the dive.
 *
 * @param shotDamage the player's current dive shot damage — HP is derived
 *                   from it so the fight scales with the build, not against it.
 */
export function spawnIce(
  scene: THREE.Scene,
  kind: BreachKind,
  security: number,
  x: number,
  z: number,
  shotDamage: number,
): Ice {
  // FIREWALLs (slow bricks) appear from security 2; WARDENs (fast hunters)
  // from security 3. Below that it's pure VIRUS swarm.
  const roll = Math.random();
  let type: string = EnemyType.VIRUS;
  if (security >= 3 && roll < 0.18) type = EnemyType.WARDEN;
  else if (security >= 2 && roll < 0.32) type = EnemyType.FIREWALL;

  const entity = spawnEnemy(scene, x, z, type as EnemyType, 1, 1);
  entity.isICE = true;

  const hp = Math.max(
    1,
    Math.round((SHOTS_TO_KILL[type] ?? 2) * shotDamage * (1 + security * 0.2)),
  );
  entity.health = { current: hp, max: hp };

  const scale = (type === EnemyType.FIREWALL ? 1.1 : 0.95) + security * 0.06;
  const { mesh, mats } = buildIceMesh(type, kind, scale);
  mesh.position.set(x, 0.6, z);
  mesh.scale.setScalar(0.01);
  scene.add(mesh);

  const speed = (BASE_SPEED[type] ?? 4) + security * 0.35 + Math.random() * 0.4;
  entity.moveSpeed = speed;

  return {
    entity,
    mesh,
    mats,
    type,
    speed,
    swingTimer: 0,
    flashTimer: 0,
    spawnTimer: 0,
    deathTimer: 0,
    scale,
    seed: Math.random() * 10,
    accent: (THEME[kind] ?? THEME.depot).accent,
  };
}

/** Flag a construct as hit: returns true when the hit killed it. */
export function damageIce(ice: Ice, amount: number): boolean {
  if (ice.deathTimer > 0) return false;
  const hp = ice.entity.health;
  if (!hp) return false;
  hp.current -= amount;
  ice.flashTimer = 0.12;
  if (hp.current <= 0) {
    ice.deathTimer = DEATH_ANIM;
    return true;
  }
  return false;
}

export interface IceTickResult {
  /** Total contact damage dealt to the player this frame. */
  damage: number;
  /** Unit push direction of the last connecting hit (for knockback). */
  knockX: number;
  knockZ: number;
}

/**
 * Steer, separate, animate and resolve contact for every live construct.
 * Constructs whose death animation has finished are removed from `list`.
 *
 * @param iframes remaining player invulnerability — contact is ignored while >0
 */
export function tickIce(
  list: Ice[],
  dt: number,
  time: number,
  px: number,
  pz: number,
  arenaR: number,
  iframes: number,
  scene: THREE.Scene,
): IceTickResult {
  const out: IceTickResult = { damage: 0, knockX: 0, knockZ: 0 };

  for (let i = list.length - 1; i >= 0; i--) {
    const ice = list[i];
    const pos = ice.entity.position;
    if (!pos) {
      list.splice(i, 1);
      continue;
    }

    // --- death animation: puff out, then remove ---
    if (ice.deathTimer > 0) {
      ice.deathTimer -= dt;
      const k = 1 - Math.max(0, ice.deathTimer) / DEATH_ANIM;
      ice.mesh.scale.setScalar(ice.scale * (1 + k * 1.6));
      for (const m of ice.mats) (m as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k);
      ice.mesh.rotation.y += dt * 9;
      if (ice.deathTimer <= 0) {
        removeIce(scene, ice);
        list.splice(i, 1);
      }
      continue;
    }

    // --- materialise ---
    if (ice.spawnTimer < SPAWN_ANIM) {
      ice.spawnTimer += dt;
      const k = Math.min(1, ice.spawnTimer / SPAWN_ANIM);
      ice.mesh.scale.setScalar(ice.scale * (0.15 + 0.85 * k));
    }

    ice.swingTimer = Math.max(0, ice.swingTimer - dt);
    ice.flashTimer = Math.max(0, ice.flashTimer - dt);

    // --- steer toward the player ---
    let dx = px - pos.x;
    let dz = pz - pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    let vx = (dx / dist) * ice.speed;
    let vz = (dz / dist) * ice.speed;

    // --- separation: keep the pack a pack, not a single stacked point ---
    for (let j = 0; j < list.length; j++) {
      if (j === i) continue;
      const other = list[j];
      if (other.deathTimer > 0 || !other.entity.position) continue;
      const ox = pos.x - other.entity.position.x;
      const oz = pos.z - other.entity.position.z;
      const d2 = ox * ox + oz * oz;
      if (d2 > SEPARATION_DIST * SEPARATION_DIST || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (1 - d / SEPARATION_DIST) * SEPARATION_PUSH;
      vx += (ox / d) * push;
      vz += (oz / d) * push;
    }

    pos.x += vx * dt;
    pos.z += vz * dt;

    // Constructs stay in the arena — a fleeing player can't kite them into
    // the void where they'd never come back.
    const r = Math.hypot(pos.x, pos.z);
    if (r > arenaR) {
      pos.x = (pos.x / r) * arenaR;
      pos.z = (pos.z / r) * arenaR;
    }

    // --- mesh sync ---
    ice.mesh.position.set(pos.x, 0.6 + Math.sin(time * 3 + ice.seed) * 0.12, pos.z);
    ice.mesh.rotation.y = Math.atan2(dx, dz);
    ice.mesh.rotation.x += dt * 0.8;
    if (ice.flashTimer > 0) {
      // Hit flash: punch the scale and blow out the wireframe.
      const k = ice.flashTimer / 0.12;
      ice.mesh.scale.setScalar(ice.scale * (1 + k * 0.35));
      (ice.mats[1] as THREE.MeshBasicMaterial).color.setHex(0xffffff);
    } else if (ice.spawnTimer >= SPAWN_ANIM) {
      ice.mesh.scale.setScalar(ice.scale);
      (ice.mats[1] as THREE.MeshBasicMaterial).color.setHex(ice.accent);
    }

    // --- contact ---
    dx = px - pos.x;
    dz = pz - pos.z;
    const cd = Math.hypot(dx, dz);
    if (cd < CONTACT_DIST && ice.swingTimer <= 0 && iframes <= 0 && ice.spawnTimer >= SPAWN_ANIM) {
      ice.swingTimer = ICE_SWING_COOLDOWN;
      out.damage += ICE_CONTACT_DAMAGE;
      if (cd > 0.01) {
        out.knockX = dx / cd;
        out.knockZ = dz / cd;
      }
    }
  }

  return out;
}

/** Detach one construct: mesh out of the scene, entity out of the world. */
export function removeIce(scene: THREE.Scene, ice: Ice): void {
  scene.remove(ice.mesh);
  for (const m of ice.mats) m.dispose();
  // Constructs are dive-local illusions: a plain world.remove, never
  // handleEnemyDeath. No XP, no loot, no score bleeding into the arena.
  world.remove(ice.entity);
}

/** Tear down every construct (dive exit / restart). */
export function clearIce(scene: THREE.Scene, list: Ice[]): void {
  for (const ice of list) removeIce(scene, ice);
  list.length = 0;
}

/** Nearest live construct to a point within `range`, or null. */
export function nearestIce(list: Ice[], x: number, z: number, range: number): Ice | null {
  let best: Ice | null = null;
  let bestSq = range * range;
  for (const ice of list) {
    if (ice.deathTimer > 0 || !ice.entity.position) continue;
    const dx = ice.entity.position.x - x;
    const dz = ice.entity.position.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestSq) {
      bestSq = d2;
      best = ice;
    }
  }
  return best;
}

/** Live constructs within `r` of a point — drives contested-objective logic. */
export function countIceNear(list: Ice[], x: number, z: number, r: number): number {
  let n = 0;
  const r2 = r * r;
  for (const ice of list) {
    if (ice.deathTimer > 0 || !ice.entity.position) continue;
    const dx = ice.entity.position.x - x;
    const dz = ice.entity.position.z - z;
    if (dx * dx + dz * dz <= r2) n++;
  }
  return n;
}

/** Live (non-dying) construct count. */
export function liveIceCount(list: Ice[]): number {
  let n = 0;
  for (const ice of list) if (ice.deathTimer <= 0) n++;
  return n;
}
