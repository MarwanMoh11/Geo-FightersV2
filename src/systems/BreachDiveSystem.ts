// --- BREACH DIVE SYSTEM (chunk3: dive verbs, ICE, trace-scaled ambush) ---
// Owns the dive sub-scene that swaps in for the arena once a breach is WON.
//
// Per-building verbs (6 kinds, design-locked):
//   bank      = extraction     — timed data download; survive a point
//   substation = hold-&-overload — charge pads → overload capacitor
//   armory    = grab-&-run     — collect pickups, reach exit pad
//   relay     = evasion        — survive while ICE hunt; trace climbs fast
//   depot     = supply run     — collect N supply pickups before time
//   stashden  = gamble         — push-your-luck at altar, cash out or bust
//
// Each verb has WIN + FAIL detection. FAIL = trace >= traceMax (universal
// backstop) + verb-specific (timer expiry, bust, etc.). On FAIL the player is
// ejected into a trace-scaled ambush ring at the building door.
//
// ICE constructs: enemies spawned into the dive scene, steered per-frame by
// a minimal loop inside this system. No weapon fire inside the dive; ICE deal
// contact damage to a dive-local health bar. The outer arena systems are
// frozen (Chunk 2 gate) — this system owns the full dive frame.

import * as THREE from 'three';
import { uiState, announce } from '../core/UIState.svelte.ts';
import { buildDiveSceneFor, disposeDiveScene, THEME } from '../core/DiveScenes';
import {
  completeBreachWin,
  completeBreachFail,
  type BreachNode,
  type BreachKind,
  type DiveOutcome,
} from './BreachSystem';
import { spawnEnemy, EnemyType } from '../core/factories';
import { InputSystem } from './InputSystem';
import { resetVirtualJoystick } from './InputSystem';
import { haptics } from '../core/haptics';
import { world, type Entity } from '../core/world';
import { partySpawnMultiplier } from '../core/difficulty';
import { getCurrentLevel } from '../core/LevelData';

