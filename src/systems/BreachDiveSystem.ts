// --- BREACH DIVE SYSTEM ---
// Owns the dive sub-scene that swaps in for the arena once a breach is WON.
// While `uiState.dive` is set, main.ts hands this system the whole frame: the
// arena's Input/Enemy/Weapon/Collision/Physics/Render systems are all frozen,
// so the dive runs its own movement, combat, objective logic and render pass.
//
// Per-building verbs live in `dive/DiveVerbs.ts`, the constructs in
// `dive/DiveICE.ts`, and the objective beacons in `dive/DiveMarkers.ts`. This
// file is the frame orchestrator and the arena↔dive boundary.
//
// THE CLOCK. There is exactly one: the trace meter. It fills over the verb's
// designed budget (shortened by security and overclock), and the HUD shows it
// as seconds remaining. Killing constructs and completing objective steps
// SCRUB trace back, floored at `TRACE_FLOOR_RATIO` of nominal progress so the
// clock can be stretched at most ~2x. Verbs no longer run private countdowns
// racing the trace — that model made every verb unwinnable at security >= 2
// and put the rootkit gate (security 3 + trace <= 35%) out of physical reach.

import * as THREE from 'three';
import { uiState } from '../core/UIState.svelte.ts';
import { buildDiveSceneFor, disposeDiveScene, tickDiveScene, THEME } from '../core/DiveScenes';
import {
  completeBreachWin,
  completeBreachFail,
  type BreachNode,
  type BreachKind,
  type DiveOutcome,
} from './BreachSystem';
import { InputSystem, resetVirtualJoystick, updateVirtualJoystick } from './InputSystem';
import { haptics } from '../core/haptics';
import { world, type Entity } from '../core/world';
import { partySpawnMultiplier } from '../core/difficulty';
import { getCurrentLevel } from '../core/LevelData';
import { spawnEnemy, EnemyType } from '../core/factories';
import { clearDamageNumbers } from './DamageNumberSystem';
import {
  playShoot,
  playHurt,
  playCollect,
  playExplosion,
  playLevelUp,
  playMenuBuy,
} from '../core/audio';
import {
  createVerb,
  baseTraceRate,
  TRACE_MAX,
  DIVE_ARENA_R,
  VERB_NAME,
  VERB_BRIEF,
  HORDE,
  type DiveVerb,
  type DiveCtx,
} from './dive/DiveVerbs';
import {
  createHazards,
  tickHazards,
  disposeHazards,
  addTurret,
  addPool,
  damageTurretsAt,
  liveTurretCount,
  type Hazards,
} from './dive/DiveHazards';
import { disposeMarkers, updateMarker, type DiveMarker } from './dive/DiveMarkers';
import {
  spawnIce,
  tickIce,
  damageIce,
  clearIce,
  nearestIce,
  countIceNear,
  liveIceCount,
  createIceRenderer,
  renderIce,
  disposeIceRenderer,
  MAX_DIVE_ICE,
  ICE_HIT_IFRAMES,
  type Ice,
  type IceRenderer,
} from './dive/DiveICE';

// Minimal structural type for the raw renderer. Both the WebGL and WebGPU
// renderers expose these two calls; the dive needs nothing else.
type DiveRenderer = {
  render: (scene: THREE.Scene, camera: THREE.Camera) => void;
  setRenderTarget?: (target: unknown | null) => void;
};

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

const DIVE_PLAYER_SPEED = 7.0;
/** Trace can never be scrubbed below this fraction of nominal progress. */
const TRACE_FLOOR_RATIO = 0.45;
/** Trace scrubbed per construct killed. */
const TRACE_KILL_SCRUB = 0.8;

const HP_BASE = 200;
const HP_PER_SECURITY = 55;
const PLAYER_KNOCKBACK = 5.0;

// Constructs. Pressure is a continuous ramping RATE (see HORDE in DiveVerbs),
// not fixed waves; security multiplies it.
const HORDE_SECURITY_RATE = 0.12;
const HORDE_SECURITY_INITIAL = 0.25;
/** Never spawn a construct closer than this to the player. */
const SPAWN_CLEARANCE = 9;

// --- Dive-local auto-fire ---
// The intrusion tool is NOT the arena loadout. It is deliberately short
// ranged, slower, and single-target-with-a-little-pierce, because the dive
// weapon used to reach 26 units and fire every 0.24s against constructs that
// died in one hit — the player out-damaged the entire room from off-screen
// and never had to engage with the space at all. You still kill plenty; you
// just cannot kill faster than the grid spawns.
const FIRE_INTERVAL = 0.3;
const SHOT_BASE_DAMAGE = 26;
const PROJECTILE_SPEED = 32;
const PROJECTILE_LIFE = 0.62;
const PROJECTILE_HIT_DIST = 1.05;
const AIM_RANGE = 14;
/** Constructs one shot can pass through — makes a dense pack worth shooting into. */
const SHOT_PIERCE = 1;
// (Barrier system removed.)

// Exit ambush (fail path)
const AMBUSH_RADIUS = 25;
const AMBUSH_CAP = 40;
const AMBUSH_BASE = 8;
const AMBUSH_TRACE_DIV = 6;
const AMBUSH_TIME_DIV = 5;

