// --- DIVE SCENES ---
// One builder per BreachKind. The dive sub-scene is swapped in by main.ts
// while `uiState.dive` is non-null; the arena systems are frozen, so every
// visual the player sees inside a dive is spawned here.
//
// LAYOUT CONTRACT — every builder must honour this or objectives break:
//   • ARENA_R (22) is the hard movement bound. Every scene draws a visible
//     rim at exactly that radius: the old scenes had an 80-unit grid and a
//     40-unit floor around a 34-unit invisible wall, so the player slid to a
//     stop in the middle of open ground with no idea why.
//   • The CENTRE DISC (r < 4) must stay walkable. Three verbs put a
//     hold-the-point objective at the origin; the old bank and stash den both
//     parked a solid landmark there and the player stood inside it.
//   • The OBJECTIVE RING (r 6..15) must stay clear of tall geometry. Verb
//     markers are placed across that band, and a landmark sitting on one
//     hides it.
//   • Landmarks therefore live at r >= 17, or float above y = 4.
//
// Build/teardown mirrors LevelSystem.initLevel/disposeLevel: every created
// Object3D is tracked and disposed per-mesh on teardown.

import * as THREE from 'three';
import type { BreachKind } from '../systems/BreachSystem';

/** Hard movement bound. Must match DIVE_ARENA_R in dive/DiveVerbs.ts. */
export const ARENA_R = 22;
const FLOOR_R = 27;
const GRID_SIZE = 56;
const GRID_DIV = 28;
/** Landmarks sit at or beyond this radius so they never mask an objective. */
const LANDMARK_R = 18;

// Theme palette per kind — mirrors the node colors in BreachSystem so the
// dive sub-scene "reads" as the same building the player just jacked into.
export const THEME: Record<
  BreachKind,
  {
    bg: number;
    fog: [number, number];
    grid: number;
    gridAccent: number;
    accent: number;
    landmark: number;
    light: number;
    ambient: number;
    floor: number;
  }
> = {
  depot: {
    bg: 0x1a1408,
    fog: [26, 62],
    grid: 0xffd75e,
    gridAccent: 0x6a4a10,
    accent: 0xffae3a,
    landmark: 0xb67e1a,
    light: 0xffe48a,
    ambient: 0x4a3a1a,
    floor: 0x1c1208,
  },
  armory: {
    bg: 0x1a0a06,
    fog: [26, 60],
    grid: 0xff5a1a,
    gridAccent: 0x4a1206,
    accent: 0xff6a3d,
    landmark: 0x6a1a0a,
    light: 0xff7a3a,
    ambient: 0x4a1a0a,
    floor: 0x1a0806,
  },
  bank: {
    bg: 0x1a1404,
    fog: [26, 62],
    grid: 0xffcc33,
    gridAccent: 0x6a520a,
    accent: 0xfff04a,
    landmark: 0x8a6a10,
    light: 0xfff0a0,
    ambient: 0x4a3a0a,
    floor: 0x1a1404,
  },
  relay: {
    bg: 0x041a1a,
    fog: [26, 60],
    grid: 0x36e6ff,
    gridAccent: 0x0a4a5a,
    accent: 0x6afff0,
    landmark: 0x0a6a7a,
    light: 0x66ddff,
    ambient: 0x0a3a4a,
    floor: 0x06161a,
  },
  substation: {
    bg: 0x061a04,
    fog: [26, 60],
    grid: 0x9dff57,
    gridAccent: 0x1a4a0a,
    accent: 0xc4ff7a,
    landmark: 0x3a6a1a,
    light: 0x9dff7a,
    ambient: 0x1a3a0a,
    floor: 0x0a1a04,
  },
  stashden: {
    bg: 0x14081a,
    fog: [18, 48],
    grid: 0xc46bff,
    gridAccent: 0x4a1a6a,
    accent: 0xe0a0ff,
    landmark: 0x5a1a7a,
    light: 0xd0a0ff,
    ambient: 0x3a1a4a,
    floor: 0x100614,
  },
};

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

interface SceneBundle {
  scene: THREE.Scene;
  meshes: THREE.Object3D[];
}

/** Per-object animation, ticked by `tickDiveScene`. */
interface Motion {
  spinY?: number;
  spinX?: number;
  bob?: number;
  bobSpeed?: number;
  baseY?: number;
  phase?: number;
}

