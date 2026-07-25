// --- DIVE ICE ---
// The hostile constructs inside a dive. The arena's EnemySystem, RenderSystem
// and CollisionSystem are all frozen while a dive owns the frame, so ICE need
// their own steering, their own rendering and their own damage model.
//
// HORDE FIRST. This used to spawn 2-4 constructs per 5.5s wave against a cap
// of 26, while the player killed ~2/second — the spawn rate could never
// out-pace the gun, so the "dive" was a stroll through a handful of enemies
// and the game's whole horde fantasy evaporated on entry. Constructs are now
// rendered through InstancedMesh (the same trick RenderSystem uses for the
// arena horde) so the cap can sit in the low hundreds, and pressure is a
// continuous ramping spawn RATE rather than discrete waves. The player kills
// fast but always slightly slower than the grid spawns: the room fills up over
// the dive, which is exactly the clock the objective is racing.
//
// Other design notes:
//   • HP derives from the player's own shot damage, not ENEMY_STATS. Spawning
//     VIRUS at hpMult 0.6 gave them 2 effective HP against a 24-damage shot —
//     one-shot at every security level, at every point in the run.
//   • Separation runs off a uniform spatial grid, per the hot-loop rule in
//     AGENTS.md. Without separation the pack converges to a single point and
//     reads as one enemy with one hitbox.

import * as THREE from 'three';
import { world, type Entity } from '../../core/world';
import { spawnEnemy, EnemyType } from '../../core/factories';
import { THEME } from '../../core/DiveScenes';
import type { BreachKind } from '../BreachSystem';

/** Hard ceiling on live constructs. Instanced rendering makes this cheap. */
export const MAX_DIVE_ICE = 190;

export const ICE_CONTACT_DAMAGE = 7;
/** Per-construct swing cooldown — one construct can't chain-hit you. */
const ICE_SWING_COOLDOWN = 0.9;
/** Global player i-frames after any hit — a pack can't delete you instantly. */
export const ICE_HIT_IFRAMES = 0.6;
const CONTACT_DIST = 1.3;
const SEPARATION_DIST = 1.45;
const SEPARATION_PUSH = 3.6;
const SPAWN_ANIM = 0.35;
const DEATH_ANIM = 0.18;

/** How many dive shots each construct type should take to kill. */
const SHOTS_TO_KILL: Record<string, number> = {
  [EnemyType.VIRUS]: 2,
  [EnemyType.FIREWALL]: 7,
  [EnemyType.WARDEN]: 4,
};

const BASE_SPEED: Record<string, number> = {
  [EnemyType.VIRUS]: 4.2,
  [EnemyType.FIREWALL]: 2.4,
  [EnemyType.WARDEN]: 5.2,
};

const TYPES = [EnemyType.VIRUS, EnemyType.FIREWALL, EnemyType.WARDEN] as const;

export interface Ice {
  entity: Entity;
  type: string;
  speed: number;
  /** Counts down after a swing connects. */
  swingTimer: number;
  /** Counts down after taking damage — drives the hit flash. */
  flashTimer: number;
  /** Counts up from 0 while materialising. */
  spawnTimer: number;
  /** Counts down while dying; the construct is dropped at 0. */
  deathTimer: number;
  scale: number;
  seed: number;
  /** Facing, written by the steering pass and read by the render pass. */
  rot: number;
  tumble: number;
}

// ---------------------------------------------------------------------------
// Instanced renderer
// ---------------------------------------------------------------------------

let GEO: Record<string, THREE.BufferGeometry> | null = null;
function geo(): Record<string, THREE.BufferGeometry> {
  if (!GEO) {
    GEO = {
      [EnemyType.VIRUS]: new THREE.IcosahedronGeometry(0.62, 0),
      [EnemyType.FIREWALL]: new THREE.BoxGeometry(1.35, 1.35, 1.35),
      [EnemyType.WARDEN]: new THREE.OctahedronGeometry(0.85, 0),
    };
  }
  return GEO;
}

/**
 * Two InstancedMeshes per construct type (solid fill + wireframe shell). Six
 * draw calls covers the entire horde regardless of size.
 */
export interface IceRenderer {
  solid: Map<string, THREE.InstancedMesh>;
  wire: Map<string, THREE.InstancedMesh>;
  mats: THREE.Material[];
}

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();
const _euler = new THREE.Euler();
const _mat = new THREE.Matrix4();
const _col = new THREE.Color();
const _white = new THREE.Color(0xffffff);

