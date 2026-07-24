// --- DIVE SCENES (chunk5: 6 themed builders + ICE visuals) ---
// One builder per BreachKind. The dive sub-scene is swapped in by main.ts
// while `uiState.dive` is non-null; the arena systems are frozen, so every
// visual the player sees in the dive must be spawned here. Each theme
// gives a distinct fog/background, floor grid color, and landmark silhouette
// so the player can read the building from the dive sub-scene alone.
//
// Build/teardown discipline mirrors LevelSystem.initLevel/disposeLevel: every
// created Object3D is pushed into a tracked array and disposed per-mesh on
// teardown (geometry + material, handling Material arrays minimally).
//
// ICE meshes: the dive spawns its own enemy entities (spawnEnemy) but
// RenderSystem is bypassed during the dive, so the InstancedMesh flow does
// not draw them. We attach a per-ICE ghost mesh via a WeakMap keyed by
// entity reference (see attachIceMesh in BreachDiveSystem). The mesh itself
// is added to the tracked `meshes` array so disposeDiveScene cleans it up.

import * as THREE from 'three';
import type { BreachKind } from '../systems/BreachSystem';

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
    fog: [22, 60],
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
    fog: [20, 56],
    grid: 0xff5a1a,
    gridAccent: 0x4a1206,
    accent: 0xff3d3d,
    landmark: 0x6a1a0a,
    light: 0xff7a3a,
    ambient: 0x4a1a0a,
    floor: 0x1a0806,
  },
  bank: {
    bg: 0x1a1404,
    fog: [22, 60],
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
    fog: [20, 58],
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
    fog: [20, 56],
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
    fog: [10, 36],
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

function baseScene(bg: number, fogColor: number, fogNear: number, fogFar: number): SceneBundle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
  return { scene, meshes: [] };
}

function push<T extends THREE.Object3D>(bundle: SceneBundle, obj: T): T {
  bundle.scene.add(obj);
  bundle.meshes.push(obj);
  return obj;
}

function floor(bundle: SceneBundle, color: number, radius: number = 40): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.02;
  return push(bundle, m);
}

function grid(
  bundle: SceneBundle,
  size: number,
  divisions: number,
  color: number,
  accent: number,
): THREE.GridHelper {
  const g = new THREE.GridHelper(size, divisions, color, accent);
  const gm = g.material as THREE.Material | THREE.Material[];
  const apply = (m: THREE.Material) => {
    m.transparent = true;
    m.opacity = 0.55;
  };
  if (Array.isArray(gm)) gm.forEach(apply);
  else if (gm) apply(gm);
  return push(bundle, g);
}

function lights(bundle: SceneBundle, lightColor: number, ambientColor: number): void {
  const point = new THREE.PointLight(lightColor, 80, 50, 2);
  point.position.set(0, 12, 0);
  push(bundle, point);
  const ambient = new THREE.AmbientLight(ambientColor, 0.6);
  push(bundle, ambient);
}

// ---------------------------------------------------------------------------
// DEPOT — industrial crate yard
// Warm yellow grid, scattered crate blocks, vertical conveyor pillars.
// ---------------------------------------------------------------------------

function buildDepotScene(): SceneBundle {
  const t = THEME.depot;
  const bundle = baseScene(t.bg, t.bg, t.fog[0], t.fog[1]);
  floor(bundle, t.floor);
  grid(bundle, 80, 32, t.grid, t.gridAccent);

  const crateMat = new THREE.MeshBasicMaterial({
    color: t.landmark,
    wireframe: true,
    transparent: true,
    opacity: 0.7,
  });
  const crateSolid = new THREE.MeshBasicMaterial({
    color: 0x3a2a0a,
    transparent: true,
    opacity: 0.5,
  });
  // 16 scattered crate blocks in two clusters
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + (i % 2) * 0.4;
    const r = 6 + (i % 3) * 6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const size = 0.8 + (i % 4) * 0.4;
    const w = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
    w.position.set(x, size / 2, z);
    push(bundle, w);
    const s = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateSolid);
    s.position.set(x, size / 2, z);
    push(bundle, s);
  }

  // 4 vertical conveyors (tall pillars with banded rings) at the corners
  const pillarMat = new THREE.MeshBasicMaterial({
    color: t.landmark,
    wireframe: true,
    transparent: true,
    opacity: 0.6,
  });
  const bandMat = new THREE.MeshBasicMaterial({ color: t.accent, transparent: true, opacity: 0.8 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 16;
    const z = Math.sin(a) * 16;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9, 1.2), pillarMat);
    pillar.position.set(x, 4.5, z);
    push(bundle, pillar);
    for (let b = 0; b < 3; b++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 6, 16), bandMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 1.5 + b * 3, z);
      push(bundle, ring);
    }
  }

  // Glowing supply-drop icon (downward-pointing cone) at the spawn center
  const dropMat = new THREE.MeshBasicMaterial({ color: t.accent, transparent: true, opacity: 0.8 });
  const drop = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 8), dropMat);
  drop.position.set(0, 0.7, 0);
  push(bundle, drop);

  lights(bundle, t.light, t.ambient);
  return bundle;
}