function baseScene(bg: number, fogColor: number, fogNear: number, fogFar: number): SceneBundle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
  return { scene, meshes: [] };
}

function push<T extends THREE.Object3D>(bundle: SceneBundle, obj: T, motion?: Motion): T {
  if (motion) {
    obj.userData.motion = { ...motion, baseY: obj.position.y, phase: Math.random() * 6.28 };
  }
  bundle.scene.add(obj);
  bundle.meshes.push(obj);
  return obj;
}

function basic(color: number, opacity: number, wireframe = false, additive = false) {
  return new THREE.MeshBasicMaterial({
    color,
    wireframe,
    transparent: true,
    opacity,
    depthWrite: false,
    ...(additive ? { blending: THREE.AdditiveBlending } : {}),
  });
}

/**
 * Floor, grid, and — the important part — a VISIBLE boundary at exactly the
 * radius the player's movement is clamped to, plus rim pylons so the wall
 * reads in 3D and not just as a floor decal.
 */
function arenaShell(bundle: SceneBundle, t: (typeof THEME)[BreachKind]): void {
  const floorMesh = new THREE.Mesh(
    new THREE.CircleGeometry(FLOOR_R, 64),
    new THREE.MeshBasicMaterial({ color: t.floor, side: THREE.DoubleSide }),
  );
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = -0.02;
  push(bundle, floorMesh);

  const g = new THREE.GridHelper(GRID_SIZE, GRID_DIV, t.grid, t.gridAccent);
  const gm = g.material as THREE.Material | THREE.Material[];
  const apply = (m: THREE.Material) => {
    m.transparent = true;
    m.opacity = 0.4;
  };
  if (Array.isArray(gm)) gm.forEach(apply);
  else if (gm) apply(gm);
  push(bundle, g);

  // Containment ring — the exact line the player cannot cross.
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(ARENA_R - 0.22, ARENA_R + 0.22, 128),
    basic(t.accent, 0.85, false, true),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.03;
  rim.renderOrder = 4;
  push(bundle, rim);

  // Soft inner glow so the edge fades in before you hit it.
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(ARENA_R - 2.6, ARENA_R - 0.2, 96),
    basic(t.accent, 0.13, false, true),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.02;
  halo.renderOrder = 3;
  push(bundle, halo);

  // Rim pylons: 24 thin columns standing on the boundary.
  const pylonGeo = new THREE.BoxGeometry(0.22, 5.5, 0.22);
  const pylonMat = basic(t.accent, 0.42, false, true);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const p = new THREE.Mesh(pylonGeo, pylonMat);
    p.position.set(Math.cos(a) * ARENA_R, 2.75, Math.sin(a) * ARENA_R);
    push(bundle, p);
  }
}

function lights(bundle: SceneBundle, lightColor: number, ambientColor: number): void {
  const point = new THREE.PointLight(lightColor, 90, 60, 2);
  point.position.set(0, 14, 0);
  push(bundle, point);
  push(bundle, new THREE.AmbientLight(ambientColor, 0.65));
}

/** Place `n` copies of `build` evenly around a ring at `radius`. */
function aroundRing(
  n: number,
  radius: number,
  build: (x: number, z: number, angle: number, i: number) => void,
  phase = 0,
): void {
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    build(Math.cos(a) * radius, Math.sin(a) * radius, a, i);
  }
}

// ---------------------------------------------------------------------------
// DEPOT — industrial drop yard. Airdrops land in the open middle, so the
// centre and the objective ring are deliberately bare; all mass is on the rim.
// ---------------------------------------------------------------------------

