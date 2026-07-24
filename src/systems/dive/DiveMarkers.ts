// --- DIVE MARKERS ---
// Every dive objective point is a marker: a ground ring, a fill disc that
// doubles as a channel meter, and a tall beacon column so the point is
// readable from across the arena (and still legible when its base is just
// off the bottom of the camera frustum).
//
// Markers deliberately do NOT go into the dive scene's tracked `meshes`
// array. `disposeDiveScene` disposes geometry per-object, and markers share
// module-level unit geometry across every dive — letting the scene disposer
// reach it would free the cache and break the next dive. Markers own their
// teardown via `disposeMarkers` instead: shared geometry is never disposed,
// per-marker cloned materials always are.
//
// All marker geometry is UNIT sized and scaled by `radius` at build time, so
// one cached geometry serves every marker of a shape.

import * as THREE from 'three';

export type MarkerShape = 'pad' | 'crate' | 'exit' | 'altar' | 'zone';
export type MarkerState = 'idle' | 'active' | 'done' | 'contested';

export interface DiveMarker {
  x: number;
  z: number;
  /** Interaction radius in world units — also the visual footprint. */
  radius: number;
  shape: MarkerShape;
  state: MarkerState;
  /** 0..1 channel/hold fill. Drives the inner disc scale. */
  fill: number;
  /** Consumed markers stop rendering and drop off the radar. */
  collected: boolean;
  /** Hidden markers exist but are not shown yet (e.g. a locked exit pad). */
  hidden: boolean;
  /** Short label surfaced on the radar / arrows. */
  label: string;
  group: THREE.Group;

  // --- internals ---
  ring: THREE.Mesh;
  disc: THREE.Mesh;
  beacon: THREE.Mesh | null;
  body: THREE.Object3D | null;
  mats: THREE.Material[];
  popTimer: number;
  seed: number;
}

// ---------------------------------------------------------------------------
// Shared unit geometry — built once, reused by every marker in every dive,
// never disposed. Total footprint is a few KB.
// ---------------------------------------------------------------------------

let GEO: {
  ring: THREE.RingGeometry;
  ringThin: THREE.RingGeometry;
  disc: THREE.CircleGeometry;
  beacon: THREE.CylinderGeometry;
  crate: THREE.BoxGeometry;
  chevron: THREE.ConeGeometry;
  torus: THREE.TorusGeometry;
} | null = null;

function geo() {
  if (!GEO) {
    GEO = {
      ring: new THREE.RingGeometry(0.84, 1, 44),
      ringThin: new THREE.RingGeometry(0.95, 1, 44),
      disc: new THREE.CircleGeometry(0.8, 36),
      // Open-ended cylinder: a light shaft, not a solid pillar.
      beacon: new THREE.CylinderGeometry(0.16, 0.34, 1, 12, 1, true),
      crate: new THREE.BoxGeometry(1, 1, 1),
      chevron: new THREE.ConeGeometry(0.34, 0.7, 4),
      torus: new THREE.TorusGeometry(1, 0.06, 6, 30),
    };
  }
  return GEO;
}

const BEACON_HEIGHT = 11;

/** Additive, depth-write-off material — the standard dive marker look. */
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

export interface MarkerOptions {
  x: number;
  z: number;
  radius: number;
  shape: MarkerShape;
  color: number;
  label?: string;
  hidden?: boolean;
  /** Beacons are on by default; pass false for dense clusters (supply crates). */
  beacon?: boolean;
}

/**
 * Build a marker and add it to the dive scene. The caller owns the returned
 * struct and must pass it to `disposeMarkers` on dive teardown.
 */