// ---------------------------------------------------------------------------
// ARMORY — arsenal bunker
// Orange-red, weapon-rack pillars (tall thin stacks), banded concrete floor.
// ---------------------------------------------------------------------------

function buildArmoryScene(): SceneBundle {
  const t = THEME.armory;
  const bundle = baseScene(t.bg, t.bg, t.fog[0], t.fog[1]);
  floor(bundle, t.floor);

  // Banded concrete: two overlaid grids in two colors
  grid(bundle, 80, 32, t.grid, t.gridAccent);
  const g2 = new THREE.GridHelper(80, 8, t.landmark, t.landmark);
  const gm = g2.material as THREE.Material | THREE.Material[];
  const apply = (m: THREE.Material) => {
    m.transparent = true;
    m.opacity = 0.4;
  };
  if (Array.isArray(gm)) gm.forEach(apply);
  else if (gm) apply(gm);
  push(bundle, g2);

  // 12 weapon-rack pillars: tall thin stacks with horizontal cross-bars
  const pillarMat = new THREE.MeshBasicMaterial({
    color: t.landmark,
    wireframe: true,
    transparent: true,
    opacity: 0.65,
  });
  const crossMat = new THREE.MeshBasicMaterial({
    color: t.accent,
    transparent: true,
    opacity: 0.7,
  });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = Math.cos(a) * 14;
    const z = Math.sin(a) * 14;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), pillarMat);
    pillar.position.set(x, 3.5, z);
    push(bundle, pillar);
    for (let k = 0; k < 4; k++) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), crossMat);
      cross.position.set(x, 1 + k * 1.5, z);
      cross.rotation.y = a;
      push(bundle, cross);
    }
  }

  // Ammo crate stack at center (3 nested boxes)
  const crateMat = new THREE.MeshBasicMaterial({
    color: t.accent,
    wireframe: true,
    transparent: true,
    opacity: 0.7,
  });
  for (let i = 0; i < 3; i++) {
    const s = 1.6 - i * 0.4;
    const c = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.6, s), crateMat);
    c.position.set(0, s * 0.3 + i * s * 0.7, 0);
    push(bundle, c);
  }

  lights(bundle, t.light, t.ambient);
  return bundle;
}

// ---------------------------------------------------------------------------
// BANK — data vault
// Gold neon, central hex data-core pedestal, radial spokes.
// ---------------------------------------------------------------------------

function buildBankScene(): SceneBundle {
  const t = THEME.bank;
  const bundle = baseScene(t.bg, t.bg, t.fog[0], t.fog[1]);
  floor(bundle, t.floor);
  grid(bundle, 80, 32, t.grid, t.gridAccent);

  // Central data-core: a hex prism pedestal (CylinderGeometry w/ 6 segments)
  const coreMat = new THREE.MeshBasicMaterial({
    color: t.landmark,
    wireframe: true,
    transparent: true,
    opacity: 0.85,
  });
  const coreFillMat = new THREE.MeshBasicMaterial({
    color: t.accent,
    transparent: true,
    opacity: 0.35,
  });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 4, 6), coreMat);
  core.position.set(0, 2, 0);
  push(bundle, core);
  const coreFill = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 4, 6), coreFillMat);
  coreFill.position.set(0, 2, 0);
  push(bundle, coreFill);

  // Inner crystal: a small octahedron spinning slowly (static rotation here)
  const crystalMat = new THREE.MeshBasicMaterial({
    color: t.accent,
    wireframe: true,
    transparent: true,
    opacity: 0.9,
  });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), crystalMat);
  crystal.position.set(0, 4.5, 0);
  push(bundle, crystal);

  // Radial spokes: 8 thin beams from center to perimeter
  const spokeMat = new THREE.MeshBasicMaterial({
    color: t.landmark,
    transparent: true,
    opacity: 0.5,
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.08), spokeMat);
    spoke.position.set(Math.cos(a) * 5.5, 0.04, Math.sin(a) * 5.5);
    spoke.rotation.y = a;
    push(bundle, spoke);
  }

  // Gold coin rings on the floor (concentric)
  for (const r of [4, 8, 12]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.08, r, 64),
      new THREE.MeshBasicMaterial({
        color: t.accent,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    push(bundle, ring);
  }

  lights(bundle, t.light, t.ambient);
  return bundle;
}