// Camera. Matches the arena rig's 35° FOV framing so the dive doesn't read as
// a different game; the mobile rig pulls back the same way CameraSystem does.
const CAM_HEIGHT = 44;
const CAM_DISTANCE = 13;
const CAM_HEIGHT_MOBILE = 60;
const CAM_DISTANCE_MOBILE = 20;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let diveScene: THREE.Scene | null = null;
let diveMeshes: THREE.Object3D[] = [];
let diveNode: BreachNode | null = null;
let diveOverclock = false;
let diveSecurity = 0;
let diveElapsed = 0;
let arenaSceneRef: THREE.Scene | null = null;
let keysBound = false;

let verb: DiveVerb | null = null;
let markers: DiveMarker[] = [];
let iceList: Ice[] = [];
let iceRenderer: IceRenderer | null = null;
let hazards: Hazards | null = null;
/** Fractional carry so a sub-1-per-frame spawn rate isn't rounded to nothing. */
let spawnBudget = 0;
let hordeCap = 120;
let hordeSpawned = 0;
let hordeBudget = Infinity;
/** Latest frame delta, so ctx.burnICE can apply a per-second rate. */
let lastDt = 1 / 60;
/** Insertion point — where the dive starts. */
let entryX = 0;
let entryZ = 0;
/** Live player position, mirrored so spawn helpers can respect clearance. */
let playerX = 0;
let playerZ = 0;

let traceRate = 1;
let traceValue = 0;
let diveHealth = HP_BASE;
let diveHealthMax = HP_BASE;
let playerIFrames = 0;
let hurtFlash = 0;
let fireCooldown = 0;
let radarTimer = 0;
/** Guards against re-entrant exits (a verb win inside the same frame as a trace fail). */
let exiting = false;

// Player reparent state: the local player's mesh group normally lives in the
// arena scene graph. It is moved into the dive scene on enter and back on exit.
let playerTransformParent: THREE.Object3D | null = null;
let stashedPlayerPosition: THREE.Vector3 | null = null;

interface DiveProjectile {
  mesh: THREE.Mesh;
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  dmg: number;
  pierce: number;
  /** Constructs already hit — a pierce shot must not re-hit the same body. */
  hits: Ice[];
}
let projectiles: DiveProjectile[] = [];
let projectileGeo: THREE.SphereGeometry | null = null;
let projectileMat: THREE.MeshBasicMaterial | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isMobileRig(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.innerWidth < 768 || 'ontouchstart' in window || navigator.maxTouchPoints > 0)
  );
}

function clampToArena(v: number, half: number): number {
  const lim = half - 2;
  return v < -lim ? -lim : v > lim ? lim : v;
}

/** Centre-screen dive banner. The arena HUD (which owns `announce`) is hidden. */
function banner(text: string): void {
  if (!uiState.dive) return;
  uiState.dive.banner = text;
  uiState.dive.bannerSeq++;
}

/** The player's current dive shot damage — ICE HP is derived from it. */
function shotDamage(): number {
  const player = world.with('isLocalPlayer', 'position').first;
  return SHOT_BASE_DAMAGE * (player?.stats?.might ?? 1);
}

function scrubTrace(points: number): void {
  // The floor rises with elapsed time, so scrubbing buys real seconds but can
  // never turn the dive into an unbounded farm.
  const floor = Math.min(TRACE_MAX, diveElapsed * traceRate * TRACE_FLOOR_RATIO);
  traceValue = Math.max(floor, traceValue - points);
}

function spikeTrace(points: number): void {
  traceValue = Math.min(TRACE_MAX, traceValue + points);
}

function spawnIceRing(n: number, cx: number, cz: number, minR: number, maxR: number): void {
  if (!diveScene || !diveNode) return;
  const dmg = shotDamage();
  for (let i = 0; i < n; i++) {
    if (liveIceCount(iceList) >= hordeCap) return;
    const a = (i / Math.max(1, n)) * Math.PI * 2 + Math.random() * 0.6;
    const r = minR + Math.random() * Math.max(0.001, maxR - minR);
    let x = cx + Math.cos(a) * r;
    let z = cz + Math.sin(a) * r;

    // Keep spawns inside the arena so constructs never materialise in the void.
    const d = Math.hypot(x, z);
    if (d > DIVE_ARENA_R - 1) {
      x = (x / d) * (DIVE_ARENA_R - 1);
      z = (z / d) * (DIVE_ARENA_R - 1);
    }

    // Never drop a construct on the player's head — with a horde this dense
    // that would be an undodgeable hit rather than a threat closing in.
    const pdx = x - playerX;
    const pdz = z - playerZ;
    const pd = Math.hypot(pdx, pdz);
    if (pd < SPAWN_CLEARANCE) {
      const k = pd > 0.01 ? SPAWN_CLEARANCE / pd : 1;
      x = playerX + (pd > 0.01 ? pdx : 1) * k;
      z = playerZ + (pd > 0.01 ? pdz : 0) * k;
      const nd = Math.hypot(x, z);
      if (nd > DIVE_ARENA_R - 1) {
        x = (x / nd) * (DIVE_ARENA_R - 1);
        z = (z / nd) * (DIVE_ARENA_R - 1);
      }
    }

    iceList.push(spawnIce(diveScene, diveNode.kind, diveSecurity, x, z, dmg));
  }
}