export function createMarker(scene: THREE.Scene, opt: MarkerOptions): DiveMarker {
  const g = geo();
  const r = opt.radius;
  const mats: THREE.Material[] = [];
  const group = new THREE.Group();
  group.position.set(opt.x, 0, opt.z);

  const ringMat = glow(opt.color, 0.85, THREE.DoubleSide);
  mats.push(ringMat);
  const ring = new THREE.Mesh(g.ring, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.scale.set(r, r, 1);
  ring.position.y = 0.04;
  // Ground decals z-fight the floor on mobile depth buffers — force draw order.
  ring.renderOrder = 5;
  group.add(ring);

  const discMat = glow(opt.color, 0.3, THREE.DoubleSide);
  mats.push(discMat);
  const disc = new THREE.Mesh(g.disc, discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  disc.scale.set(0.001, 0.001, 1);
  disc.renderOrder = 6;
  group.add(disc);

  let beacon: THREE.Mesh | null = null;
  if (opt.beacon !== false) {
    const bMat = glow(opt.color, 0.22, THREE.DoubleSide);
    mats.push(bMat);
    beacon = new THREE.Mesh(g.beacon, bMat);
    beacon.scale.set(r * 0.9, BEACON_HEIGHT, r * 0.9);
    beacon.position.y = BEACON_HEIGHT / 2;
    group.add(beacon);
  }

  let body: THREE.Object3D | null = null;
  switch (opt.shape) {
    case 'crate': {
      const solid = glow(opt.color, 0.5);
      const wire = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      mats.push(solid, wire);
      const b = new THREE.Group();
      const s = r * 1.05;
      const m1 = new THREE.Mesh(g.crate, solid);
      m1.scale.setScalar(s);
      const m2 = new THREE.Mesh(g.crate, wire);
      m2.scale.setScalar(s);
      b.add(m1, m2);
      b.position.y = s * 0.65;
      body = b;
      group.add(b);
      break;
    }
    case 'exit': {
      const cMat = glow(opt.color, 0.9);
      mats.push(cMat);
      const b = new THREE.Group();
      // Three chevrons pointing down into the pad — reads as "stand here".
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(g.chevron, cMat);
        c.rotation.x = Math.PI;
        c.position.y = 1.6 + i * 1.15;
        c.scale.setScalar(r * 0.55);
        b.add(c);
      }
      body = b;
      group.add(b);
      break;
    }
    case 'altar': {
      const tMat = glow(opt.color, 0.8);
      mats.push(tMat);
      const b = new THREE.Group();
      for (let i = 0; i < 2; i++) {
        const t = new THREE.Mesh(g.torus, tMat);
        t.rotation.x = Math.PI / 2;
        t.scale.set(r * (0.8 + i * 0.2), r * (0.8 + i * 0.2), 1);
        t.position.y = 1.5 + i * 1.1;
        b.add(t);
      }
      body = b;
      group.add(b);
      break;
    }
    case 'zone': {
      // A hold-the-point zone: a second inner ring that counter-rotates.
      const tMat = glow(opt.color, 0.6, THREE.DoubleSide);
      mats.push(tMat);
      const inner = new THREE.Mesh(g.ringThin, tMat);
      inner.rotation.x = -Math.PI / 2;
      inner.scale.set(r * 0.62, r * 0.62, 1);
      inner.position.y = 0.06;
      inner.renderOrder = 6;
      body = inner;
      group.add(inner);
      break;
    }
    case 'pad':
      break;
  }

  scene.add(group);
  group.visible = !opt.hidden;

  return {
    x: opt.x,
    z: opt.z,
    radius: r,
    shape: opt.shape,
    state: 'idle',
    fill: 0,
    collected: false,
    hidden: !!opt.hidden,
    label: opt.label ?? '',
    group,
    ring,
    disc,
    beacon,
    body,
    mats,
    popTimer: 0,
    seed: Math.random() * 10,
  };
}

// State colors. `idle` keeps the marker's own accent (set at build time), so
// only the non-idle states need an override.
const STATE_COLOR: Partial<Record<MarkerState, number>> = {
  active: 0xffffff,
  done: 0x3dff9a,
  contested: 0xff3d55,
};

/**
 * Advance a marker's animation. Call once per dive frame for every live
 * marker — pulse, channel fill, state tint, and the collect pop.
 */
export function updateMarker(m: DiveMarker, dt: number, time: number): void {
  if (m.popTimer > 0) {
    m.popTimer -= dt;
    const k = 1 - Math.max(0, m.popTimer) / MARKER_POP_TIME;
    const s = 1 + k * 1.4;
    m.group.scale.setScalar(s);
    for (const mat of m.mats) mat.opacity = Math.max(0, (1 - k) * 0.9);
    if (m.popTimer <= 0) {
      m.group.visible = false;
      m.collected = true;
    }
    return;
  }
  if (m.collected || m.hidden) return;

  const pulse = 0.5 + 0.5 * Math.sin(time * 3.2 + m.seed);
  const tint = STATE_COLOR[m.state];

  m.ring.rotation.z += dt * (m.state === 'active' ? 1.6 : 0.5);
  (m.ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + pulse * 0.4;
  if (tint !== undefined) (m.ring.material as THREE.MeshBasicMaterial).color.setHex(tint);

  // The disc is the channel meter: it grows from the centre as `fill` climbs.
  const f = Math.max(0.001, m.fill);
  m.disc.scale.set(f * m.radius, f * m.radius, 1);
  (m.disc.material as THREE.MeshBasicMaterial).opacity = m.fill > 0 ? 0.55 : 0.16;
  if (tint !== undefined) (m.disc.material as THREE.MeshBasicMaterial).color.setHex(tint);

  if (m.beacon) {
    const bm = m.beacon.material as THREE.MeshBasicMaterial;
    bm.opacity = m.state === 'done' ? 0.08 : 0.14 + pulse * 0.16;
    if (tint !== undefined) bm.color.setHex(tint);
  }

  if (m.body) {
    switch (m.shape) {
      case 'crate':
        m.body.rotation.y += dt * 1.1;
        m.body.position.y = m.radius * 0.65 + Math.sin(time * 2 + m.seed) * 0.16;
        break;
      case 'exit':
        m.body.position.y = Math.sin(time * 3 + m.seed) * 0.3;
        m.body.rotation.y += dt * 0.8;
        break;
      case 'altar':
        m.body.rotation.y += dt * 0.9;
        m.body.position.y = Math.sin(time * 1.6) * 0.2;
        break;
      case 'zone':
        m.body.rotation.z -= dt * 1.1;
        break;
      case 'pad':
        break;
    }
  }
}

export const MARKER_POP_TIME = 0.28;

/** Consume a marker: plays the pop, then hides it. */
export function popMarker(m: DiveMarker): void {
  if (m.collected || m.popTimer > 0) return;
  m.popTimer = MARKER_POP_TIME;
}

/** Reveal a marker that was built hidden (e.g. the exit pad opening). */
export function revealMarker(m: DiveMarker): void {
  if (!m.hidden) return;
  m.hidden = false;
  m.group.visible = true;
}

/** Squared planar distance from a point to a marker. */
export function markerDistSq(m: DiveMarker, x: number, z: number): number {
  const dx = x - m.x;
  const dz = z - m.z;
  return dx * dx + dz * dz;
}

/** True when (x,z) is inside the marker's interaction radius. */
export function insideMarker(m: DiveMarker, x: number, z: number): boolean {
  return markerDistSq(m, x, z) <= m.radius * m.radius;
}

/**
 * Tear down markers: detach from the scene and dispose the per-marker cloned
 * materials. Shared unit geometry is intentionally left alive for reuse.
 */
export function disposeMarkers(scene: THREE.Scene, markers: DiveMarker[]): void {
  for (const m of markers) {
    scene.remove(m.group);
    for (const mat of m.mats) mat.dispose();
  }
  markers.length = 0;
}