// Minimal structural type for the raw renderer. `setRenderTarget` is optional
// because the WebGL and WebGPU renderers both expose it, but the dive only
// needs the two calls and shouldn't depend on the full renderer type.
type DiveRenderer = {
  render: (scene: THREE.Scene, camera: THREE.Camera) => void;
  setRenderTarget?: (target: unknown | null) => void;
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TRACE_MAX = 100;
const DIVE_PLAYER_SPEED = 5.5;
const DIVE_BOUNDS = 34; // clamp player within this radius from origin
const ICE_CONTACT_DIST = 1.2;
const ICE_CONTACT_DAMAGE = 8;
const ICE_CONTACT_COOLDOWN = 0.6; // invuln window between ICE hits
const ICE_STEER_SPEED = 3.5;
const ICE_WAVE_INTERVAL = 5; // seconds between ICE reinforcement waves
const AMBUSH_RADIUS = 25;
const AMBUSH_CAP = 40;
const AMBUSH_BASE = 8;
const AMBUSH_TRACE_DIV = 6; // +1 enemy per N trace points
const AMBUSH_TIME_DIV = 5; // +2 enemies per N seconds elapsed

// ---------------------------------------------------------------------------
// Trace rate per verb (base rate). Security adds ~1-2 per level.
// ---------------------------------------------------------------------------
const TRACE_BASE: Record<string, number> = {
  bank: 5,
  substation: 4,
  armory: 3,
  relay: 8,
  depot: 5,
  stashden: 3,
};
const TRACE_SEC_MULT: Record<string, number> = {
  bank: 1.5,
  substation: 1,
  armory: 1,
  relay: 2,
  depot: 1,
  stashden: 1.5,
};

// ---------------------------------------------------------------------------
// Verb timer presets (seconds). Higher security = less time.
// ---------------------------------------------------------------------------
const TIMER_BASE: Record<string, number> = {
  bank: 30,
  substation: 25,
  armory: 20,
  relay: 15,
  depot: 20,
  stashden: 28,
};
const TIMER_SEC_BONUS = 5; // extra seconds per security level

// ---------------------------------------------------------------------------
// Module-level dive state (accessible by tick + exit handlers)
// ---------------------------------------------------------------------------
let diveScene: THREE.Scene | null = null;
let diveMeshes: THREE.Object3D[] = [];
let diveNode: BreachNode | null = null;
let diveOverclock = false;
let diveSecurity = 0;
let diveElapsed = 0;
// Arena scene ref — stored so exitDive (called from key handler) can spawn ambush
let arenaSceneRef: THREE.Scene | null = null;
let keysBound = false;

// Player reparent state: the local player's `transform` (its visible mesh group)
// normally lives in the arena scene graph. We reparent it into the dive scene
// on enter so the player is visible during the dive, and move it back on exit.
// We also stash the arena-space position and reset to the dive origin (0,0).
let playerTransformParent: THREE.Object3D | null = null;
let stashedPlayerPosition: THREE.Vector3 | null = null;

// Per-ICE ghost mesh: keyed by entity reference (not id, because network
// sync overwrites the id). The mesh itself is added to `diveMeshes` so
// disposeDiveScene handles its teardown alongside the themed scene.
const iceMeshes: WeakMap<Entity, THREE.Object3D> = new WeakMap();

// Per-verb state machine (discriminated union)
type DiveVerbData =
  | {
      verb: 'extraction';
      extractionProgress: number;
      extractionMax: number;
      timer: number;
      timerMax: number;
    }
  | {
      verb: 'holdOverload';
      pads: { x: number; z: number; charged: boolean }[];
      padCount: number;
      capacitorProgress: number;
      capacitorMax: number;
      timer: number;
      timerMax: number;
      overloadActive: boolean;
    }
  | {
      verb: 'grabAndRun';
      pickups: { x: number; z: number; collected: boolean }[];
      collectedCount: number;
      totalCount: number;
      exitX: number;
      exitZ: number;
      exitActive: boolean;
      timer: number;
      timerMax: number;
    }
  | { verb: 'evasion'; timer: number; timerMax: number }
  | {
      verb: 'supplyRun';
      pickups: { x: number; z: number; collected: boolean }[];
      collected: number;
      needed: number;
      timer: number;
      timerMax: number;
    }
  | {
      verb: 'gamble';
      altarX: number;
      altarZ: number;
      cashOutX: number;
      cashOutZ: number;
      stack: number;
      bustChance: number;
      cashedOut: boolean;
      timer: number;
      timerMax: number;
      pushCooldown: number;
    };

let diveVerbState: DiveVerbData | null = null;

// Dive-local health
let diveHealth = 100;
let diveHealthMax = 100;
let iceContactTimer = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampToArena(v: number, half: number): number {
  const lim = half - 2;
  return v < -lim ? -lim : v > lim ? lim : v;
}

function getTraceRate(kind: string, security: number, verbState: DiveVerbData | null): number {
  const base = TRACE_BASE[kind] ?? 4;
  const secMult = TRACE_SEC_MULT[kind] ?? 1;
  let rate = base + security * secMult;
  if (kind === 'stashden' && verbState?.verb === 'gamble') {
    rate += verbState.stack * 2;
  }
  return rate;
}

/** Build verb state for the given kind + security. Also spawns visual pads/pickups. */
function initVerbState(kind: string, security: number): DiveVerbData {
  const timerMax = (TIMER_BASE[kind] ?? 25) + security * TIMER_SEC_BONUS;

  switch (kind) {
    case 'bank': {
      return {
        verb: 'extraction',
        extractionProgress: 0,
        extractionMax: 100,
        timer: 0,
        timerMax,
      };
    }
    case 'substation': {
      const padCount = 3 + security;
      const pads: { x: number; z: number; charged: boolean }[] = [];
      for (let i = 0; i < padCount; i++) {
        const angle = (i / padCount) * Math.PI * 2;
        const r = 8 + Math.random() * 6;
        pads.push({ x: Math.cos(angle) * r, z: Math.sin(angle) * r, charged: false });
      }
      return {
        verb: 'holdOverload',
        pads,
        padCount,
        capacitorProgress: 0,
        capacitorMax: 80,
        timer: 0,
        timerMax,
        overloadActive: false,
      };
    }
    case 'armory': {
      const totalCount = 4 + security;
      const pickups: { x: number; z: number; collected: boolean }[] = [];
      for (let i = 0; i < totalCount; i++) {
        const angle = (i / totalCount) * Math.PI * 2 + Math.random() * 0.5;
        const r = 5 + Math.random() * 18;
        pickups.push({ x: Math.cos(angle) * r, z: Math.sin(angle) * r, collected: false });
      }
      const exitAngle = Math.random() * Math.PI * 2;
      const exitR = 28;
      return {
        verb: 'grabAndRun',
        pickups,
        collectedCount: 0,
        totalCount,
        exitX: Math.cos(exitAngle) * exitR,
        exitZ: Math.sin(exitAngle) * exitR,
        exitActive: false,
        timer: 0,
        timerMax,
      };
    }
    case 'relay': {
      return { verb: 'evasion', timer: 0, timerMax };
    }
    case 'depot': {
      const needed = 5 + security * 2;
      const total = needed + 3; // spawn a few extra
      const pickups: { x: number; z: number; collected: boolean }[] = [];
      for (let i = 0; i < total; i++) {
        const angle = (i / total) * Math.PI * 2 + Math.random() * 0.4;
        const r = 5 + Math.random() * 20;
        pickups.push({ x: Math.cos(angle) * r, z: Math.sin(angle) * r, collected: false });
      }
      return { verb: 'supplyRun', pickups, collected: 0, needed, timer: 0, timerMax };
    }
    case 'stashden': {
      const altarR = 6;
      const altarAngle = Math.random() * Math.PI * 2;
      const cashOutAngle = altarAngle + Math.PI + (Math.random() - 0.5) * 1;
      return {
        verb: 'gamble',
        altarX: Math.cos(altarAngle) * altarR,
        altarZ: Math.sin(altarAngle) * altarR,
        cashOutX: Math.cos(cashOutAngle) * 26,
        cashOutZ: Math.sin(cashOutAngle) * 26,
        stack: 0,
        bustChance: 0.1,
        cashedOut: false,
        timer: 0,
        timerMax,
        pushCooldown: 0,
      };
    }
    default: {
      return { verb: 'evasion', timer: 0, timerMax };
    }
  }
}

/** Spawn visual markers for pads/pickups in the dive scene. */
function spawnVerbVisuals(vs: DiveVerbData): void {
  if (!diveScene) return;
  const mkCube = (x: number, z: number, color: number, y: number = 0.5, size: number = 0.6) => {
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    diveScene!.add(mesh);
    diveMeshes.push(mesh);
    return mesh;
  };
  const mkRing = (x: number, z: number, color: number, y: number = 0.15) => {
    const geo = new THREE.RingGeometry(0.5, 0.7, 24);
    const mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    diveScene!.add(mesh);
    diveMeshes.push(mesh);
    return mesh;
  };

  switch (vs.verb) {
    case 'holdOverload': {
      for (const pad of vs.pads) {
        mkRing(pad.x, pad.z, 0x36e6ff);
      }
      break;
    }
    case 'grabAndRun': {
      for (const p of vs.pickups) {
        mkCube(p.x, p.z, 0xff8c3a);
      }
      const exitMat = new THREE.MeshBasicMaterial({
        color: 0x00ff88,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
      });
      const exitGeo = new THREE.CircleGeometry(1.5, 24);
      const exitMesh = new THREE.Mesh(exitGeo, exitMat);
      exitMesh.rotation.x = -Math.PI / 2;
      exitMesh.position.set(vs.exitX, 0.1, vs.exitZ);
      exitMesh.visible = false;
      diveScene!.add(exitMesh);
      diveMeshes.push(exitMesh);
      break;
    }
    case 'supplyRun': {
      for (const p of vs.pickups) {
        mkCube(p.x, p.z, 0xffd75e);
      }
      break;
    }
    case 'gamble': {
      mkCube(vs.altarX, vs.altarZ, 0xc46bff, 0.8, 1.0);
      const coGeo = new THREE.CircleGeometry(1.5, 24);
      const coMat = new THREE.MeshBasicMaterial({
        color: 0x00ff88,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
      });
      const coMesh = new THREE.Mesh(coGeo, coMat);
      coMesh.rotation.x = -Math.PI / 2;
      coMesh.position.set(vs.cashOutX, 0.1, vs.cashOutZ);
      diveScene!.add(coMesh);
      diveMeshes.push(coMesh);
      break;
    }
  }
}

/** Spawn ICE constructs into the dive scene. */
function spawnICEWave(count: number, security: number): void {
  if (!diveScene || !diveNode) return;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = 18 + Math.random() * 16;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const type = security >= 2 && Math.random() < 0.3 ? EnemyType.FIREWALL : EnemyType.VIRUS;
    const hpMult = 0.6 + security * 0.15;
    const e = spawnEnemy(diveScene, x, z, type, hpMult, 0.9);
    e.isICE = true;
    e.moveSpeed = ICE_STEER_SPEED + security * 0.4 + Math.random() * 0.5;
    const mesh = makeIceMesh(e, diveNode.kind, diveSecurity);
    mesh.position.set(x, 0.6, z);
    diveScene.add(mesh);
    diveMeshes.push(mesh);
    iceMeshes.set(e, mesh);
  }
}