/** Build the horde's instanced meshes into the dive scene. */
export function createIceRenderer(scene: THREE.Scene, kind: BreachKind): IceRenderer {
  const theme = THEME[kind] ?? THEME.depot;
  const g = geo();
  const solid = new Map<string, THREE.InstancedMesh>();
  const wire = new Map<string, THREE.InstancedMesh>();
  const mats: THREE.Material[] = [];

  for (const type of TYPES) {
    const fillMat = new THREE.MeshBasicMaterial({
      color: theme.gridAccent,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const wireMat = new THREE.MeshBasicMaterial({
      color: theme.accent,
      wireframe: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    mats.push(fillMat, wireMat);

    const s = new THREE.InstancedMesh(g[type], fillMat, MAX_DIVE_ICE);
    const w = new THREE.InstancedMesh(g[type], wireMat, MAX_DIVE_ICE);
    for (const m of [s, w]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Instance positions live in the matrices, so the mesh's own bounding
      // sphere is meaningless — culling it would blink the whole horde out.
      m.frustumCulled = false;
      m.count = 0;
      for (let j = 0; j < MAX_DIVE_ICE; j++) m.setColorAt(j, _white);
      scene.add(m);
    }
    solid.set(type, s);
    wire.set(type, w);
  }

  return { solid, wire, mats };
}

/** Push the current horde state into the instance buffers. */
export function renderIce(r: IceRenderer, list: Ice[], time: number): void {
  const counts: Record<string, number> = {};
  for (const type of TYPES) counts[type] = 0;

  for (const ice of list) {
    const pos = ice.entity.position;
    if (!pos) continue;
    const idx = counts[ice.type];
    if (idx >= MAX_DIVE_ICE) continue;

    let scale = ice.scale;
    let flashing = false;
    if (ice.deathTimer > 0) {
      // Puff out as it dies.
      const k = 1 - ice.deathTimer / DEATH_ANIM;
      scale *= 1 + k * 1.5;
      flashing = true;
    } else if (ice.spawnTimer < SPAWN_ANIM) {
      scale *= 0.15 + 0.85 * (ice.spawnTimer / SPAWN_ANIM);
    } else if (ice.flashTimer > 0) {
      scale *= 1 + 0.3 * (ice.flashTimer / 0.12);
      flashing = true;
    }

    _pos.set(pos.x, 0.6 + Math.sin(time * 3 + ice.seed) * 0.12, pos.z);
    _euler.set(ice.tumble, ice.rot, 0);
    _quat.setFromEuler(_euler);
    _scl.setScalar(scale);
    _mat.compose(_pos, _quat, _scl);

    _col.setHex(flashing ? 0xffffff : 0xbbbbbb);

    const s = r.solid.get(ice.type);
    const w = r.wire.get(ice.type);
    if (s) {
      s.setMatrixAt(idx, _mat);
      s.setColorAt(idx, _col);
    }
    if (w) {
      w.setMatrixAt(idx, _mat);
      w.setColorAt(idx, _col);
    }
    counts[ice.type] = idx + 1;
  }

  for (const type of TYPES) {
    for (const m of [r.solid.get(type), r.wire.get(type)]) {
      if (!m) continue;
      m.count = counts[type];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}

/** Tear down the instanced meshes. Shared geometry is kept for the next dive. */
export function disposeIceRenderer(scene: THREE.Scene, r: IceRenderer): void {
  for (const type of TYPES) {
    for (const m of [r.solid.get(type), r.wire.get(type)]) {
      if (!m) continue;
      scene.remove(m);
      m.dispose();
    }
  }
  for (const m of r.mats) m.dispose();
  r.solid.clear();
  r.wire.clear();
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

/**
 * Spawn one construct into the dive.
 *
 * @param shotDamage the player's current dive shot damage — HP derives from it
 *                   so the fight scales with the build, not against it.
 */
export function spawnIce(
  scene: THREE.Scene,
  kind: BreachKind,
  security: number,
  x: number,
  z: number,
  shotDamage: number,
): Ice {
  void kind;
  // FIREWALLs (slow bricks that body-block) from security 1; WARDENs (fast
  // hunters that punish standing still) from security 2. The mix matters more
  // now that the horde is large: a pure VIRUS swarm is one texture of threat.
  const roll = Math.random();
  let type: string = EnemyType.VIRUS;
  if (security >= 2 && roll < 0.14) type = EnemyType.WARDEN;
  else if (security >= 1 && roll < 0.28) type = EnemyType.FIREWALL;

  const entity = spawnEnemy(scene, x, z, type as EnemyType, 1, 1);
  entity.isICE = true;

  const hp = Math.max(
    1,
    Math.round((SHOTS_TO_KILL[type] ?? 2) * shotDamage * (1 + security * 0.15)),
  );
  entity.health = { current: hp, max: hp };

  const scale = (type === EnemyType.FIREWALL ? 1.1 : 0.95) + security * 0.05;
  const speed = (BASE_SPEED[type] ?? 4) + security * 0.3 + Math.random() * 0.5;
  entity.moveSpeed = speed;

  return {
    entity,
    type,
    speed,
    swingTimer: 0,
    flashTimer: 0,
    spawnTimer: 0,
    deathTimer: 0,
    scale,
    seed: Math.random() * 10,
    rot: 0,
    tumble: Math.random() * 3,
  };
}

/** Apply damage. Returns true when the hit killed the construct. */
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

// ---------------------------------------------------------------------------
// Steering — uniform spatial grid so separation stays linear in the horde size
// ---------------------------------------------------------------------------

const CELL = 2.0;
const GRID_DIM = 48; // covers a 96-unit span, comfortably past the arena rim
const GRID_CELLS = GRID_DIM * GRID_DIM;
const gridHead = new Int32Array(GRID_CELLS);
const gridNext = new Int32Array(MAX_DIVE_ICE);

function cellIndex(x: number, z: number): number {
  const cx = Math.min(GRID_DIM - 1, Math.max(0, ((x / CELL) | 0) + GRID_DIM / 2));
  const cz = Math.min(GRID_DIM - 1, Math.max(0, ((z / CELL) | 0) + GRID_DIM / 2));
  return cz * GRID_DIM + cx;
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
 * Constructs whose death animation has finished are dropped from `list`.
 *
 * @param iframes remaining player invulnerability — contact is ignored while >0
 */
export function tickIce(
  list: Ice[],
  dt: number,
  px: number,
  pz: number,
  arenaR: number,
  iframes: number,
): IceTickResult {
  const out: IceTickResult = { damage: 0, knockX: 0, knockZ: 0 };

  // --- rebuild the separation grid (head/next linked lists, no allocation) ---
  gridHead.fill(-1);
  for (let i = 0; i < list.length && i < MAX_DIVE_ICE; i++) {
    const pos = list[i].entity.position;
    if (!pos || list[i].deathTimer > 0) {
      gridNext[i] = -1;
      continue;
    }
    const c = cellIndex(pos.x, pos.z);
    gridNext[i] = gridHead[c];
    gridHead[c] = i;
  }

  for (let i = list.length - 1; i >= 0; i--) {
    const ice = list[i];
    const pos = ice.entity.position;
    if (!pos) {
      list.splice(i, 1);
      continue;
    }

    if (ice.deathTimer > 0) {
      ice.deathTimer -= dt;
      ice.tumble += dt * 9;
      if (ice.deathTimer <= 0) {
        // Constructs are dive-local illusions: a plain world.remove, never
        // handleEnemyDeath. No XP, no loot, no score bleeding into the arena.
        world.remove(ice.entity);
        list.splice(i, 1);
      }
      continue;
    }

    if (ice.spawnTimer < SPAWN_ANIM) ice.spawnTimer += dt;
    ice.swingTimer = Math.max(0, ice.swingTimer - dt);
    ice.flashTimer = Math.max(0, ice.flashTimer - dt);
    ice.tumble += dt * 0.8;

    // --- steer toward the player ---
    let dx = px - pos.x;
    let dz = pz - pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    let vx = (dx / dist) * ice.speed;
    let vz = (dz / dist) * ice.speed;
    ice.rot = Math.atan2(dx, dz);

    // --- separation against the 3x3 neighbourhood only ---
    if (i < MAX_DIVE_ICE) {
      const baseCx = ((pos.x / CELL) | 0) + GRID_DIM / 2;
      const baseCz = ((pos.z / CELL) | 0) + GRID_DIM / 2;
      for (let oz = -1; oz <= 1; oz++) {
        const cz = baseCz + oz;
        if (cz < 0 || cz >= GRID_DIM) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const cx = baseCx + ox;
          if (cx < 0 || cx >= GRID_DIM) continue;
          for (let j = gridHead[cz * GRID_DIM + cx]; j !== -1; j = gridNext[j]) {
            if (j === i) continue;
            const op = list[j]?.entity.position;
            if (!op) continue;
            const sx = pos.x - op.x;
            const sz = pos.z - op.z;
            const d2 = sx * sx + sz * sz;
            if (d2 > SEPARATION_DIST * SEPARATION_DIST || d2 < 1e-6) continue;
            const d = Math.sqrt(d2);
            const push = (1 - d / SEPARATION_DIST) * SEPARATION_PUSH;
            vx += (sx / d) * push;
            vz += (sz / d) * push;
          }
        }
      }
    }

    pos.x += vx * dt;
    pos.z += vz * dt;

    // Constructs stay in the arena — a kiting player can't park them in the
    // void where they'd never come back.
    const r = Math.hypot(pos.x, pos.z);
    if (r > arenaR) {
      pos.x = (pos.x / r) * arenaR;
      pos.z = (pos.z / r) * arenaR;
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

/** Tear down every construct (dive exit / restart). */
export function clearIce(list: Ice[]): void {
  for (const ice of list) world.remove(ice.entity);
  list.length = 0;
}

/**
 * Nearest live construct to a point within `range`, or null. Linear over the
 * horde, called once per shot (not per frame), so the grid isn't worth it.
 */
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