// ---------------------------------------------------------------------------
// RELAY — transmission tower
// Teal/cyan, antenna silhouettes (tall cones), signal arcs.
// ---------------------------------------------------------------------------

function buildRelayScene(): SceneBundle {
  const t = THEME.relay;
  const bundle = baseScene(t.bg, t.bg, t.fog[0], t.fog[1]);
  floor(bundle, t.floor);
  grid(bundle, 80, 32, t.grid, t.gridAccent);

  // 3 antenna towers (lattice cones) at triangular positions
  const antennaMat = new THREE.MeshBasicMaterial({
    color: t.landmark,
    wireframe: true,
    transparent: true,
    opacity: 0.7,
  });
  const ringMat = new THREE.MeshBasicMaterial({
    color: t.accent,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
  });
  const towerPositions: [number, number][] = [
    [0, 0],
    [Math.cos((Math.PI * 2) / 3) * 12, Math.sin((Math.PI * 2) / 3) * 12],
    [Math.cos((-Math.PI * 2) / 3) * 12, Math.sin((-Math.PI * 2) / 3) * 12],
  ];
  for (const [tx, tz] of towerPositions) {
    // Lattice: 3 stacked cones narrowing upward
    for (let i = 0; i < 3; i++) {
      const r = 1.4 - i * 0.4;
      const h = 2.4;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), antennaMat);
      cone.position.set(tx, i * h + h / 2, tz);
      push(bundle, cone);
    }
    // Signal rings expanding up the tower
    for (let r = 0; r < 3; r++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6 - r * 0.3, 0.06, 6, 16), ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(tx, r * 2.2 + 0.5, tz);
      push(bundle, ring);
    }
  }

  // Arcing signal beams between towers (curved tubes approximated by
  // 3-segment straight lines)
  const beamMat = new THREE.MeshBasicMaterial({
    color: t.accent,
    transparent: true,
    opacity: 0.55,
  });
  for (let i = 0; i < towerPositions.length; i++) {
    const [ax, az] = towerPositions[i];
    const [bx, bz] = towerPositions[(i + 1) % towerPositions.length];
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const peak = 6.5;
    const dx = bx - ax;
    const dz = bz - az;
    const dist = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    for (let s = 0; s < 3; s++) {
      const t01 = s / 2;
      const t02 = (s + 1) / 2;
      const y1 = Math.sin(t01 * Math.PI) * peak;
      const y2 = Math.sin(t02 * Math.PI) * peak;
      const x1 = ax + dx * t01;
      const z1 = az + dz * t01;
      const x2 = ax + dx * t02;
      const z2 = az + dz * t02;
      const segLen = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, segLen, 5), beamMat);
      seg.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
      seg.lookAt(x2, y2, z2);
      seg.rotateX(Math.PI / 2);
      push(bundle, seg);
    }
    void mx;
    void mz;
    void angle;
    void dist;
  }

  lights(bundle, t.light, t.ambient);
  return bundle;
}

// ---------------------------------------------------------------------------
// SUBSTATION — capacitor bank
// Green-white, transformer boxes, charge-ring posts.
// ---------------------------------------------------------------------------

function buildSubstationScene(): SceneBundle {
  const t = THEME.substation;
  const bundle = baseScene(t.bg, t.bg, t.fog[0], t.fog[1]);
  floor(bundle, t.floor);
  grid(bundle, 80, 32, t.grid, t.gridAccent);

  // 6 transformer boxes scattered in a ring
  const txMat = new THREE.MeshBasicMaterial({
    color: t.landmark,
    wireframe: true,
    transparent: true,
    opacity: 0.7,
  });
  const txFillMat = new THREE.MeshBasicMaterial({
    color: 0x1a3a0a,
    transparent: true,
    opacity: 0.6,
  });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = 10;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 1.6), txMat);
    w.position.set(x, 1.1, z);
    push(bundle, w);
    const f = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 1.6), txFillMat);
    f.position.set(x, 1.1, z);
    push(bundle, f);
    // Top cooling fins
    for (let k = 0; k < 3; k++) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.08, 0.12),
        new THREE.MeshBasicMaterial({ color: t.accent, transparent: true, opacity: 0.7 }),
      );
      fin.position.set(x, 2.3 + k * 0.12, z + (k - 1) * 0.3);
      push(bundle, fin);
    }
  }

  // 3 charge-ring posts (tall cylinders with horizontal torus rings)
  const postMat = new THREE.MeshBasicMaterial({
    color: t.landmark,
    wireframe: true,
    transparent: true,
    opacity: 0.7,
  });
  const ringMat = new THREE.MeshBasicMaterial({
    color: t.accent,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const r = 18;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 5, 8), postMat);
    post.position.set(x, 2.5, z);
    push(bundle, post);
    for (let k = 0; k < 3; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.1, 6, 20), ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 1 + k * 1.5, z);
      push(bundle, ring);
    }
  }

  // Center capacitor cap (sphere with cross-bars)
  const capMat = new THREE.MeshBasicMaterial({
    color: t.accent,
    wireframe: true,
    transparent: true,
    opacity: 0.8,
  });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), capMat);
  cap.position.set(0, 1, 0);
  push(bundle, cap);
  const capBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 2, 0.1),
    new THREE.MeshBasicMaterial({ color: t.landmark, transparent: true, opacity: 0.7 }),
  );
  capBar.position.set(0, 2, 0);
  push(bundle, capBar);

  lights(bundle, t.light, t.ambient);
  return bundle;
}