/**
 * Continuous horde pressure. The spawn rate ramps with elapsed time and is
 * accumulated in a fractional budget so a 4.5/s rate really produces 4.5
 * constructs per second rather than rounding away at 60fps.
 */
function tickHorde(dt: number): void {
  if (hordeSpawned >= hordeBudget) return;
  const cfg = HORDE[diveNode!.kind] ?? HORDE.depot;
  const rate =
    (cfg.rate + cfg.ramp * diveElapsed) *
    (1 + HORDE_SECURITY_RATE * diveSecurity) *
    (diveOverclock ? 1.3 : 1);
  spawnBudget += rate * dt;
  if (spawnBudget < 1) return;
  const n = Math.floor(spawnBudget);
  const clamped = Math.min(n, hordeBudget - hordeSpawned);
  if (clamped <= 0) return;
  spawnBudget -= n;
  spawnIceRing(clamped, 0, 0, DIVE_ARENA_R - 7, DIVE_ARENA_R - 1);
  hordeSpawned += clamped;
}

function diveSfx(name: 'pickup' | 'step' | 'alarm' | 'bust' | 'reveal'): void {
  switch (name) {
    case 'pickup':
      playCollect(1.15);
      haptics.select();
      break;
    case 'step':
      playCollect(0.85);
      haptics.select();
      break;
    case 'reveal':
      playMenuBuy();
      break;
    case 'alarm':
      playExplosion();
      haptics.hit();
      break;
    case 'bust':
      playExplosion();
      haptics.levelUp();
      break;
  }
}

// One reusable context object. The verb tick runs every frame, so allocating
// a fresh ctx (plus five closures) per frame would be pure GC churn in the
// dive's hot loop — see the hot-loop rule in AGENTS.md.
let ctx: DiveCtx | null = null;

/** Build the verb context once per dive. */
function initCtx(): DiveCtx {
  ctx = {
    scene: diveScene!,
    kind: diveNode!.kind,
    security: diveSecurity,
    overclock: diveOverclock,
    accent: (THEME[diveNode!.kind] ?? THEME.depot).accent,
    elapsed: 0,
    px: entryX,
    pz: entryZ,
    entryX,
    entryZ,
    iceNear: (x, z, r) => countIceNear(iceList, x, z, r),
    spawnICE: (n, minR = 12, maxR = 18) => spawnIceRing(n, 0, 0, minR, maxR),
    spawnICEAt: (n, x, z, radius) => spawnIceRing(n, x, z, radius * 0.75, radius),
    addTurret: (x, z) => {
      if (diveScene && hazards) addTurret(diveScene, hazards, x, z, shotDamage());
    },
    addPool: (x, z, radius) => {
      if (diveScene && hazards) addPool(diveScene, hazards, x, z, radius);
    },
    burnICE: (x, z, radius, dps) => {
      const amount = dps * lastDt;
      for (const ice of iceList) {
        if (ice.deathTimer > 0 || !ice.entity.position) continue;
        const dx = ice.entity.position.x - x;
        const dz = ice.entity.position.z - z;
        if (dx * dx + dz * dz > radius * radius) continue;
        if (damageIce(ice, amount)) scrubTrace(TRACE_KILL_SCRUB);
      }
    },
    scrub: scrubTrace,
    spike: spikeTrace,
    banner,
    sfx: diveSfx,
  };
  return ctx;
}