function buildDepotScene(): SceneBundle {
  const t = THEME.depot;
  const bundle = baseScene(t.bg, t.bg, t.fog[0], t.fog[1]);
  arenaShell(bundle, t);

  const crateWire = basic(t.landmark, 0.7, true);
  const crateSolid = basic(0x3a2a0a, 0.5);
  // Stacked crate walls hugging the rim.
  aroundRing(10, LANDMARK_R + 1.5, (x, z, a, i) => {
    const h = 1 + (i % 3);
    for (let k = 0; k < h; k++) {
      const size = 1.5;
      const geoBox = new THREE.BoxGeometry(size, size, size);
      const w = new THREE.Mesh(geoBox, crateWire);
      w.position.set(x, size / 2 + k * size, z);
      w.rotation.y = a;
      push(bundle, w);
      const s = new THREE.Mesh(geoBox, crateSolid);
      s.position.copy(w.position);
      s.rotation.y = a;
      push(bundle, s);
    }
  });

  // Four cargo cranes at the corners of the rim, arms rotating overhead.
  const armMat = basic(t.landmark, 0.6, true);
  const bandMat = basic(t.accent, 0.8, false, true);
  aroundRing(
    4,
    LANDMARK_R,
    (x, z) => {
      const mast = new THREE.Mesh(new THREE.BoxGeometry(1.1, 11, 1.1), armMat);
      mast.position.set(x, 5.5, z);
      push(bundle, mast);
      const arm = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 0.3), bandMat);
      beam.position.x = 3;
      arm.add(beam);
      arm.position.set(x, 10.5, z);
      push(bundle, arm, { spinY: 0.22 });
    },
    Math.PI / 4,
  );

  // Drop-zone halo: a wide faint ring marking where airdrops land.
  const dz = new THREE.Mesh(
    new THREE.RingGeometry(5.6, 15.4, 72),
    basic(t.accent, 0.06, false, true),
  );
  dz.rotation.x = -Math.PI / 2;
  dz.position.y = 0.01;
  dz.renderOrder = 2;
  push(bundle, dz);

  lights(bundle, t.light, t.ambient);
  return bundle;
}

// ---------------------------------------------------------------------------
// ARMORY — arsenal bunker. Racks line the rim; the floor is a clean firing
// range so the crate sweep and the exit run are both legible.
// ---------------------------------------------------------------------------

function buildArmoryScene(): SceneBundle {
  const t = THEME.armory;
  const bundle = baseScene(t.bg, t.bg, t.fog[0], t.fog[1]);
  arenaShell(bundle, t);

  const pillarMat = basic(t.landmark, 0.65, true);
  const crossMat = basic(t.accent, 0.7, false, true);
  // 14 weapon racks around the rim.
  aroundRing(14, LANDMARK_R, (x, z, a) => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 7, 0.55), pillarMat);
    pillar.position.set(x, 3.5, z);
    push(bundle, pillar);
    for (let k = 0; k < 4; k++) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(2, 0.14, 0.14), crossMat);
      cross.position.set(x, 1.1 + k * 1.55, z);
      cross.rotation.y = a;
      push(bundle, cross);
    }
  });

  // Blast-door frame arch, purely to give the space a "front".
  const archMat = basic(t.landmark, 0.5, true);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 0.8), archMat);
    post.position.set(side * 4, 4.5, -LANDMARK_R - 1);
    push(bundle, post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.8, 0.8), archMat);
  lintel.position.set(0, 9, -LANDMARK_R - 1);
  push(bundle, lintel);

  // Hazard chevrons on the floor, well outside the objective band.
  const chevMat = basic(t.accent, 0.16, false, true);
  aroundRing(28, ARENA_R - 2.4, (x, z, a) => {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), chevMat);
    c.rotation.x = -Math.PI / 2;
    c.rotation.z = -a;
    c.position.set(x, 0.02, z);
    c.renderOrder = 3;
    push(bundle, c);
  });

  lights(bundle, t.light, t.ambient);
  return bundle;
}

// ---------------------------------------------------------------------------
// BANK — data vault. The extraction pad is the centre, so the data core is
// SUSPENDED above it: the landmark reads from anywhere and the pad floor
// stays walkable. (It used to be a solid pedestal the player stood inside.)
// ---------------------------------------------------------------------------