// ---------------------------------------------------------------------------
// STASHDEN — smuggler's den
// Purple haze, smoke-fog (heavy), candle-altar (candle cylinders around altar).
// ---------------------------------------------------------------------------

function buildStashdenScene(): SceneBundle {
  const t = THEME.stashden;
  // Tighter fog for the smoke-haze feel
  const bundle = baseScene(t.bg, t.bg, 8, 32);
  floor(bundle, t.floor);
  // Half-opacity grid (smoke dims it)
  const g = new THREE.GridHelper(60, 24, t.grid, t.gridAccent);
  const gm = g.material as THREE.Material | THREE.Material[];
  const apply = (m: THREE.Material) => {
    m.transparent = true;
    m.opacity = 0.35;
  };
  if (Array.isArray(gm)) gm.forEach(apply);
  else if (gm) apply(gm);
  push(bundle, g);

  // Altar at center: stepped platform (3 boxes) with 6 candles around
  const altarMat = new THREE.MeshBasicMaterial({
    color: t.landmark,
    wireframe: true,
    transparent: true,
    opacity: 0.7,
  });
  const altarFill = new THREE.MeshBasicMaterial({
    color: 0x2a0a3a,
    transparent: true,
    opacity: 0.7,
  });
  for (let i = 0; i < 3; i++) {
    const s = 2.4 - i * 0.6;
    const h = 0.4;
    const w = new THREE.Mesh(new THREE.BoxGeometry(s, h, s), altarMat);
    w.position.set(0, i * h + h / 2, 0);
    push(bundle, w);
    const f = new THREE.Mesh(new THREE.BoxGeometry(s, h, s), altarFill);
    f.position.set(0, i * h + h / 2, 0);
    push(bundle, f);
  }
  // 6 candle cylinders around the altar rim with flame cones
  const candleMat = new THREE.MeshBasicMaterial({
    color: 0xfff0c0,
    transparent: true,
    opacity: 0.8,
  });
  const flameMat = new THREE.MeshBasicMaterial({
    color: t.accent,
    transparent: true,
    opacity: 0.9,
  });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = 2.4;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6), candleMat);
    candle.position.set(x, 1.45, z);
    push(bundle, candle);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 6), flameMat);
    flame.position.set(x, 1.85, z);
    push(bundle, flame);
  }

  // Hanging smoke wisps: scattered tori (subtle silhouettes)
  const wispMat = new THREE.MeshBasicMaterial({
    color: t.gridAccent,
    transparent: true,
    opacity: 0.35,
  });
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * 8;
    const wisp = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.4, 4, 8), wispMat);
    wisp.position.set(Math.cos(a) * r, 2 + Math.random() * 3, Math.sin(a) * r);
    wisp.rotation.set(Math.random(), Math.random(), Math.random());
    push(bundle, wisp);
  }

  // Creepy perimeter stakes: 8 leaning cones
  const stakeMat = new THREE.MeshBasicMaterial({
    color: t.landmark,
    wireframe: true,
    transparent: true,
    opacity: 0.5,
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = 16;
    const stake = new THREE.Mesh(new THREE.ConeGeometry(0.4, 4, 4), stakeMat);
    stake.position.set(Math.cos(a) * r, 2, Math.sin(a) * r);
    stake.rotation.z = (Math.random() - 0.5) * 0.4;
    push(bundle, stake);
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
 * Build the themed dive scene for a given breach kind. Returns the scene
 * plus the tracked mesh array; both must be passed to `disposeDiveScene`
 * on teardown. Falls back to the depot scene for unknown kinds.
 */
export function buildDiveSceneFor(kind: BreachKind): SceneBundle {
  const builder = BUILDERS[kind] ?? buildDepotScene;
  return builder();
}

/**
 * Tear down a dive scene: remove every tracked object, dispose its geometry
 * and material (handling Material arrays), and clear the tracking array.
 * Modeled exactly on LevelSystem.disposeLevel.
 */
export function disposeDiveScene(scene: THREE.Scene, meshes: THREE.Object3D[]): void {
  for (const obj of meshes) {
    scene.remove(obj);
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }
  meshes.length = 0;
}