/** Refresh the per-frame fields of the shared context. */
function frameCtx(px: number, pz: number, dt: number): DiveCtx {
  lastDt = dt;
  const c = ctx ?? initCtx();
  c.elapsed = diveElapsed;
  c.px = px;
  c.pz = pz;
  return c;
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

/** Integrate player movement inside the dive. Returns the live position. */
function movePlayer(dt: number): { entity: Entity; pos: THREE.Vector3 } | null {
  InputSystem();
  const entity = world.with('isLocalPlayer', 'position', 'velocity', 'input').first;
  if (!entity || !entity.input || !entity.position || !entity.velocity) return null;

  const dx = entity.input.x ?? 0;
  const dy = entity.input.y ?? 0;
  const len = Math.hypot(dx, dy);
  // moveSpeed is a multiplier (1.0 = base); clamp so neither a stacked speed
  // build nor a Hardlight Shell turns the dive into a different game.
  const speed = DIVE_PLAYER_SPEED * Math.min(1.35, Math.max(0.8, entity.stats?.moveSpeed ?? 1));
  if (len > 0.001) {
    entity.velocity.set((dx / len) * speed, 0, (dy / len) * speed);
  } else {
    entity.velocity.set(0, 0, 0);
  }

  entity.position.x += entity.velocity.x * dt;
  entity.position.z += entity.velocity.z * dt;

  const dist = Math.hypot(entity.position.x, entity.position.z);
  if (dist > DIVE_ARENA_R) {
    const k = DIVE_ARENA_R / dist;
    entity.position.x *= k;
    entity.position.z *= k;
  }
  entity.position.y = 0.5;
  // RenderSystem normally copies position → transform; it is frozen here.
  if (entity.transform) entity.transform.position.copy(entity.position);
  return { entity, pos: entity.position };
}

/**
 * Idle rig life. RenderSystem owns the full choreography (banking, recoil,
 * death) but is frozen mid-dive, so replicate just the "it's alive" layer from
 * the same rig-part cache: gyro spin, wing bob, thruster flicker, core breath.
 */
function animateRig(entity: Entity, elapsed: number, dt: number): void {
  const cache = entity.transform?.userData?.cache as Record<string, THREE.Object3D> | undefined;
  if (!cache) return;
  const speed = entity.velocity ? entity.velocity.length() : 0;

  if (cache['gyroHRing']) cache['gyroHRing'].rotation.y += dt * 2.5;
  if (cache['gyroVRing']) cache['gyroVRing'].rotation.x += dt * 3.5;
  if (cache['gyroTRing']) cache['gyroTRing'].rotation.y += dt * 3.0;

  const maxTilt = Math.min(speed * 0.08, 0.4);
  const leftWing = cache['leftWing'];
  const rightWing = cache['rightWing'];
  if (leftWing) {
    leftWing.rotation.z = Math.sin(elapsed * 8) * 0.05;
    leftWing.rotation.y = (leftWing.userData.baseYaw ?? 0) - maxTilt;
  }
  if (rightWing) {
    rightWing.rotation.z = -Math.sin(elapsed * 8) * 0.05;
    rightWing.rotation.y = (rightWing.userData.baseYaw ?? 0) + maxTilt;
  }

  const flicker = 0.85 + Math.sin(elapsed * 25) * 0.15;
  const speedScale = 1 + Math.min(speed * 0.15, 0.5);
  for (const k of ['leftFireInner', 'leftFireOuter', 'rightFireInner', 'rightFireOuter'] as const) {
    const flame = cache[k];
    if (flame) flame.scale.set(flicker, flicker, flicker * speedScale);
  }

  const core = cache['core'];
  if (core) {
    if (core.userData.baseScale === undefined) core.userData.baseScale = core.scale.x || 1;
    const base = core.userData.baseScale as number;
    core.scale.setScalar(base * (1 + 0.04 * Math.sin(elapsed * 3)));
  }
}

// ---------------------------------------------------------------------------
// Dive-local combat
// ---------------------------------------------------------------------------

function tickFiring(dt: number, player: Entity | null, px: number, pz: number): void {
  fireCooldown = Math.max(0, fireCooldown - dt);
  if (fireCooldown > 0 || !diveScene) return;
  const target = nearestIce(iceList, px, pz, AIM_RANGE);
  if (!target || !target.entity.position) return;

  const dx = target.entity.position.x - px;
  const dz = target.entity.position.z - pz;
  const d = Math.hypot(dx, dz) || 1;
  // Face the shot — RenderSystem's facing logic is frozen during the dive.
  if (player?.transform) player.transform.rotation.y = Math.atan2(dx, dz);

  if (!projectileGeo) projectileGeo = new THREE.SphereGeometry(0.26, 8, 8);
  if (!projectileMat) {
    projectileMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }
  const mesh = new THREE.Mesh(projectileGeo, projectileMat);
  mesh.position.set(px, 0.6, pz);
  diveScene.add(mesh);

  projectiles.push({
    mesh,
    x: px,
    z: pz,
    vx: (dx / d) * PROJECTILE_SPEED,
    vz: (dz / d) * PROJECTILE_SPEED,
    life: PROJECTILE_LIFE,
    dmg: shotDamage(),
    pierce: SHOT_PIERCE,
    hits: [],
  });
  // Cooldown is a multiplier (lower = faster), clamped so a maxed build can't
  // trivialise the dive and a fresh one isn't unplayably slow.
  const cd = Math.min(1.3, Math.max(0.45, player?.stats?.cooldown ?? 1));
  fireCooldown = FIRE_INTERVAL * cd;
  playShoot();
}

function tickProjectiles(dt: number): void {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.life -= dt;
    p.mesh.position.set(p.x, 0.6, p.z);

    let consumed = p.life <= 0;
    if (!consumed) {
      for (const ice of iceList) {
        if (ice.deathTimer > 0 || !ice.entity.position) continue;
        if (p.hits.includes(ice)) continue;
        const dx = ice.entity.position.x - p.x;
        const dz = ice.entity.position.z - p.z;
        if (dx * dx + dz * dz <= PROJECTILE_HIT_DIST * PROJECTILE_HIT_DIST) {
          if (damageIce(ice, p.dmg)) scrubTrace(TRACE_KILL_SCRUB);
          // Pierce: a shot punches through a couple of bodies, which is what
          // makes firing into a packed horde feel worth doing at all.
          p.hits.push(ice);
          if (p.hits.length > p.pierce) {
            consumed = true;
            break;
          }
        }
      }
      // Turrets share the projectile sweep; a shot that connects with one is
      // always spent (they are hard cover, not bodies to punch through).
      if (!consumed && hazards) {
        const t = damageTurretsAt(hazards, p.x, p.z, PROJECTILE_HIT_DIST + 0.6, p.dmg);
        if (t.hit) {
          if (t.killed) {
            scrubTrace(8);
            banner('EMPLACEMENT DOWN');
            playExplosion();
          }
          consumed = true;
        }
      }
    }
    if (consumed) {
      if (diveScene) diveScene.remove(p.mesh);
      projectiles.splice(i, 1);
    }
  }
}