/**
 * Build a per-ICE ghost mesh. The arena's InstancedMesh flow is frozen
 * during the dive (RenderSystem does not run), so the enemy entities
 * spawnEnemy produces would be invisible without an attached mesh.
 * Geometry depends on enemyType; color matches the dive theme.
 */
function makeIceMesh(entity: Entity, kind: BreachKind, security: number): THREE.Object3D {
  const theme = THEME[kind] ?? THEME.depot;
  const color = theme.accent;
  const scale = 0.9 + security * 0.18;
  const type = entity.enemyType;
  const wireMat = new THREE.MeshBasicMaterial({
    color,
    wireframe: true,
    transparent: true,
    opacity: 0.9,
  });
  const fillMat = new THREE.MeshBasicMaterial({
    color: theme.gridAccent,
    transparent: true,
    opacity: 0.45,
  });
  let mesh: THREE.Object3D;
  if (type === EnemyType.FIREWALL) {
    // Boxy firewall: chunky cube, bigger than a virus
    const geo = new THREE.BoxGeometry(1.3 * scale, 1.3 * scale, 1.3 * scale);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, fillMat));
    g.add(new THREE.Mesh(geo, wireMat));
    mesh = g;
  } else if (type === EnemyType.WARDEN) {
    // Warden: tall crowned icosahedron (crown = small box on top)
    const g = new THREE.Group();
    const body = new THREE.IcosahedronGeometry(0.9 * scale, 0);
    g.add(new THREE.Mesh(body, fillMat));
    g.add(new THREE.Mesh(body, wireMat));
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(0.4 * scale, 0.4 * scale, 0.4 * scale),
      wireMat,
    );
    crown.position.y = 0.9 * scale;
    g.add(crown);
    mesh = g;
  } else {
    // Virus: spiky small icosahedron
    const geo = new THREE.IcosahedronGeometry(0.6 * scale, 0);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, fillMat));
    g.add(new THREE.Mesh(geo, wireMat));
    mesh = g;
  }
  return mesh;
}