function buildBankScene(): SceneBundle {
  const t = THEME.bank;
  const bundle = baseScene(t.bg, t.bg, t.fog[0], t.fog[1]);
  arenaShell(bundle, t);

  // Suspended core, high above the extraction pad.
  const coreWire = basic(t.landmark, 0.85, true);
  const coreFill = basic(t.accent, 0.3);
  const core = new THREE.Group();
  const coreGeo = new THREE.CylinderGeometry(1.6, 2.0, 3.4, 6);
  core.add(new THREE.Mesh(coreGeo, coreWire), new THREE.Mesh(coreGeo, coreFill));
  core.position.set(0, 8.5, 0);
  push(bundle, core, { spinY: 0.5, bob: 0.35, bobSpeed: 0.8 });

  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), basic(t.accent, 0.95, true));
  crystal.position.set(0, 12.4, 0);
  push(bundle, crystal, { spinY: -1.1, spinX: 0.5, bob: 0.5, bobSpeed: 1.2 });

  // Download beam from the core down to the pad — reads as "the data is here".
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 2.4, 7, 16, 1, true),
    basic(t.accent, 0.1, false, true),
  );
  beam.position.set(0, 4.2, 0);
  push(bundle, beam);

  // Vault deposit boxes: a wall of small cells around the rim.
  const cellMat = basic(t.landmark, 0.55, true);
  aroundRing(20, LANDMARK_R + 1, (x, z, a) => {
    for (let k = 0; k < 3; k++) {
      const cell = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.5, 0.8), cellMat);
      cell.position.set(x, 0.85 + k * 1.6, z);
      cell.rotation.y = a;
      push(bundle, cell);
    }
  });

  // Concentric gold rings — floor decals only, never in the way.
  for (const r of [6, 10, 14]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.07, r, 80),
      basic(t.accent, 0.22, false, true),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    ring.renderOrder = 3;
    push(bundle, ring);
  }

  lights(bundle, t.light, t.ambient);
  return bundle;
}

// ---------------------------------------------------------------------------
// RELAY — transmission farm. The three antenna towers stand at EXACTLY the
// uplink objective positions (r=13, 90°/210°/330°), so the landmark and the
// objective are the same object and the map teaches itself.
// ---------------------------------------------------------------------------

/** Must match the tower placement in dive/DiveVerbs.ts `makeUplink`. */
const RELAY_TOWER_R = 13;

function buildRelayScene(): SceneBundle {
  const t = THEME.relay;
  const bundle = baseScene(t.bg, t.bg, t.fog[0], t.fog[1]);
  arenaShell(bundle, t);

  const latticeMat = basic(t.landmark, 0.7, true);
  const ringMat = basic(t.accent, 0.75, false, true);
  const towers: [number, number][] = [];

  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
    const tx = Math.cos(a) * RELAY_TOWER_R;
    const tz = Math.sin(a) * RELAY_TOWER_R;
    towers.push([tx, tz]);

    // Lattice mast — starts at y=3 so it never blocks the tower's ground pad.
    for (let k = 0; k < 3; k++) {
      const r = 1.5 - k * 0.42;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 2.6, 4), latticeMat);
      cone.position.set(tx, 3 + k * 2.6 + 1.3, tz);
      push(bundle, cone);
    }
    // Legs, splayed outside the pad radius.
    for (let l = 0; l < 4; l++) {
      const la = (l / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.6, 0.18), latticeMat);
      leg.position.set(tx + Math.cos(la) * 2.4, 1.8, tz + Math.sin(la) * 2.4);
      leg.rotation.z = Math.cos(la) * 0.28;
      leg.rotation.x = -Math.sin(la) * 0.28;
      push(bundle, leg);
    }
    // Signal rings climbing the mast.
    for (let r = 0; r < 3; r++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5 - r * 0.3, 0.07, 6, 20), ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(tx, 4.2 + r * 2.4, tz);
      push(bundle, ring, { spinY: 1.4 + r * 0.4 });
    }
  }

  // Arcing beams between towers.
  const beamMat = basic(t.accent, 0.4, false, true);
  for (let i = 0; i < towers.length; i++) {
    const [ax, az] = towers[i];
    const [bx, bz] = towers[(i + 1) % towers.length];
    const dx = bx - ax;
    const dz = bz - az;
    const peak = 9;
    for (let s = 0; s < 4; s++) {
      const t01 = s / 4;
      const t02 = (s + 1) / 4;
      const y1 = 9 + Math.sin(t01 * Math.PI) * peak;
      const y2 = 9 + Math.sin(t02 * Math.PI) * peak;
      const x1 = ax + dx * t01;
      const z1 = az + dz * t01;
      const x2 = ax + dx * t02;
      const z2 = az + dz * t02;
      const segLen = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, segLen, 5), beamMat);
      seg.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
      seg.lookAt(x2, y2, z2);
      seg.rotateX(Math.PI / 2);
      push(bundle, seg);
    }
  }

  // Dish farm on the rim.
  const dishMat = basic(t.landmark, 0.5, true);
  aroundRing(8, LANDMARK_R + 2, (x, z, a) => {
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 12, 8, 0, Math.PI * 2, 0, 0.9),
      dishMat,
    );
    dish.position.set(x, 3.4, z);
    dish.rotation.x = -0.7;
    dish.rotation.y = a + Math.PI;
    push(bundle, dish, { spinY: 0.18 });
  });

  lights(bundle, t.light, t.ambient);
  return bundle;
}