function clearProjectiles(): void {
  if (diveScene) for (const p of projectiles) diveScene.remove(p.mesh);
  projectiles = [];
}

// ---------------------------------------------------------------------------
// Camera + radar
// ---------------------------------------------------------------------------

function setDiveCamera(camera: THREE.Camera, px: number, pz: number): void {
  const mobile = isMobileRig();
  camera.position.set(
    px,
    mobile ? CAM_HEIGHT_MOBILE : CAM_HEIGHT,
    pz + (mobile ? CAM_DISTANCE_MOBILE : CAM_DISTANCE),
  );
  camera.lookAt(px, 0, pz);
}

/**
 * Publish a compact radar frame: objective and construct positions relative to
 * the player, normalised to the radar disc. This is what makes the dive
 * legible — the camera can only show a slice of the arena, and previously the
 * player had no way at all to find an off-screen objective.
 */
const RADAR_RANGE = DIVE_ARENA_R * 2;
function updateRadar(px: number, pz: number): void {
  const dive = uiState.dive;
  if (!dive) return;
  // Packed triples: [nx, nz, kind] where kind 0=objective 1=active 2=exit 3=ICE
  const blips: number[] = [];

  const push = (x: number, z: number, kind: number) => {
    const dx = (x - px) / RADAR_RANGE;
    const dz = (z - pz) / RADAR_RANGE;
    const d = Math.hypot(dx, dz);
    // Clamp to the rim so off-radar contacts still read as a bearing.
    const k = d > 0.5 ? 0.5 / d : 1;
    blips.push(dx * k * 2, dz * k * 2, kind);
  };

  if (verb) {
    for (const m of verb.markers) {
      if (m.collected || m.hidden || m.popTimer > 0) continue;
      push(m.x, m.z, m.shape === 'exit' ? 2 : m.state === 'active' ? 1 : 0);
    }
  }
  let iceShown = 0;
  for (const ice of iceList) {
    if (ice.deathTimer > 0 || !ice.entity.position || iceShown >= 22) continue;
    push(ice.entity.position.x, ice.entity.position.z, 3);
    iceShown++;
  }
  dive.radar = blips;
}

// ---------------------------------------------------------------------------
// Fail ambush
// ---------------------------------------------------------------------------

function computeAmbushSize(): number {
  let count =
    AMBUSH_BASE +
    Math.floor(traceValue / AMBUSH_TRACE_DIV) +
    Math.floor(diveElapsed / AMBUSH_TIME_DIV) * 2;
  count = Math.min(count, AMBUSH_CAP);
  if (diveOverclock) count *= 2;
  count = Math.round(count * partySpawnMultiplier());
  return Math.max(1, count);
}

