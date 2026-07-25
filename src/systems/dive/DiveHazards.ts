// --- DIVE HAZARDS ---
// Static threats that make the dive a place rather than an empty disc with
// enemies walking across it. The horde supplies pressure; hazards supply
// GEOMETRY — reasons to take one route and not another.
//
// Two kinds, each answering a different weakness:
//
//   TURRET   — objectives were undefended, so "walk to the marker" was the
//              whole verb. Turrets sit on objective points, telegraph, and
//              shell you while you stand there. Destructible, so clearing one
//              is a real tactical option with a real time cost.
//
//   POOL     — static damage-over-time discs. Cheap route shaping: they make
//              some ground expensive without hard-blocking it.
//
// Everything here is dive-local: plain meshes and structs, no world entities,
// torn down wholesale on dive exit.

import * as THREE from 'three';

const TURRET_RANGE = 19;
const TURRET_CHARGE = 1.3;
const TURRET_COOLDOWN = 1.5;
const TURRET_SHOT_SPEED = 15;
const TURRET_SHOT_DAMAGE = 11;
const TURRET_SHOT_LIFE = 3.2;
const TURRET_SHOT_HIT = 0.95;
const TURRET_SHOTS_TO_KILL = 9;

const POOL_DPS = 9;

export interface Turret {
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  charge: number;
  cooldown: number;
  dead: boolean;
  deathTimer: number;
  group: THREE.Group;
  head: THREE.Object3D;
  ring: THREE.Mesh;
  mats: THREE.Material[];
}

export interface Pool {
  x: number;
  z: number;
  radius: number;
  mesh: THREE.Mesh;
  mats: THREE.Material[];
}

interface Shot {
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  mesh: THREE.Mesh;
}

export interface Hazards {
  turrets: Turret[];
  pools: Pool[];
  shots: Shot[];
  shotGeo: THREE.SphereGeometry;
  shotMat: THREE.MeshBasicMaterial;
}

export function createHazards(): Hazards {
  return {
    turrets: [],
    pools: [],
    shots: [],
    shotGeo: new THREE.SphereGeometry(0.34, 8, 8),
    shotMat: new THREE.MeshBasicMaterial({
      color: 0xff3d55,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  };
}

function glow(color: number, opacity: number, side: THREE.Side = THREE.FrontSide) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Place a destructible turret. `shotDamage` sets its HP budget. */
export function addTurret(
  scene: THREE.Scene,
  h: Hazards,
  x: number,
  z: number,
  shotDamage: number,
): Turret {
  const mats: THREE.Material[] = [];
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const baseMat = glow(0xff5a6e, 0.5);
  const headMat = glow(0xff8fa3, 0.9);
  const ringMat = glow(0xffffff, 0.0, THREE.DoubleSide);
  mats.push(baseMat, headMat, ringMat);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.15, 0.9, 8), baseMat);
  base.position.y = 0.45;
  group.add(base);

  const head = new THREE.Group();
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), headMat);
  body.position.y = 1.5;
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 1.5), headMat);
  barrel.position.set(0, 1.5, 0.85);
  head.add(body, barrel);
  group.add(head);

  // Charge telegraph: a ground ring that fades in as the shot spools up.
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.7, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  ring.renderOrder = 6;
  group.add(ring);

  scene.add(group);

  const hp = Math.max(1, Math.round(TURRET_SHOTS_TO_KILL * shotDamage));
  const turret: Turret = {
    x,
    z,
    hp,
    maxHp: hp,
    charge: 0,
    cooldown: Math.random() * TURRET_COOLDOWN,
    dead: false,
    deathTimer: 0,
    group,
    head,
    ring,
    mats,
  };
  h.turrets.push(turret);
  return turret;
}

/** Place a static damage-over-time pool. */
export function addPool(
  scene: THREE.Scene,
  h: Hazards,
  x: number,
  z: number,
  radius: number,
): Pool {
  const mats: THREE.Material[] = [];
  const mat = glow(0xff3d55, 0.2, THREE.DoubleSide);
  const edge = glow(0xff8fa3, 0.5, THREE.DoubleSide);
  mats.push(mat, edge);

  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.04, z);
  mesh.renderOrder = 4;

  const rim = new THREE.Mesh(new THREE.RingGeometry(radius - 0.18, radius, 32), edge);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.01;
  rim.renderOrder = 5;
  mesh.add(rim);

  scene.add(mesh);
  const pool: Pool = { x, z, radius, mesh, mats };
  h.pools.push(pool);
  return pool;
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

export interface HazardResult {
  impact: number;
  dot: number;
}


/**
 * Advance every hazard and resolve the player against them.
 */