// ---------------------------------------------------------------------------
// SUBSTATION — capacitor bank. Phase 2 holds the centre, so the capacitor
// cage is SUSPENDED above the floor pad rather than sitting on it.
// ---------------------------------------------------------------------------

function buildSubstationScene(): SceneBundle {
  const t = THEME.substation;
  const bundle = baseScene(t.bg, t.bg, t.fog[0], t.fog[1]);
  arenaShell(bundle, t);

  // Suspended capacitor over the centre pad.
  const capWire = basic(t.accent, 0.85, true);
  const cap = new THREE.Group();
  cap.add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 10), capWire));
  for (let i = 0; i < 3; i++) {
    const cage = new THREE.Mesh(
      new THREE.TorusGeometry(2.1, 0.08, 6, 26),
      basic(t.grid, 0.7, false, true),
    );
    cage.rotation.x = (i * Math.PI) / 3;
    cage.rotation.y = (i * Math.PI) / 4;
    cap.add(cage);
  }
  cap.position.set(0, 7.5, 0);
  push(bundle, cap, { spinY: 0.7, bob: 0.3, bobSpeed: 1.0 });

  // Discharge mast running down toward the pad but stopping well above it.
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 3.2, 8),
    basic(t.landmark, 0.7),
  );
  mast.position.set(0, 4.4, 0);
  push(bundle, mast);

  // Transformer bank on the rim.
  const txWire = basic(t.landmark, 0.7, true);
  const txFill = basic(0x1a3a0a, 0.6);
  const finMat = basic(t.accent, 0.7, false, true);
  aroundRing(8, LANDMARK_R, (x, z, a) => {
    const boxGeo = new THREE.BoxGeometry(2.2, 3, 2.2);
    const w = new THREE.Mesh(boxGeo, txWire);
    w.position.set(x, 1.5, z);
    w.rotation.y = a;
    push(bundle, w);
    const f = new THREE.Mesh(boxGeo, txFill);
    f.position.copy(w.position);
    f.rotation.y = a;
    push(bundle, f);
    for (let k = 0; k < 3; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.16), finMat);
      fin.position.set(x, 3.15 + k * 0.16, z + (k - 1) * 0.42);
      fin.rotation.y = a;
      push(bundle, fin);
    }
  });

  // Overhead power lines linking the transformers.
  const lineMat = basic(t.grid, 0.35, false, true);
  aroundRing(8, LANDMARK_R, (x, z, a) => {
    const nx = Math.cos(a + Math.PI / 4) * LANDMARK_R;
    const nz = Math.sin(a + Math.PI / 4) * LANDMARK_R;
    const len = Math.hypot(nx - x, nz - z);
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 4), lineMat);
    seg.position.set((x + nx) / 2, 3.4, (z + nz) / 2);
    seg.lookAt(nx, 3.4, nz);
    seg.rotateX(Math.PI / 2);
    push(bundle, seg);
  });

  lights(bundle, t.light, t.ambient);
  return bundle;
}

// ---------------------------------------------------------------------------
// STASH DEN — smuggler's den. The altar interaction is at the origin, so the
// physical altar HANGS above it; the floor beneath stays walkable.
// ---------------------------------------------------------------------------