/** Spawn the exit ambush ring around the node's door. */
function spawnAmbush(scene: THREE.Scene): void {
  const node = diveNode;
  if (!node) return;
  const count = computeAmbushSize();
  const level = getCurrentLevel();
  const halfW = level.mapWidth / 2;
  const halfH = level.mapHeight / 2;
  const elite = traceValue > 60;

  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const x = clampToArena(node.doorX + Math.cos(ang) * AMBUSH_RADIUS, halfW);
    const z = clampToArena(node.doorZ + Math.sin(ang) * AMBUSH_RADIUS, halfH);
    const type = i % 5 === 0 && elite ? EnemyType.WARDEN : EnemyType.VIRUS;
    spawnEnemy(scene, x, z, type, 0.6, 1.0);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enter a breach dive for the given (won) node.
 *
 * @param arenaScene the arena scene to eject back into. Captured here rather
 *                   than on the first tick, so an immediate ESC still spawns
 *                   the fail ambush instead of silently skipping it.
 */
export function enterDive(
  node: BreachNode,
  overclock: boolean,
  security: number,
  arenaScene: THREE.Scene | null = null,
): void {
  if (uiState.dive) return;

  arenaSceneRef = arenaScene;
  const built = buildDiveSceneFor(node.kind);
  diveScene = built.scene;
  diveMeshes = built.meshes;
  diveNode = node;
  diveOverclock = overclock;
  diveSecurity = security;
  diveElapsed = 0;
  exiting = false;

  traceRate = baseTraceRate(node.kind, security, overclock);
  traceValue = 0;
  diveHealth = HP_BASE + security * HP_PER_SECURITY;
  diveHealthMax = diveHealth;
  playerIFrames = 0;
  hurtFlash = 0;
  fireCooldown = 0;
  radarTimer = 0;
  spawnBudget = 0;
  hordeSpawned = 0;

  // Insertion point out on the rim. Every verb starts here, so reaching the
  // objective requires crossing the full arena.
  const entryAngle = Math.random() * Math.PI * 2;
  entryX = Math.cos(entryAngle) * (DIVE_ARENA_R - 3);
  entryZ = Math.sin(entryAngle) * (DIVE_ARENA_R - 3);
  playerX = entryX;
  playerZ = entryZ;

  const cfg = HORDE[node.kind] ?? HORDE.depot;
  hordeCap = Math.min(MAX_DIVE_ICE, Math.round(cfg.cap * (1 + 0.08 * security)));
  hordeBudget = Math.round(hordeCap * 1.5 + cfg.initial);
  hazards = createHazards();
  iceRenderer = createIceRenderer(diveScene, node.kind);

  // Reparent the local player's mesh group into the dive scene and stash its
  // arena-space position for the exit.
  {
    const player = world.with('isLocalPlayer', 'position', 'transform').first;
    if (player?.transform && player.position) {
      playerTransformParent = player.transform.parent;
      stashedPlayerPosition = player.position.clone();
      if (playerTransformParent) playerTransformParent.remove(player.transform);
      diveScene.add(player.transform);
      player.transform.position.set(entryX, 0.5, entryZ);
      player.position.set(entryX, 0.5, entryZ);
    }
  }

  uiState.dive = {
    nodeId: node.id,
    kind: node.kind,
    name: node.name,
    verb: VERB_NAME[node.kind] ?? 'INTRUSION',
    brief: VERB_BRIEF[node.kind] ?? '',
    icon: node.icon,
    color: '#' + node.color.toString(16).padStart(6, '0'),
    security,
    overclock,
    trace: 0,
    traceMax: TRACE_MAX,
    secondsLeft: TRACE_MAX / traceRate,
    traceFloor: 0,
    objectiveText: '',
    stage: '',
    note: '',
    health: diveHealth,
    healthMax: diveHealthMax,
    progress: 0,
    progressMax: 100,
    iceCount: 0,
    turretCount: 0,
    hurt: 0,
    banner: '',
    bannerSeq: 0,
    radar: [],
  };

  // Build the verb (spawns its markers) now that the ctx can be made.
  verb = createVerb(node.kind, initCtx());
  markers = verb.markers;
  uiState.dive.stage = verb.stage;
  uiState.dive.objectiveText = verb.text;
  uiState.dive.note = verb.note;
  uiState.dive.progress = verb.progress;
  uiState.dive.progressMax = verb.progressMax;

  // Opening pressure: the room already has a crowd in it when you drop in.
  spawnIceRing(
    Math.round(cfg.initial * (1 + HORDE_SECURITY_INITIAL * security)),
    0,
    0,
    10,
    DIVE_ARENA_R - 1,
  );

  // Arena damage numbers are DOM nodes ticked by a system that is about to be
  // frozen — without this they hang over the dive for its whole duration.
  clearDamageNumbers();
  resetVirtualJoystick();
  haptics.select();
  banner(VERB_BRIEF[node.kind] ?? 'DIVE INITIATED');

  uiState.diveTransition = 'enter';
  setTimeout(() => {
    if (uiState.diveTransition === 'enter') uiState.diveTransition = null;
  }, 450);
  bindKeys();
}

/** Per-frame dive tick. Owns the entire frame while a dive is active. */
export function BreachDiveSystem(
  dt: number,
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: DiveRenderer,
): void {
  const dive = uiState.dive;
  if (!dive || !diveScene || !diveNode) return;

  // Normally captured in enterDive; re-assert it in case the dive was opened
  // by a debug hook with no scene to hand.
  if (!arenaSceneRef) arenaSceneRef = scene;
  diveElapsed += dt;
  const time = diveElapsed;

  // --- player ---
  const moved = movePlayer(dt);
  const player = moved?.entity ?? null;
  let px = moved?.pos.x ?? 0;
  let pz = moved?.pos.z ?? 0;
  playerX = px;
  playerZ = pz;

  // --- trace clock ---
  const mult = verb?.traceMult ?? 1;
  traceValue = Math.min(TRACE_MAX, traceValue + dt * traceRate * mult);

  // --- horde pressure ---
  tickHorde(dt);

  // --- constructs ---
  playerIFrames = Math.max(0, playerIFrames - dt);
  hurtFlash = Math.max(0, hurtFlash - dt);
  const armor = player?.stats?.armor ?? 0;
  const hit = tickIce(iceList, dt, px, pz, DIVE_ARENA_R, playerIFrames);
  if (hit.damage > 0) {
    // Armor is flat reduction, same contract as the arena — a tanky build
    // should survive noticeably longer inside a dive too.
    diveHealth -= Math.max(1, hit.damage - armor);
    playerIFrames = ICE_HIT_IFRAMES;
    hurtFlash = 0.35;
    playHurt();
    haptics.hit();
    // Knock the player off the construct so a pack can't pin them in place.
    if (player?.position) {
      player.position.x -= hit.knockX * PLAYER_KNOCKBACK * 0.12;
      player.position.z -= hit.knockZ * PLAYER_KNOCKBACK * 0.12;
      if (player.transform) player.transform.position.copy(player.position);
      px = player.position.x;
      pz = player.position.z;
    }
  }

  // --- hazards: turrets, corrosion pools ---
  if (hazards) {
    const hz = tickHazards(hazards, diveScene, dt, time, px, pz, playerIFrames);
    if (hz.impact > 0) {
      diveHealth -= Math.max(1, hz.impact - armor);
      hurtFlash = 0.35;
      playHurt();
      haptics.hit();
    }
    if (hz.dot > 0) {
      diveHealth -= Math.max(0, hz.dot - armor * dt);
      hurtFlash = Math.max(hurtFlash, 0.12);
    }
    playerX = px;
    playerZ = pz;
  }

  // --- scene dressing ---
  tickDiveScene(diveMeshes, dt, time);

  // --- verb ---
  let outcome: 'win' | 'fail' | null = null;
  if (verb) {
    outcome = verb.tick(frameCtx(px, pz, dt), dt);
    for (const m of markers) updateMarker(m, dt, time);
  }

  // --- combat ---
  tickFiring(dt, player, px, pz);
  tickProjectiles(dt);
  if (player) animateRig(player, time, dt);

  // Reinforcements are continuous now — see tickHorde above.

  // --- HUD ---
  dive.trace = traceValue;
  dive.traceFloor = Math.min(TRACE_MAX, diveElapsed * traceRate * TRACE_FLOOR_RATIO);
  dive.secondsLeft = Math.max(0, (TRACE_MAX - traceValue) / (traceRate * mult));
  dive.health = diveHealth;
  dive.healthMax = diveHealthMax;
  dive.hurt = hurtFlash;
  dive.iceCount = liveIceCount(iceList);
  dive.turretCount = hazards ? liveTurretCount(hazards) : 0;
  if (verb) {
    dive.stage = verb.stage;
    dive.objectiveText = verb.text;
    dive.note = verb.note;
    dive.progress = verb.progress;
    dive.progressMax = verb.progressMax;
  }
  radarTimer -= dt;
  if (radarTimer <= 0) {
    radarTimer = 1 / 15; // 15Hz is plenty for a radar and keeps Svelte quiet
    updateRadar(px, pz);
  }

  // --- horde render: six instanced draw calls for the whole crowd ---
  if (iceRenderer) renderIce(iceRenderer, iceList, time);

  // --- camera ---
  setDiveCamera(camera, px, pz);

  // --- render ---
  // The arena's bloom pipeline leaves an offscreen render target bound after
  // its last frame. On WebGPU that target is not the screen, so a raw
  // renderer.render() would draw the dive into it and the canvas would keep
  // showing the frozen last arena frame. Force the screen target first.
  renderer.setRenderTarget?.(null);
  renderer.render(diveScene, camera);

  // --- resolution (last, so the final frame is always presented) ---
  if (outcome === 'win') {
    exitDive('win');
    return;
  }
  if (outcome === 'fail' || diveHealth <= 0) {
    banner(diveHealth <= 0 ? 'ICE TERMINATED CONNECTION' : 'OBJECTIVE FAILED');
    exitDive('fail');
    return;
  }
  if (traceValue >= TRACE_MAX) {
    banner('TRACE COMPLETE — EJECTED');
    exitDive('fail');
  }
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

/** Eject from the dive (HUD button / ESC). Counts as a fail. */
export function ejectDive(): void {
  if (uiState.dive) exitDive('abort');
}

/** Exit the active dive and resolve it against the breach node. */
export function exitDive(outcome: 'win' | 'fail' | 'abort'): void {
  if (exiting) return;
  exiting = true;

  const node = diveNode;
  const dive = uiState.dive;
  if (!dive || !node) {
    teardownDiveScene();
    uiState.dive = null;
    exiting = false;
    return;
  }

  if (outcome === 'win') {
    playLevelUp();
    haptics.reward();
    completeBreachWin(node, {
      overclock: diveOverclock,
      security: diveSecurity,
      trace: traceValue,
      traceMax: TRACE_MAX,
      elapsed: diveElapsed,
      verb: node.kind as DiveOutcome['verb'],
      bonus: verb?.bonus ?? 0,
    });
  } else {
    completeBreachFail(node);
  }

  uiState.diveTransition = 'exit';
  setTimeout(() => {
    if (uiState.diveTransition === 'exit') uiState.diveTransition = null;
  }, 450);

  teardownDiveScene();

  if (outcome !== 'win' && arenaSceneRef) spawnAmbush(arenaSceneRef);

  uiState.dive = null;
  arenaSceneRef = null;
  exiting = false;
}

/**
 * Reset all dive state for a no-reload restart. Tears down a half-open dive
 * scene, removes dive-local constructs, and clears the shared dive flags.
 * Called from `resetBreachSystem`.
 */
export function resetBreachDiveSystem(): void {
  exiting = false;
  teardownDiveScene();
  arenaSceneRef = null;
  uiState.dive = null;
  uiState.diveTransition = null;
}

function teardownDiveScene(): void {
  if (diveScene) {
    // Constructs are dive-local illusions — remove them from the world BEFORE
    // the scene goes so they can't bleed back into the arena (where
    // RenderSystem would draw them and EnemySystem would steer them).
    clearIce(iceList);
    clearProjectiles();
    disposeMarkers(diveScene, markers);
    if (iceRenderer) disposeIceRenderer(diveScene, iceRenderer);
    if (hazards) disposeHazards(diveScene, hazards);
  }
  iceList = [];
  iceRenderer = null;
  hazards = null;
  markers = [];
  verb = null;
  spawnBudget = 0;

  // Reparent the player's mesh group back into the arena scene graph BEFORE
  // disposing the dive scene, so it is never orphaned.
  if (playerTransformParent) {
    const player = world.with('isLocalPlayer', 'position', 'transform').first;
    if (player?.transform) {
      if (diveScene) diveScene.remove(player.transform);
      playerTransformParent.add(player.transform);
      if (stashedPlayerPosition) {
        player.position.copy(stashedPlayerPosition);
        player.transform.position.copy(stashedPlayerPosition);
        // Re-sync the rigid body; PhysicsSystem owns it from the next arena tick.
        player.rigidBody?.setTranslation(
          { x: player.position.x, y: 0.5, z: player.position.z },
          true,
        );
      }
    }
  }
  playerTransformParent = null;
  stashedPlayerPosition = null;

  if (diveScene) {
    disposeDiveScene(diveScene, diveMeshes);
    diveScene = null;
    diveMeshes = [];
  }

  diveNode = null;
  diveOverclock = false;
  diveSecurity = 0;
  diveElapsed = 0;
  traceValue = 0;
  traceRate = 1;
  diveHealth = HP_BASE;
  diveHealthMax = HP_BASE;
  playerIFrames = 0;
  hurtFlash = 0;
  fireCooldown = 0;
  ctx = null;
}

// Debug hook
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) {
  const params = new URLSearchParams(window.location.search);
  (window as unknown as { __dive: object }).__dive = {
    enterDive,
    exitDive,
    /** Synthesize a stub node of a given kind and dive into it. */
    enterDiveForKind: (kind: BreachKind, security: number = 0, overclock: boolean = false) => {
      const node: BreachNode = {
        id: 'debug_' + kind,
        kind,
        name: kind.toUpperCase(),
        icon: '◆',
        color: (THEME[kind] ?? THEME.depot).accent,
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
      enterDive(node, overclock, security);
    },
    /**
     * HEADLESS BALANCE HARNESS (?debug only).
     *
     * Steps the dive at a fixed timestep with a scripted pilot that walks
     * straight at the current objective, so difficulty can be MEASURED rather
     * than eyeballed: how full does the room get, how long does the verb take,
     * does a competent player actually clear it. Steering goes through
     * `updateVirtualJoystick` — the same seam mobile uses — so the simulated
     * player is driven exactly like a real one.
     *
     * Returns the outcome plus a per-second trace of the horde curve.
     */
    sim: (maxSeconds: number = 90, pilot: boolean = true, invuln: boolean = false) => {
      if (!uiState.dive) return { error: 'no active dive' };
      const dt = 1 / 60;
      const cam = new THREE.PerspectiveCamera(35, 16 / 9, 2, 600);
      const noop = { render: () => {}, setRenderTarget: () => {} };
      const stubScene = arenaSceneRef ?? new THREE.Scene();
      const samples: string[] = [];
      let t = 0;
      let peakIce = 0;
      let nextSample = 0;

      while (t < maxSeconds && uiState.dive) {
        if (pilot) {
          // Walk at the nearest live objective; fall back to the arena centre.
          let tx = 0;
          let tz = 0;
          let bestD = Infinity;
          for (const m of verb?.markers ?? []) {
            if (m.collected || m.hidden || m.popTimer > 0) continue;
            if (m.state === 'done') continue; // already satisfied
            // Strictly prefer whatever the verb has lit, the way a player
            // reading the HUD would; distance only breaks ties within a tier.
            const d = (m.x - playerX) ** 2 + (m.z - playerZ) ** 2;
            // An open exit outranks everything: banking what you have is a
            // real strategy, and the gamble verb has no other stopping rule.
            const rank = m.shape === 'exit' ? -1e6 : m.state === 'active' ? 0 : 1e6;
            if (d + rank < bestD) {
              bestD = d + rank;
              tx = m.x;
              tz = m.z;
            }
          }
          let vx = tx - playerX;
          let vz = tz - playerZ;

          const len = Math.hypot(vx, vz) || 1;
          updateVirtualJoystick(vx / len, vz / len);
        }
        BreachDiveSystem(dt, stubScene, cam, noop);
        // Invulnerable runs answer "is the route achievable inside the trace
        // budget" without the damage model masking the result.
        if (invuln) diveHealth = diveHealthMax;
        t += dt;
        peakIce = Math.max(peakIce, liveIceCount(iceList));
        if (t >= nextSample) {
          nextSample += 5;
          samples.push(
            `t=${t.toFixed(0)}s ice=${liveIceCount(iceList)} hp=${Math.round(diveHealth)} ` +
              `trace=${Math.round(traceValue)}% prog=${verb?.progress?.toFixed?.(0) ?? '-'}/${verb?.progressMax ?? '-'}`,
          );
        }
      }
      resetVirtualJoystick();
      return {
        resolvedIn: +t.toFixed(1),
        stillRunning: !!uiState.dive,
        peakIce,
        samples,
      };
    },

    /** Live dive telemetry for balance checks. */
    stats: () => ({
      elapsed: diveElapsed,
      trace: traceValue,
      traceRate,
      secondsLeft: uiState.dive?.secondsLeft ?? 0,
      ice: liveIceCount(iceList),
      hp: diveHealth,
      stage: verb?.stage,
      progress: verb ? `${verb.progress}/${verb.progressMax}` : '',
    }),
  };
  const diveKind = params.get('dive-k') as BreachKind | null;
  if (
    diveKind &&
    ['depot', 'armory', 'bank', 'relay', 'substation', 'stashden'].includes(diveKind)
  ) {
    setTimeout(() => {
      (
        window as unknown as { __dive: { enterDiveForKind: (k: BreachKind, s?: number) => void } }
      ).__dive.enterDiveForKind(diveKind, Number(params.get('dive-s') ?? 0));
    }, 1500);
  }
}