/** Compute ambush horde size from dive state. */
function computeAmbushSize(): number {
  const overclock = diveOverclock;
  const trace = uiState.dive?.trace ?? 0;
  const elapsed = diveElapsed;
  let count =
    AMBUSH_BASE + Math.floor(trace / AMBUSH_TRACE_DIV) + Math.floor(elapsed / AMBUSH_TIME_DIV) * 2;
  count = Math.min(count, AMBUSH_CAP);
  if (overclock) count *= 2;
  count = Math.round(count * partySpawnMultiplier());
  return Math.max(1, count);
}

/** Spawn the exit ambush ring around the node's door position. */
function spawnAmbush(scene: THREE.Scene): void {
  const node = diveNode;
  if (!node) return;
  const count = computeAmbushSize();
  const cx = node.doorX;
  const cz = node.doorZ;
  const level = getCurrentLevel();
  const halfW = level.mapWidth / 2;
  const halfH = level.mapHeight / 2;

  announce('THE HORDE CLOSES IN');
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const x = clampToArena(cx + Math.cos(ang) * AMBUSH_RADIUS, halfW);
    const z = clampToArena(cz + Math.sin(ang) * AMBUSH_RADIUS, halfH);
    const type =
      i % 5 === 0 && uiState.dive && uiState.dive.trace > 60 ? EnemyType.WARDEN : EnemyType.VIRUS;
    const hpMult = 0.6;
    const speedMult = 1.0;
    const e = spawnEnemy(scene, x, z, type, hpMult, speedMult);
    e.moveSpeed = (e.moveSpeed ?? 1) * speedMult;
  }
}

/** Integrate player movement inside the dive (InputSystem + velocity→position). */
function movePlayerInDive(dt: number): THREE.Vector3 | null {
  InputSystem();
  for (const entity of world.with('isLocalPlayer', 'position', 'velocity', 'input')) {
    if (!entity.input || !entity.position || !entity.velocity) continue;
    const dx = entity.input.x ?? 0;
    const dy = entity.input.y ?? 0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0.001) {
      entity.velocity.set((dx / len) * DIVE_PLAYER_SPEED, 0, (dy / len) * DIVE_PLAYER_SPEED);
    } else {
      entity.velocity.set(0, 0, 0);
    }
    entity.position.x += entity.velocity.x * dt;
    entity.position.z += entity.velocity.z * dt;
    // Clamp within dive bounds
    const dist = Math.sqrt(entity.position.x ** 2 + entity.position.z ** 2);
    if (dist > DIVE_BOUNDS) {
      const scale = DIVE_BOUNDS / dist;
      entity.position.x *= scale;
      entity.position.z *= scale;
    }
    entity.position.y = 0.5;
    // RenderSystem (which normally copies entity.position → transform.position)
    // is frozen during the dive, so sync the visible mesh here too.
    if (entity.transform) entity.transform.position.copy(entity.position);
    return entity.position;
  }
  return null;
}

/** Set the camera for the dive scene (overhead 3/4 follow). */
function setDiveCamera(camera: THREE.Camera, playerPos: THREE.Vector3 | null): void {
  const px = playerPos?.x ?? 0;
  const pz = playerPos?.z ?? 0;
  camera.position.set(px, 28, pz + 18);
  camera.lookAt(px, 0, pz);
}

// ---------------------------------------------------------------------------
// Verb state tick
// ---------------------------------------------------------------------------