function buildStashdenScene(): SceneBundle {
  const t = THEME.stashden;
  // Tighter fog for the smoke-haze feel, but not so tight the rim vanishes.
  const bundle = baseScene(t.bg, t.bg, t.fog[0], t.fog[1]);
  arenaShell(bundle, t);

  // Suspended idol over the altar pad.
  const idolWire = basic(t.landmark, 0.75, true);
  const idolFill = basic(0x2a0a3a, 0.7);
  const idol = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = 2.6 - i * 0.7;
    const boxGeo = new THREE.BoxGeometry(s, 0.5, s);
    const w = new THREE.Mesh(boxGeo, idolWire);
    w.position.y = i * 0.55;
    const f = new THREE.Mesh(boxGeo, idolFill);
    f.position.y = i * 0.55;
    idol.add(w, f);
  }
  idol.position.set(0, 6.5, 0);
  push(bundle, idol, { spinY: 0.35, bob: 0.4, bobSpeed: 0.7 });

  // Candles ringing the altar pad — placed just OUTSIDE the 2.6 interaction
  // radius so they frame it instead of standing in it.
  const candleMat = basic(0xfff0c0, 0.85);
  const flameMat = basic(t.accent, 0.95, false, true);
  aroundRing(8, 3.6, (x, z) => {
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.9, 6), candleMat);
    candle.position.set(x, 0.45, z);
    push(bundle, candle);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 6), flameMat);
    flame.position.set(x, 1.15, z);
    push(bundle, flame, { bob: 0.08, bobSpeed: 6 });
  });

  // Contraband stacks and hanging haze around the rim.
  const stackMat = basic(t.landmark, 0.6, true);
  aroundRing(12, LANDMARK_R, (x, z, a, i) => {
    const h = 1 + (i % 3);
    for (let k = 0; k < h; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), stackMat);
      b.position.set(x, 0.6 + k * 1.25, z);
      b.rotation.y = a;
      push(bundle, b);
    }
  });

  const wispMat = basic(t.gridAccent, 0.3);
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * 10;
    const wisp = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.5, 4, 10), wispMat);
    wisp.position.set(Math.cos(a) * r, 5 + Math.random() * 4, Math.sin(a) * r);
    wisp.rotation.set(Math.random(), Math.random(), Math.random());
    push(bundle, wisp, { spinY: 0.1 + Math.random() * 0.2, bob: 0.6, bobSpeed: 0.4 });
  }

  lights(bundle, t.light, t.ambient);
  return bundle;
}

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

const BUILDERS: Record<BreachKind, () => SceneBundle> = {
  depot: buildDepotScene,
  armory: buildArmoryScene,
  bank: buildBankScene,
  relay: buildRelayScene,
  substation: buildSubstationScene,
  stashden: buildStashdenScene,
};

/**
 * Build the themed dive scene for a breach kind. Returns the scene plus the
 * tracked mesh array; both must be passed to `disposeDiveScene` on teardown.
 * Falls back to the depot scene for unknown kinds.
 */
export function buildDiveSceneFor(kind: BreachKind): SceneBundle {
  const builder = BUILDERS[kind] ?? buildDepotScene;
  return builder();
}

/**
 * Animate the scene's moving dressing (spinning crane arms, bobbing cores,
 * flickering flames). Walks only the tracked array and only the objects that
 * declared a motion, so the cost is a handful of transform writes per frame.
 */
export function tickDiveScene(meshes: THREE.Object3D[], dt: number, time: number): void {
  for (const obj of meshes) {
    const m = obj.userData.motion as Motion | undefined;
    if (!m) continue;
    if (m.spinY) obj.rotation.y += m.spinY * dt;
    if (m.spinX) obj.rotation.x += m.spinX * dt;
    if (m.bob)
      obj.position.y = (m.baseY ?? 0) + Math.sin(time * (m.bobSpeed ?? 1) + (m.phase ?? 0)) * m.bob;
  }
}

/**
 * Tear down a dive scene: remove every tracked object, dispose its geometry
 * and material (handling Material arrays), and clear the tracking array.
 * Modeled on LevelSystem.disposeLevel.
 *
 * NOTE: dive markers and ICE meshes are deliberately NOT in this array — they
 * share cached geometry across dives and own their own teardown.
 */
export function disposeDiveScene(scene: THREE.Scene, meshes: THREE.Object3D[]): void {
  for (const obj of meshes) {
    scene.remove(obj);
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else child.material.dispose();
        }
      }
    });
  }
  meshes.length = 0;
}