export function tickHazards(
  h: Hazards,
  scene: THREE.Scene,
  dt: number,
  time: number,
  px: number,
  pz: number,
  iframes: number,
): HazardResult {
  const out: HazardResult = { impact: 0, dot: 0 };

  // --- turrets ---
  for (let i = h.turrets.length - 1; i >= 0; i--) {
    const t = h.turrets[i];
    if (t.dead) {
      t.deathTimer -= dt;
      const k = Math.max(0, t.deathTimer / 0.3);
      t.group.scale.setScalar(0.2 + k * 0.9);
      for (const m of t.mats) (m as THREE.MeshBasicMaterial).opacity *= 0.88;
      if (t.deathTimer <= 0) {
        scene.remove(t.group);
        disposeGroup(t.group, t.mats);
        h.turrets.splice(i, 1);
      }
      continue;
    }

    const dx = px - t.x;
    const dz = pz - t.z;
    const d = Math.hypot(dx, dz);
    t.head.rotation.y = Math.atan2(dx, dz);

    const ringMat = t.ring.material as THREE.MeshBasicMaterial;
    if (d <= TURRET_RANGE) {
      t.cooldown = Math.max(0, t.cooldown - dt);
      if (t.cooldown <= 0) {
        t.charge += dt;
        // Telegraph: the ring brightens and tightens over the charge.
        ringMat.opacity = 0.25 + 0.7 * (t.charge / TURRET_CHARGE);
        t.ring.scale.setScalar(1.6 - 0.6 * (t.charge / TURRET_CHARGE));
        if (t.charge >= TURRET_CHARGE) {
          t.charge = 0;
          t.cooldown = TURRET_COOLDOWN;
          ringMat.opacity = 0;
          fireShot(h, scene, t.x, t.z, dx / (d || 1), dz / (d || 1));
        }
      }
    } else {
      t.charge = 0;
      ringMat.opacity = 0;
    }
    t.group.position.y = Math.sin(time * 2 + t.x) * 0.05;
  }

  // --- turret shots ---
  for (let i = h.shots.length - 1; i >= 0; i--) {
    const s = h.shots[i];
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.life -= dt;
    s.mesh.position.set(s.x, 0.65, s.z);

    const dx = px - s.x;
    const dz = pz - s.z;
    let consumed = s.life <= 0;
    if (!consumed && dx * dx + dz * dz <= TURRET_SHOT_HIT * TURRET_SHOT_HIT) {
      if (iframes <= 0) out.impact += TURRET_SHOT_DAMAGE;
      consumed = true;
    }
    if (consumed) {
      scene.remove(s.mesh);
      h.shots.splice(i, 1);
    }
  }

  // --- pools ---
  for (const p of h.pools) {
    const dx = px - p.x;
    const dz = pz - p.z;
    if (dx * dx + dz * dz <= p.radius * p.radius) {
      // Continuous chip damage, deliberately outside the i-frame window: a
      // pool is terrain you chose to stand in, not a hit you failed to dodge.
      out.dot += POOL_DPS * dt;
    }
    const m = p.mesh.material as THREE.MeshBasicMaterial;
    m.opacity = 0.14 + 0.1 * Math.sin(time * 2.4 + p.x);
  }

  return out;
}

function fireShot(
  h: Hazards,
  scene: THREE.Scene,
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
): void {
  const mesh = new THREE.Mesh(h.shotGeo, h.shotMat);
  mesh.position.set(x, 0.65, z);
  scene.add(mesh);
  h.shots.push({
    x,
    z,
    vx: dirX * TURRET_SHOT_SPEED,
    vz: dirZ * TURRET_SHOT_SPEED,
    life: TURRET_SHOT_LIFE,
    mesh,
  });
}

/** Apply player damage to any turret within `radius` of a point. */
export function damageTurretsAt(
  h: Hazards,
  x: number,
  z: number,
  radius: number,
  amount: number,
): { hit: boolean; killed: boolean } {
  const r2 = radius * radius;
  for (const t of h.turrets) {
    if (t.dead) continue;
    const dx = t.x - x;
    const dz = t.z - z;
    if (dx * dx + dz * dz > r2) continue;
    t.hp -= amount;
    if (t.hp <= 0) {
      t.dead = true;
      t.deathTimer = 0.3;
      return { hit: true, killed: true };
    }
    return { hit: true, killed: false };
  }
  return { hit: false, killed: false };
}

/** Live (undestroyed) turret count. */
export function liveTurretCount(h: Hazards): number {
  let n = 0;
  for (const t of h.turrets) if (!t.dead) n++;
  return n;
}

function disposeGroup(group: THREE.Object3D, mats: THREE.Material[]): void {
  group.traverse((child) => {
    const m = child as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
  for (const m of mats) m.dispose();
}

/** Tear down every hazard. */
export function disposeHazards(scene: THREE.Scene, h: Hazards): void {
  for (const t of h.turrets) {
    scene.remove(t.group);
    disposeGroup(t.group, t.mats);
  }
  for (const p of h.pools) {
    scene.remove(p.mesh);
    disposeGroup(p.mesh, p.mats);
  }
  for (const s of h.shots) scene.remove(s.mesh);
  h.turrets = [];
  h.pools = [];
  h.shots = [];
  h.shotGeo.dispose();
  h.shotMat.dispose();
}