/** Tick the per-verb state machine. Returns 'win' | 'fail' | null (ongoing). */
function tickVerbState(dt: number, playerPos: THREE.Vector3 | null): 'win' | 'fail' | null {
  const vs = diveVerbState;
  if (!vs) return null;
  const px = playerPos?.x ?? 0;
  const pz = playerPos?.z ?? 0;

  switch (vs.verb) {
    case 'extraction': {
      vs.timer += dt;
      const dist = Math.sqrt(px ** 2 + pz ** 2);
      if (dist < 3) {
        vs.extractionProgress = Math.min(vs.extractionMax, vs.extractionProgress + dt * 10);
      }
      // Update HUD
      if (uiState.dive) {
        uiState.dive.progress = vs.extractionProgress;
        uiState.dive.progressMax = vs.extractionMax;
        uiState.dive.verbStage = dist < 3 ? 'DOWNLOADING' : 'STAND ON POINT';
        uiState.dive.objectiveText = `Extraction ${Math.floor(vs.extractionProgress)}%`;
      }
      if (vs.extractionProgress >= vs.extractionMax) return 'win';
      if (vs.timer >= vs.timerMax) return 'fail';
      return null;
    }
    case 'holdOverload': {
      vs.timer += dt;
      let allCharged = true;
      for (const pad of vs.pads) {
        if (!pad.charged) {
          const dist = Math.sqrt((px - pad.x) ** 2 + (pz - pad.z) ** 2);
          if (dist < 1.5) {
            pad.charged = true;
            announce(`PAD CHARGED ${vs.pads.filter((p) => p.charged).length}/${vs.padCount}`);
          }
          allCharged = false;
        }
      }
      if (allCharged && !vs.overloadActive) {
        vs.overloadActive = true;
        announce('OVERLOAD INITIATED');
      }
      if (vs.overloadActive) {
        vs.capacitorProgress = Math.min(vs.capacitorMax, vs.capacitorProgress + dt * 8);
      }
      if (uiState.dive) {
        uiState.dive.progress = vs.overloadActive
          ? vs.capacitorProgress
          : vs.pads.filter((p) => p.charged).length;
        uiState.dive.progressMax = vs.overloadActive ? vs.capacitorMax : vs.padCount;
        uiState.dive.verbStage = vs.overloadActive ? 'OVERLOADING' : 'CHARGING PADS';
        uiState.dive.objectiveText = vs.overloadActive
          ? `Overload ${Math.floor(vs.capacitorProgress)}%`
          : `Charge pads ${vs.pads.filter((p) => p.charged).length}/${vs.padCount}`;
      }
      if (vs.capacitorProgress >= vs.capacitorMax) return 'win';
      if (vs.timer >= vs.timerMax) return 'fail';
      return null;
    }
    case 'grabAndRun': {
      vs.timer += dt;
      for (const p of vs.pickups) {
        if (!p.collected) {
          const dist = Math.sqrt((px - p.x) ** 2 + (pz - p.z) ** 2);
          if (dist < 1.5) {
            p.collected = true;
            vs.collectedCount++;
            announce(`PICKUP ${vs.collectedCount}/${vs.totalCount}`);
          }
        }
      }
      if (vs.collectedCount >= vs.totalCount && !vs.exitActive) {
        vs.exitActive = true;
        announce('EXIT OPEN — REACH THE PAD');
        // Show exit pad mesh
        if (diveMeshes.length > 0) {
          const last = diveMeshes[diveMeshes.length - 1];
          if (last instanceof THREE.Mesh && last.geometry.type === 'CircleGeometry') {
            last.visible = true;
          }
        }
      }
      if (vs.exitActive) {
        const exitDist = Math.sqrt((px - vs.exitX) ** 2 + (pz - vs.exitZ) ** 2);
        if (exitDist < 2) return 'win';
      }
      if (uiState.dive) {
        uiState.dive.progress = vs.collectedCount;
        uiState.dive.progressMax = vs.totalCount;
        uiState.dive.verbStage = vs.exitActive ? 'GET TO EXIT' : 'COLLECT GEAR';
        uiState.dive.objectiveText = vs.exitActive
          ? 'Reach exit pad'
          : `Collect ${vs.collectedCount}/${vs.totalCount}`;
      }
      if (vs.timer >= vs.timerMax) return 'fail';
      return null;
    }
    case 'evasion': {
      vs.timer += dt;
      if (uiState.dive) {
        uiState.dive.progress = vs.timer;
        uiState.dive.progressMax = vs.timerMax;
        uiState.dive.verbStage = 'SURVIVE';
        uiState.dive.objectiveText = `Survive ${Math.max(0, Math.ceil(vs.timerMax - vs.timer))}s`;
      }
      if (vs.timer >= vs.timerMax) return 'win';
      return null;
    }
    case 'supplyRun': {
      vs.timer += dt;
      for (const p of vs.pickups) {
        if (!p.collected) {
          const dist = Math.sqrt((px - p.x) ** 2 + (pz - p.z) ** 2);
          if (dist < 1.5) {
            p.collected = true;
            vs.collected++;
            announce(`SUPPLY ${vs.collected}/${vs.needed}`);
          }
        }
      }
      if (uiState.dive) {
        uiState.dive.progress = vs.collected;
        uiState.dive.progressMax = vs.needed;
        uiState.dive.verbStage = 'COLLECTING';
        uiState.dive.objectiveText = `Supplies ${vs.collected}/${vs.needed}`;
      }
      if (vs.collected >= vs.needed) return 'win';
      if (vs.timer >= vs.timerMax) return 'fail';
      return null;
    }
    case 'gamble': {
      vs.timer += dt;
      vs.pushCooldown = Math.max(0, vs.pushCooldown - dt);
      const altarDist = Math.sqrt((px - vs.altarX) ** 2 + (pz - vs.altarZ) ** 2);
      const coDist = Math.sqrt((px - vs.cashOutX) ** 2 + (pz - vs.cashOutZ) ** 2);

      // Auto-push while near altar
      if (altarDist < 2 && vs.pushCooldown <= 0 && !vs.cashedOut) {
        vs.pushCooldown = 1.5;
        vs.stack++;
        vs.bustChance = Math.min(0.85, 0.1 + vs.stack * 0.08);
        const roll = Math.random();
        if (roll < vs.bustChance) {
          announce('BUST!');
          return 'fail';
        }
        announce(`STACK ${vs.stack}`);
      }
      // Cash out
      if (coDist < 2 && vs.stack > 0) {
        vs.cashedOut = true;
        return 'win';
      }
      if (uiState.dive) {
        uiState.dive.progress = vs.stack;
        uiState.dive.progressMax = 10;
        uiState.dive.verbStage = vs.stack === 0 ? 'PUSH AT ALTAR' : `STACK ${vs.stack}`;
        uiState.dive.objectiveText =
          vs.stack === 0 ? 'Approach altar to push' : `Stack ${vs.stack} — cash out at green pad`;
      }
      if (vs.timer >= vs.timerMax && vs.stack === 0) return 'fail';
      // If timer expires with stack > 0, auto-cash at half value (still a win)
      if (vs.timer >= vs.timerMax && vs.stack > 0) {
        vs.cashedOut = true;
        return 'win';
      }
      return null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enter a breach dive for the given (won) node.
 */
export function enterDive(node: BreachNode, overclock: boolean, security: number): void {
  if (uiState.dive) return;

  const built = buildDiveSceneFor(node.kind);
  diveScene = built.scene;
  diveMeshes = built.meshes;
  diveNode = node;
  diveOverclock = overclock;
  diveSecurity = security;
  diveElapsed = 0;
  diveHealth = 100 + security * 25;
  diveHealthMax = diveHealth;
  iceContactTimer = 0;

  // Init verb state + visuals
  diveVerbState = initVerbState(node.kind, security);
  spawnVerbVisuals(diveVerbState);

  // Spawn initial ICE
  const iceCount = security * 3 + 2;
  spawnICEWave(iceCount, security);

  // Reparent the local player's transform (its mesh group) from the arena
  // scene into the dive scene so the player is visible while diving. Stash
  // the arena-space position to restore on exit; reset to the dive origin.
  {
    const player = world.with('isLocalPlayer', 'position', 'transform').first;
    if (player?.transform && player.position) {
      playerTransformParent = player.transform.parent;
      stashedPlayerPosition = player.position.clone();
      if (playerTransformParent) playerTransformParent.remove(player.transform);
      diveScene.add(player.transform);
      player.transform.position.set(0, 0.5, 0);
      player.position.set(0, 0.5, 0);
    }
  }

  resetVirtualJoystick();
  haptics.select();
  announce('DIVE INITIATED');
  uiState.dive = {
    nodeId: node.id,
    kind: node.kind,
    name: node.name,
    icon: node.icon,
    color: '#' + node.color.toString(16).padStart(6, '0'),
    security,
    overclock,
    trace: 0,
    traceMax: TRACE_MAX,
    objectiveText: 'DIVE INITIATED',
    health: diveHealth,
    healthMax: diveHealthMax,
    progress: 0,
    progressMax: 100,
    verbStage: 'INITIATING',
  };
  uiState.diveTransition = 'enter';
  setTimeout(() => {
    if (uiState.diveTransition === 'enter') uiState.diveTransition = null;
  }, 450);
  bindKeys();
}

/**
 * Per-frame dive tick.
 */
export function BreachDiveSystem(
  dt: number,
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: DiveRenderer,
): void {
  const dive = uiState.dive;
  if (!dive || !diveScene) return;

  // Store arena scene ref for exitDive (may be called from key handler)
  arenaSceneRef = scene;

  diveElapsed += dt;

  // --- Trace meter tick ---
  const traceRate = getTraceRate(dive.kind, diveSecurity, diveVerbState);
  dive.trace = Math.min(dive.traceMax, dive.trace + dt * traceRate);

  // --- Universal trace backstop ---
  if (dive.trace >= dive.traceMax) {
    exitDive('fail');
    return;
  }

  // --- Player movement ---
  const playerPos = movePlayerInDive(dt);

  // --- Verb state tick ---
  if (diveVerbState) {
    const outcome = tickVerbState(dt, playerPos);
    if (outcome === 'win') {
      exitDive('win');
      return;
    }
    if (outcome === 'fail') {
      exitDive('fail');
      return;
    }
  }

  // --- ICE tick: steer + contact damage ---
  iceContactTimer = Math.max(0, iceContactTimer - dt);
  if (playerPos) {
    const px = playerPos.x;
    const pz = playerPos.z;
    const iceEntities = [...world.with('isEnemy', 'isICE', 'position', 'velocity')];
    for (const ice of iceEntities) {
      if (!ice.position || !ice.velocity) continue;
      const dx = px - ice.position.x;
      const dz = pz - ice.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      // Steer toward player
      if (dist > 0.01) {
        const speed = (ice.moveSpeed as number) ?? ICE_STEER_SPEED;
        ice.velocity.set((dx / dist) * speed, 0, (dz / dist) * speed);
      }
      ice.position.x += ice.velocity.x * dt;
      ice.position.z += ice.velocity.z * dt;
      // Sync ghost mesh to steered position (no separate per-frame world.with)
      const mesh = iceMeshes.get(ice);
      if (mesh) {
        mesh.position.set(ice.position.x, 0.6, ice.position.z);
        if (dist > 0.01) mesh.rotation.y = Math.atan2(dx, dz);
      }
      // Contact damage
      if (dist < ICE_CONTACT_DIST && iceContactTimer <= 0) {
        diveHealth -= ICE_CONTACT_DAMAGE;
        iceContactTimer = ICE_CONTACT_COOLDOWN;
        if (uiState.dive) uiState.dive.health = diveHealth;
        if (diveHealth <= 0) {
          announce('ICE TERMINATED CONNECTION');
          exitDive('fail');
          return;
        }
      }
    }
  }

  // --- Periodic ICE reinforcement ---
  const waveIdx = Math.floor(diveElapsed / ICE_WAVE_INTERVAL);
  const prevWaveIdx = Math.floor((diveElapsed - dt) / ICE_WAVE_INTERVAL);
  if (waveIdx > prevWaveIdx) {
    const extra = dive.kind === 'relay' ? 3 + diveSecurity : 1;
    spawnICEWave(extra, diveSecurity);
  }

  // --- Update shared HUD fields ---
  if (uiState.dive) {
    uiState.dive.health = diveHealth;
    uiState.dive.healthMax = diveHealthMax;
  }

  // --- Camera ---
  setDiveCamera(camera, playerPos);

  // --- Render ---
  // The arena's bloom pipeline (EffectComposer on WebGL2, node PostProcessing
  // on WebGPU) leaves an offscreen render target bound after its last frame.
  // On the WebGPU backend that stale target is NOT the screen, so a raw
  // renderer.render(diveScene) draws into it and the canvas keeps showing the
  // frozen last arena frame — the dive looks empty ("no enemies, nothing").
  // WebGL2's composer happens to leave the screen target bound, which is why
  // the dive rendered there but not under WebGPU. Force the screen target
  // before drawing so the dive presents on every backend.
  renderer.setRenderTarget?.(null);
  renderer.render(diveScene, camera);
}

/** Bind the ESC eject key once. */
function bindKeys(): void {
  if (keysBound || typeof window === 'undefined') return;
  keysBound = true;
  window.addEventListener('keydown', (e) => {
    if (!uiState.dive) return;
    if (e.code === 'Escape') exitDive('abort');
  });
}

/**
 * Exit the active dive and resolve it against the breach node.
 */
export function exitDive(outcome: 'win' | 'fail' | 'abort'): void {
  const node = diveNode;
  const dive = uiState.dive;
  if (!dive || !node) {
    teardownDiveScene();
    uiState.dive = null;
    return;
  }

  if (outcome === 'win') {
    const winOutcome: DiveOutcome = {
      overclock: diveOverclock,
      security: diveSecurity,
      trace: dive.trace,
      traceMax: dive.traceMax,
      elapsed: diveElapsed,
      verb: dive.kind as DiveOutcome['verb'],
    };
    completeBreachWin(node, winOutcome);
  } else {
    // Fail / abort: resolve the breach fail, then spawn ambush
    completeBreachFail(node);
    // Spawn ambush ring AFTER teardown but BEFORE clearing dive state
    // so announcement still has dive context if needed.
  }

  // Brief exit flash, then clear
  uiState.diveTransition = 'exit';
  setTimeout(() => {
    if (uiState.diveTransition === 'exit') uiState.diveTransition = null;
  }, 450);

  teardownDiveScene();

  if (outcome !== 'win' && arenaSceneRef) {
    spawnAmbush(arenaSceneRef);
  }

  uiState.dive = null;
  arenaSceneRef = null;
}

/**
 * Reset all dive system state for a no-reload restart. Tears down any
 * half-open dive scene (e.g. a restart triggered mid-dive), removes dive-local
 * ICE entities, and clears the shared `uiState.dive` / `diveTransition` flags.
 * Called from `resetBreachSystem` so a restart cleans both halves.
 */
export function resetBreachDiveSystem(): void {
  teardownDiveScene();
  arenaSceneRef = null;
  uiState.dive = null;
  uiState.diveTransition = null;
}

function teardownDiveScene(): void {
  // Bug B: ICE entities are dive-local illusions. Remove them from the world
  // BEFORE nulling diveScene so they don't bleed back into the arena (where
  // RenderSystem would draw them and EnemySystem would steer them). Use a
  // plain world.remove — these are NOT deaths, just cleanups (no death side
  // effects, no XP/loot, no score). The swap-remove in world.remove is O(1)
  // and never triggers handleEnemyDeath.
  for (const ice of [...world.with('isEnemy', 'isICE')]) {
    world.remove(ice);
  }

  // Reparent the local player's transform back to the arena scene graph (it
  // was moved into the dive scene on enter). Restore the stashed arena-space
  // position so the fighter reappears where it left off. Do this BEFORE
  // disposing the dive scene so the player's mesh isn't orphaned.
  if (playerTransformParent) {
    const player = world.with('isLocalPlayer', 'position', 'transform').first;
    if (player?.transform) {
      if (diveScene) diveScene.remove(player.transform);
      playerTransformParent.add(player.transform);
      if (stashedPlayerPosition) {
        player.position.copy(stashedPlayerPosition);
        player.transform.position.copy(stashedPlayerPosition);
        stashedPlayerPosition = null;
        // Re-sync the rigidBody too (PhysicsSystem owns it on the next arena tick).
        player.rigidBody?.setTranslation(
          { x: player.position.x, y: 0.5, z: player.position.z },
          true,
        );
      }
    }
  }
  playerTransformParent = null;

  if (diveScene) {
    disposeDiveScene(diveScene, diveMeshes);
    diveScene = null;
    diveMeshes = [];
  }
  // WeakMap has no .clear(), but the keys are dead entity references that
  // the GC will reap. No leak.
  diveNode = null;
  diveOverclock = false;
  diveSecurity = 0;
  diveElapsed = 0;
  diveVerbState = null;
  diveHealth = 100;
  diveHealthMax = 100;
  iceContactTimer = 0;
}

// Debug hook
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) {
  const params = new URLSearchParams(window.location.search);
  (window as unknown as { __dive: object }).__dive = {
    enterDive,
    exitDive,
    // Debug helper: synthesize a stub BreachNode of a given kind and enter
    // a dive. Useful for testing each themed scene in isolation. Combine
    // with `?dive-k=<kind>` in the URL to auto-enter on load (see below).
    enterDiveForKind: (kind: BreachKind) => {
      const node: BreachNode = {
        id: 'debug_' + kind,
        kind,
        name: kind.toUpperCase(),
        icon: '◆',
        color: 0xffffff,
        x: 0,
        z: 0,
        signY: 5,
        doorX: 0,
        doorZ: 0,
        dirX: 0,
        dirZ: 1,
        doorH: 3,
        cooldown: 0,
        doorMat: null,
        ringMat: null,
        sign: null,
        opened: false,
      };
      enterDive(node, false, 0);
    },
  };
  // Auto-enter a dive on load when `?dive-k=<kind>` is present. Gated by
  // `?debug` so it's invisible in normal play. Used for visual QA of each
  // themed scene without having to complete a full mini-game first.
  const diveKind = params.get('dive-k') as BreachKind | null;
  if (
    diveKind &&
    ['depot', 'armory', 'bank', 'relay', 'substation', 'stashden'].includes(diveKind)
  ) {
    setTimeout(() => {
      (
        window as unknown as { __dive: { enterDiveForKind: (k: BreachKind) => void } }
      ).__dive.enterDiveForKind(diveKind);
    }, 1500);
  }
}
