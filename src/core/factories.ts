import * as THREE from 'three';
import { world } from './world';
import { getDefaultStats } from './PlayerStats';
import { getCharacter } from './CharacterRegistry';
import { offerProtocolChoice, selectProtocol } from './ProtocolRegistry';
import { getDailyConfig } from './DailyManager';
import { WEAPONS, getWeaponStatsAtLevel } from './WeaponRegistry';
import { applyMaxMode } from './maxMode';
import { getTierForValue, bankXP, MAX_ACTIVE_XP } from './XPManager';
import { createDynamicBody, isRapierInitialized } from './RapierWorld';
import { uiState, announce } from './UIState.svelte';
import { corruptionHp, corruptionSpeed } from './corruption';
import { partyHpMultiplier } from './difficulty';
import { getCurrentLevel as getLevelConfig } from './LevelData';
import { getQualityProfile, isMobile } from './quality';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const PLAYER_RADIUS = 0.8;

// --- SHARED RESOURCES & GEOMETRY POOL ---
const shadowGeo = new THREE.CircleGeometry(0.4, 16);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 });

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const sphereGeometry = new THREE.SphereGeometry(1, 12, 12);
const cylinderYGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
const cylinderZGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
cylinderZGeometry.rotateX(Math.PI / 2);
const coneZGeometry = new THREE.ConeGeometry(1, 1, 8);
coneZGeometry.rotateX(Math.PI / 2);
const torusGeometry = new THREE.TorusGeometry(1, 0.03, 8, 24);
const octahedronGeometry = new THREE.OctahedronGeometry(1);
const icosahedronGeometry = new THREE.IcosahedronGeometry(1, 1);

// --- ENEMY DEFINITIONS (Restored) ---
export const EnemyType = {
  // Standard enemies
  GLITCH: 'glitch',
  VIRUS: 'virus',
  FIREWALL: 'firewall',
  // Elite enemies (drop chests)
  ENFORCER: 'enforcer', // Firewall Enforcer - blocks projectiles
  COLOSSUS: 'colossus', // Packet Flood Colossus - spawns trash
  WARDEN: 'warden', // Latency Warden - phase shifts
  // Mini-bosses (drop multiple chests)
  HYDRA: 'hydra', // Proxy Hydra - multi-node
  OVERSEER: 'overseer', // Black ICE Overseer - major boss
} as const;

// eslint-disable-next-line no-redeclare
export type EnemyType = (typeof EnemyType)[keyof typeof EnemyType];

type EnemyStats = { hp: number; speed: number; size: number; color: number; xp: number };

// Phase 1.97 (VS horde): fodder approaches faster and pays less XP — the
// quota system multiplies kill volume, so per-kill XP drops to keep the
// level-up cadence at the VS rhythm (~every 20-40s) instead of modal spam.
const ENEMY_STATS: Record<EnemyType, EnemyStats> = {
  // Standard enemies
  // P1.98 measured: at speed 1.7/1.1 the horde NEVER touched a kiting player
  // (harness: minHp 100 through a 215-enemy wave). VS fodder runs at roughly
  // measured band: 2.4/1.9 killed the kite bot in 6s, 1.7/1.1 never touched
  // it — 2.1/1.6 is the goldilocks bisection (see PHASE doc).
  [EnemyType.GLITCH]: { hp: 6, speed: 1.8, size: 1.2, color: 0xffffff, xp: 3 },
  [EnemyType.VIRUS]: { hp: 3, speed: 2.5, size: 0.9, color: 0xffffff, xp: 1 },
  [EnemyType.FIREWALL]: { hp: 80, speed: 0.6, size: 2.2, color: 0xffffff, xp: 14 },
  // Elite enemies
  [EnemyType.ENFORCER]: { hp: 120, speed: 0.7, size: 2.0, color: 0xffffff, xp: 25 },
  [EnemyType.COLOSSUS]: { hp: 300, speed: 0.35, size: 3.5, color: 0xffffff, xp: 50 },
  [EnemyType.WARDEN]: { hp: 70, speed: 1.7, size: 1.8, color: 0xffffff, xp: 20 },
  // Mini-bosses
  [EnemyType.HYDRA]: { hp: 500, speed: 0.45, size: 4.0, color: 0xffffff, xp: 90 },
  [EnemyType.OVERSEER]: { hp: 1200, speed: 0.28, size: 5.5, color: 0xffffff, xp: 180 },
};
export function spawnPlayer(
  scene: THREE.Scene,
  isLocal: boolean = true,
  connectionId: string = 'local',
  startX: number = 0,
  startZ: number = 0,
) {
  const playerGroup = new THREE.Group();
  playerGroup.position.set(startX, 0.5, startZ); // Floating at height 0.5
  scene.add(playerGroup);

  // Build the character-specific rig (Phase 1.75: every fighter has its own model).
  // Remote players start as CYPHER; applyCharacterModel swaps them on lobby sync.
  const characterId = isLocal ? uiState.selectedCharacter || 'cypher' : 'cypher';
  playerGroup.add(buildPlayerRig(characterId));

  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.45; // Match ground plane relative to group offset
  shadow.name = 'shadow';
  playerGroup.add(shadow);

  // 1. CREATE PLAYER with VS-style inventory
  const player = world.add({
    isPlayer: true,
    isLocalPlayer: isLocal,
    connectionId: connectionId,
    position: new THREE.Vector3(startX, 0.5, startZ),
    velocity: new THREE.Vector3(0, 0, 0),
    input: { x: 0, y: 0, isShooting: false },
    aimTarget: new THREE.Vector3(),
    transform: playerGroup,

    level: 1,
    xp: 0,
    xpMax: 100,
    score: 0,
    health: { current: 100, max: 100 },

    // VS-style inventory
    weaponSlots: [{ weaponId: 'pulse_repeater', level: 1 }],
    passiveSlots: [],
    stats: getDefaultStats(),
  });

  // 1b. CREATE RAPIER RIGID BODY for player (only if local player)
  if (isLocal && isRapierInitialized() && player.id !== undefined) {
    const { rigidBody, collider } = createDynamicBody(startX, startZ, PLAYER_RADIUS, player.id);
    player.rigidBody = rigidBody;
    player.collider = collider;
  }

  // 2. EQUIP STARTER WEAPON from registry (will be overridden on run start via initializePlayerForRun)
  const starterWeaponId = 'pulse_repeater';
  const starterWeapon = WEAPONS[starterWeaponId];
  const starterStats = getWeaponStatsAtLevel(starterWeaponId, 1)!;

  world.add({
    isWeapon: true,
    weaponId: starterWeaponId,
    ownerId: player.id,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),

    weapon: {
      cooldownTimer: 0,
      fireRate: starterStats.cooldown,
      damage: starterStats.damage,
      bulletSpeed: starterWeapon.baseSpeed,
      bulletColor: starterWeapon.color,
      bulletLifetime: starterWeapon.baseLifetime,
      category: starterWeapon.category, // For orbital weapon detection

      bulletWidth: starterWeapon.bulletWidth,
      bulletLength: starterWeapon.bulletLength,
      visualStyle: starterWeapon.visualStyle,

      bulletCount: starterStats.projectiles,
      bulletSpread: starterWeapon.baseSpread,
      knockback: starterWeapon.baseKnockback,
      bulletPierce: starterStats.pierce,
      bulletExplodeRadius: starterWeapon.explodeRadius,
    },
  });
}

// --- CHARACTER RIGS (Phase 1.75) ---
// Every fighter has its own procedurally-built model. All rigs share a naming
// convention (core, shell, leftWing/rightWing, leftThruster/rightThruster,
// fire cones, gyro rings, barrels, shieldShard_N) so RenderSystem's animation
// state machine — recoil, flinch, death power-down, level-up flourish, ult
// overdrive, banking — works on every model without knowing which character
// it is. Parts a rig doesn't have are simply absent (RenderSystem null-checks
// every lookup). Geometries come from the shared pool above; materials are
// per-player and disposed on rebuild.

interface RigPersonality {
  flameScale: number;
  gyroSpeed: number;
  coreScaleAbs: number;
  shardRadius: number;
  shardCount: number;
}

function stdMat(
  color: number,
  opts: {
    emissive?: number;
    emissiveIntensity?: number;
    roughness?: number;
    metalness?: number;
    transparent?: boolean;
    opacity?: number;
    wireframe?: boolean;
  } = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1.0,
    roughness: opts.roughness ?? 0.35,
    metalness: opts.metalness ?? 0.8,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1.0,
    wireframe: opts.wireframe ?? false,
  });
}

/** Glowing core sphere + optional wireframe shell cage. */
function addCore(
  parent: THREE.Object3D,
  color: number,
  scale: number,
  shell?: { geom: THREE.BufferGeometry; scale: number; color?: number; opacity?: number },
): void {
  const core = new THREE.Mesh(
    sphereGeometry,
    stdMat(color, { emissive: color, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.9 }),
  );
  core.scale.setScalar(scale);
  core.name = 'core';
  parent.add(core);

  if (shell) {
    const opacity = shell.opacity ?? 1;
    const shellMesh = new THREE.Mesh(
      shell.geom,
      stdMat(shell.color ?? 0x223344, {
        roughness: 0.2,
        metalness: 0.9,
        wireframe: true,
        transparent: opacity < 1,
        opacity,
      }),
    );
    shellMesh.scale.setScalar(shell.scale);
    shellMesh.name = 'shell';
    if (opacity < 1) shellMesh.userData.baseOpacity = opacity;
    parent.add(shellMesh);
  }
}

/** Thruster cylinder + double-layered flame cones, named for RenderSystem. */
function addEngine(
  parent: THREE.Object3D,
  side: 'left' | 'right',
  x: number,
  y: number,
  z: number,
  radius: number,
  length: number,
  accent: number,
  hullColor = 0x444455,
): void {
  const thruster = new THREE.Mesh(cylinderZGeometry, stdMat(hullColor, { roughness: 0.4 }));
  thruster.scale.set(radius, radius, length);
  thruster.position.set(x, y, z);
  thruster.name = `${side}Thruster`;
  parent.add(thruster);

  // Flame cones: local scale is overwritten per-frame by RenderSystem, so the
  // parent thruster scale determines the flame's world size per model.
  const inner = new THREE.Mesh(coneZGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  inner.scale.setScalar(0.5);
  inner.position.set(0, 0, -0.55);
  inner.name = `${side}FireInner`;
  thruster.add(inner);

  const outer = new THREE.Mesh(
    coneZGeometry,
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.7 }),
  );
  outer.scale.setScalar(0.8);
  outer.position.set(0, 0, -0.62);
  outer.name = `${side}FireOuter`;
  thruster.add(outer);
}

/** Spinning gyro/halo ring. */
function addRing(
  parent: THREE.Object3D,
  name: string,
  scale: number,
  color: number,
  rot: { x?: number; y?: number; z?: number } = {},
  intensity = 0.6,
): void {
  const ring = new THREE.Mesh(
    torusGeometry,
    stdMat(color, {
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.1,
      metalness: 0.9,
    }),
  );
  ring.scale.setScalar(scale);
  ring.rotation.set(rot.x ?? 0, rot.y ?? 0, rot.z ?? 0);
  ring.name = name;
  parent.add(ring);
}

/** Orbiting shard group (shape varies: octahedra, cubes/dice, drone pods). */
function addShards(
  parent: THREE.Object3D,
  count: number,
  size: number,
  color: number,
  geom: THREE.BufferGeometry = octahedronGeometry,
): void {
  const group = new THREE.Group();
  group.name = 'shieldGroup';
  const mat = stdMat(color, {
    emissive: color,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.75,
  });
  for (let i = 0; i < count; i++) {
    const shard = new THREE.Mesh(geom, mat);
    shard.scale.setScalar(size);
    shard.name = `shieldShard_${i}`;
    group.add(shard);
  }
  parent.add(group);
}

/** Simple named box helper (most hull plating is boxes). */
function addBox(
  parent: THREE.Object3D,
  mat: THREE.Material,
  sx: number,
  sy: number,
  sz: number,
  x = 0,
  y = 0,
  z = 0,
  rot: { x?: number; y?: number; z?: number } = {},
  name = '',
): THREE.Mesh {
  const mesh = new THREE.Mesh(boxGeometry, mat);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rot.x ?? 0, rot.y ?? 0, rot.z ?? 0);
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}

// CYPHER — balanced interceptor: the classic swept-wing drone
function buildCypherRig(c: THREE.Group, primary: number, accent: number): Partial<RigPersonality> {
  addCore(c, primary, 0.32, { geom: icosahedronGeometry, scale: 0.38 });

  const wingMat = stdMat(0x334455, { roughness: 0.3 });
  const tipMat = stdMat(primary, { emissive: primary, emissiveIntensity: 1.5 });
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.name = side < 0 ? 'leftWing' : 'rightWing';
    wing.position.set(0.42 * side, 0, -0.05);
    wing.userData.baseYaw = (side * Math.PI) / 8; // resting sweep for the tilt animation
    addBox(wing, wingMat, 0.35, 0.04, 0.25, 0.175 * side, 0, -0.05, { y: (side * Math.PI) / 8 });
    addBox(wing, tipMat, 0.04, 0.05, 0.28, 0.35 * side, 0, -0.05, { y: (side * Math.PI) / 8 });
    c.add(wing);
  }

  addEngine(c, 'left', -0.38, -0.08, -0.22, 0.09, 0.42, accent);
  addEngine(c, 'right', 0.38, -0.08, -0.22, 0.09, 0.42, accent);

  // Multi-segmented visor (forward eye system)
  const visorGroup = new THREE.Group();
  visorGroup.name = 'visorGroup';
  visorGroup.position.set(0, 0.06, 0.32);
  const visorMat = stdMat(primary, { emissive: primary, emissiveIntensity: 1.8 });
  addBox(visorGroup, visorMat, 0.36, 0.07, 0.07, 0, 0, 0, {}, 'mainVisor');
  const sensorMat = stdMat(0x223344, { roughness: 0.2 });
  addBox(visorGroup, sensorMat, 0.05, 0.05, 0.05, -0.2, 0, -0.03);
  addBox(visorGroup, sensorMat, 0.05, 0.05, 0.05, 0.2, 0, -0.03);
  c.add(visorGroup);

  const gyroGroup = new THREE.Group();
  gyroGroup.name = 'gyroGroup';
  addRing(gyroGroup, 'gyroHRing', 0.62, primary, { x: Math.PI / 2 }, 0.5);
  addRing(gyroGroup, 'gyroVRing', 0.56, accent, { y: Math.PI / 2 }, 0.7);
  c.add(gyroGroup);

  // Bottom twin gun barrels
  const weaponGroup = new THREE.Group();
  weaponGroup.name = 'weaponGroup';
  weaponGroup.position.set(0, -0.22, 0.08);
  const turretMat = stdMat(0x444455, { roughness: 0.4 });
  const turretBase = new THREE.Mesh(cylinderYGeometry, turretMat);
  turretBase.scale.set(0.1, 0.06, 0.1);
  weaponGroup.add(turretBase);
  const barrelMat = stdMat(0x111118, { roughness: 0.3, metalness: 0.9 });
  for (const side of [-1, 1]) {
    const barrel = new THREE.Mesh(cylinderZGeometry, barrelMat);
    barrel.scale.set(0.025, 0.025, 0.22);
    barrel.position.set(0.05 * side, -0.04, 0.08);
    barrel.name = side < 0 ? 'leftBarrel' : 'rightBarrel';
    weaponGroup.add(barrel);
  }
  c.add(weaponGroup);

  addShards(c, 3, 0.05, accent);
  return { coreScaleAbs: 0.32 };
}

// LASH — melee blade craft: forward-swept scythe wings, single hot engine
function buildLashRig(c: THREE.Group, primary: number, accent: number): Partial<RigPersonality> {
  addCore(c, primary, 0.28, { geom: octahedronGeometry, scale: 0.44 });

  const bladeMat = stdMat(0x2a2233, { roughness: 0.25, metalness: 0.9 });
  const edgeMat = stdMat(primary, { emissive: primary, emissiveIntensity: 1.6 });
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.name = side < 0 ? 'leftWing' : 'rightWing';
    wing.position.set(0.34 * side, 0, 0);
    // Scythe blade sweeps FORWARD — aggression reads instantly
    addBox(wing, bladeMat, 0.48, 0.03, 0.13, 0.2 * side, 0, 0.1, { y: (-side * Math.PI) / 5 });
    addBox(wing, edgeMat, 0.5, 0.015, 0.03, 0.2 * side, 0, 0.16, { y: (-side * Math.PI) / 5 });
    c.add(wing);
  }

  // Twin vertical tail fins in a V
  const finMat = stdMat(0x2a2233, { roughness: 0.3 });
  addBox(c, finMat, 0.03, 0.22, 0.16, -0.08, 0.1, -0.28, { z: 0.35 });
  addBox(c, finMat, 0.03, 0.22, 0.16, 0.08, 0.1, -0.28, { z: -0.35 });

  addEngine(c, 'left', 0, -0.06, -0.32, 0.1, 0.48, accent, 0x332a3c);

  // Front prongs (bob like twitching claws via the barrel animation)
  const prongMat = stdMat(primary, { emissive: primary, emissiveIntensity: 1.2 });
  for (const side of [-1, 1]) {
    const prong = new THREE.Mesh(cylinderZGeometry, prongMat);
    prong.scale.set(0.018, 0.018, 0.3);
    prong.position.set(0.07 * side, -0.04, 0.3);
    prong.name = side < 0 ? 'leftBarrel' : 'rightBarrel';
    c.add(prong);
  }

  addRing(c, 'gyroVRing', 0.5, accent, { y: Math.PI / 2 }, 0.8);
  addShards(c, 3, 0.045, accent);
  return { coreScaleAbs: 0.28, flameScale: 1.3, gyroSpeed: 1.4 };
}

// RAIL — industrial gunship: boxy hull, twin-rail cannon, heavy engines
function buildRailRig(c: THREE.Group, primary: number, accent: number): Partial<RigPersonality> {
  const hullMat = stdMat(0x2a3340, { roughness: 0.5, metalness: 0.7 });
  addBox(c, hullMat, 0.42, 0.16, 0.5); // main hull slab
  addBox(c, hullMat, 0.2, 0.1, 0.2, 0, 0.12, 0.1); // cabin

  addCore(c, primary, 0.2);
  const core = c.getObjectByName('core');
  if (core) core.position.set(0, 0.16, -0.14); // exposed reactor at the back

  // Twin-rail cannon on top (barrels pump alternately like pistons)
  const railMat = stdMat(0x1a2026, { roughness: 0.3, metalness: 0.95 });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(cylinderZGeometry, railMat);
    rail.scale.set(0.032, 0.032, 0.72);
    rail.position.set(0.05 * side, 0.2, 0.2);
    rail.name = side < 0 ? 'leftBarrel' : 'rightBarrel';
    c.add(rail);
  }
  const chargeMat = stdMat(primary, { emissive: primary, emissiveIntensity: 1.6 });
  addBox(c, chargeMat, 0.14, 0.05, 0.05, 0, 0.2, -0.12); // charge coupler glow

  // Wide flat stabilizer wings with emissive edge
  const wingMat = stdMat(0x2a3340, { roughness: 0.5 });
  const edgeMat = stdMat(primary, { emissive: primary, emissiveIntensity: 1.3 });
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.name = side < 0 ? 'leftWing' : 'rightWing';
    wing.position.set(0.3 * side, -0.02, -0.05);
    addBox(wing, wingMat, 0.34, 0.045, 0.3, 0.17 * side, 0, 0);
    addBox(wing, edgeMat, 0.03, 0.05, 0.32, 0.34 * side, 0, 0);
    c.add(wing);
  }

  addEngine(c, 'left', -0.17, -0.08, -0.3, 0.11, 0.44, accent, 0x333a44);
  addEngine(c, 'right', 0.17, -0.08, -0.3, 0.11, 0.44, accent, 0x333a44);

  addRing(c, 'gyroHRing', 0.56, accent, { x: Math.PI / 2 }, 0.45);
  addShards(c, 3, 0.05, accent);
  return { coreScaleAbs: 0.2, flameScale: 0.9, gyroSpeed: 0.7 };
}

// NOVA — area mage: a swollen star held by three spinning resonance rings
function buildNovaRig(c: THREE.Group, primary: number, accent: number): Partial<RigPersonality> {
  addCore(c, primary, 0.34, { geom: icosahedronGeometry, scale: 0.42 });

  addRing(c, 'gyroHRing', 0.72, primary, { x: Math.PI / 2 }, 0.7);
  addRing(c, 'gyroVRing', 0.64, accent, { y: Math.PI / 2 }, 0.7);
  addRing(c, 'gyroTRing', 0.56, primary, { x: Math.PI / 4, z: Math.PI / 4 }, 0.9);

  // Floating channeling pylons instead of wings (still bob via wing animation)
  const pylonMat = stdMat(accent, { emissive: accent, emissiveIntensity: 1.1 });
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.name = side < 0 ? 'leftWing' : 'rightWing';
    wing.position.set(0.52 * side, 0, 0);
    const pylon = new THREE.Mesh(octahedronGeometry, pylonMat);
    pylon.scale.set(0.07, 0.12, 0.07);
    wing.add(pylon);
    c.add(wing);
  }

  addEngine(c, 'left', -0.12, -0.14, -0.24, 0.06, 0.3, accent, 0x3a3348);
  addEngine(c, 'right', 0.12, -0.14, -0.24, 0.06, 0.3, accent, 0x3a3348);

  addShards(c, 4, 0.04, primary);
  return { coreScaleAbs: 0.34, flameScale: 0.8, gyroSpeed: 1.6, shardRadius: 0.68, shardCount: 4 };
}

// BYTE — drone commander: a satellite with dish, solar panels and drone cubes
function buildByteRig(c: THREE.Group, primary: number, accent: number): Partial<RigPersonality> {
  const bodyMat = stdMat(0x333322, { roughness: 0.4, metalness: 0.85 });
  const body = new THREE.Mesh(cylinderYGeometry, bodyMat);
  body.scale.set(0.2, 0.16, 0.2);
  c.add(body);

  addCore(c, primary, 0.15);
  const core = c.getObjectByName('core');
  if (core) core.position.set(0, 0, 0.22); // forward sensor eye

  // Uplink dish + antenna
  const dishMat = stdMat(0x445544, { roughness: 0.35 });
  const dish = new THREE.Mesh(coneZGeometry, dishMat);
  dish.scale.set(0.13, 0.13, 0.07);
  dish.position.set(0, 0.16, 0);
  dish.rotation.x = Math.PI / 2; // open side up
  c.add(dish);
  const antenna = new THREE.Mesh(cylinderYGeometry, dishMat);
  antenna.scale.set(0.008, 0.14, 0.008);
  antenna.position.set(0, 0.24, 0);
  c.add(antenna);
  const beacon = new THREE.Mesh(
    sphereGeometry,
    stdMat(primary, { emissive: primary, emissiveIntensity: 2.0 }),
  );
  beacon.scale.setScalar(0.025);
  beacon.position.set(0, 0.32, 0);
  c.add(beacon);

  // Solar panel wings
  const panelMat = stdMat(0x1a2a55, { roughness: 0.25, metalness: 0.9 });
  const frameMat = stdMat(primary, { emissive: primary, emissiveIntensity: 1.0 });
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.name = side < 0 ? 'leftWing' : 'rightWing';
    wing.position.set(0.24 * side, 0, 0);
    addBox(wing, panelMat, 0.34, 0.02, 0.2, 0.19 * side, 0, 0);
    addBox(wing, frameMat, 0.36, 0.012, 0.02, 0.19 * side, 0.011, 0);
    c.add(wing);
  }

  addEngine(c, 'left', -0.1, -0.1, -0.2, 0.055, 0.26, accent, 0x3a3a2a);
  addEngine(c, 'right', 0.1, -0.1, -0.2, 0.055, 0.26, accent, 0x3a3a2a);

  addRing(c, 'gyroHRing', 0.3, accent, { x: Math.PI / 2 }, 0.6);

  // The drone swarm: cubes, not shards
  addShards(c, 5, 0.05, primary, boxGeometry);
  return { coreScaleAbs: 0.15, flameScale: 0.85, gyroSpeed: 0.9, shardRadius: 0.6, shardCount: 5 };
}

// GHOST — speedster phantom: translucent needle dart, one long-burn engine
function buildGhostRig(c: THREE.Group, primary: number, accent: number): Partial<RigPersonality> {
  // Fuselage is the "shell": a stretched translucent octahedron
  const fuselageMat = stdMat(primary, {
    roughness: 0.15,
    metalness: 0.6,
    transparent: true,
    opacity: 0.35,
  });
  const fuselage = new THREE.Mesh(octahedronGeometry, fuselageMat);
  fuselage.scale.set(0.16, 0.1, 0.52);
  fuselage.name = 'shell';
  fuselage.userData.baseOpacity = 0.35;
  c.add(fuselage);

  addCore(c, primary, 0.16);
  const core = c.getObjectByName('core');
  if (core) core.position.set(0, 0.03, 0.16); // the eye, glowing through the hull

  const visorMat = stdMat(primary, { emissive: primary, emissiveIntensity: 2.2 });
  addBox(c, visorMat, 0.1, 0.025, 0.025, 0, 0.05, 0.34, {}, 'mainVisor');

  // Swept translucent fins
  const finMat = stdMat(primary, {
    roughness: 0.2,
    metalness: 0.5,
    transparent: true,
    opacity: 0.5,
  });
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.name = side < 0 ? 'leftWing' : 'rightWing';
    wing.position.set(0.14 * side, 0, -0.14);
    const fin = addBox(wing, finMat, 0.24, 0.018, 0.12, 0.12 * side, 0, -0.06, {
      y: (side * Math.PI) / 4.5,
    });
    fin.userData.baseOpacity = 0.5;
    c.add(wing);
  }

  addEngine(c, 'left', 0, -0.04, -0.36, 0.085, 0.5, accent, 0x3c3c48);

  addRing(c, 'gyroVRing', 0.34, accent, { y: Math.PI / 2 }, 0.9);

  addShards(c, 2, 0.035, primary);
  return {
    coreScaleAbs: 0.16,
    flameScale: 1.5,
    gyroSpeed: 1.2,
    shardRadius: 0.42,
    shardCount: 2,
  };
}

// TITAN — walking fortress: armored slab hull, pauldrons, dual siege cannons
function buildTitanRig(c: THREE.Group, primary: number, accent: number): Partial<RigPersonality> {
  const armorMat = stdMat(0x3a332c, { roughness: 0.55, metalness: 0.8 });
  const trimMat = stdMat(primary, { emissive: primary, emissiveIntensity: 1.2 });

  addBox(c, armorMat, 0.46, 0.24, 0.5); // main hull slab
  addBox(c, armorMat, 0.4, 0.14, 0.14, 0, 0.06, 0.3, { x: -0.35 }); // sloped glacis
  addBox(c, armorMat, 0.16, 0.1, 0.24, -0.3, 0.15, -0.05); // left pauldron
  addBox(c, armorMat, 0.16, 0.1, 0.24, 0.3, 0.15, -0.05); // right pauldron
  addBox(c, trimMat, 0.47, 0.02, 0.02, 0, 0.13, 0.18); // armor trim glow

  addCore(c, primary, 0.18);
  const core = c.getObjectByName('core');
  if (core) core.position.set(0, 0.02, 0.27); // reactor recessed in the glacis

  // Stub wings — barely wings at all, more like side armor skirts
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.name = side < 0 ? 'leftWing' : 'rightWing';
    wing.position.set(0.3 * side, -0.08, -0.02);
    addBox(wing, armorMat, 0.16, 0.08, 0.24, 0.1 * side, 0, 0);
    c.add(wing);
  }

  // Dual siege cannons under the glacis
  const cannonMat = stdMat(0x1c1a18, { roughness: 0.35, metalness: 0.95 });
  for (const side of [-1, 1]) {
    const cannon = new THREE.Mesh(cylinderZGeometry, cannonMat);
    cannon.scale.set(0.05, 0.05, 0.42);
    cannon.position.set(0.14 * side, -0.1, 0.22);
    cannon.name = side < 0 ? 'leftBarrel' : 'rightBarrel';
    c.add(cannon);
  }

  addEngine(c, 'left', -0.16, -0.02, -0.34, 0.12, 0.46, accent, 0x2e2a26);
  addEngine(c, 'right', 0.16, -0.02, -0.34, 0.12, 0.46, accent, 0x2e2a26);

  addRing(c, 'gyroHRing', 0.6, accent, { x: Math.PI / 2 }, 0.35);
  addShards(c, 3, 0.055, accent);
  return { coreScaleAbs: 0.18, flameScale: 0.85, gyroSpeed: 0.55 };
}

// FLUX — the gambler: nothing matches, dice orbit, rings wobble off-axis
function buildFluxRig(c: THREE.Group, primary: number, accent: number): Partial<RigPersonality> {
  addCore(c, primary, 0.28, { geom: icosahedronGeometry, scale: 0.4 });
  const shell = c.getObjectByName('shell');
  if (shell) shell.rotation.z = 0.3; // even the cage sits crooked

  const wingMat = stdMat(0x3c2233, { roughness: 0.3, metalness: 0.85 });
  const edgeMat = stdMat(primary, { emissive: primary, emissiveIntensity: 1.5 });

  // Big swept wing on the left...
  const leftWing = new THREE.Group();
  leftWing.name = 'leftWing';
  leftWing.position.set(-0.36, 0, -0.02);
  addBox(leftWing, wingMat, 0.44, 0.035, 0.2, -0.22, 0, -0.06, { y: -Math.PI / 7 });
  addBox(leftWing, edgeMat, 0.04, 0.045, 0.22, -0.42, 0, -0.06, { y: -Math.PI / 7 });
  c.add(leftWing);

  // ...small forward canard on the right
  const rightWing = new THREE.Group();
  rightWing.name = 'rightWing';
  rightWing.position.set(0.3, 0.02, 0.08);
  addBox(rightWing, wingMat, 0.18, 0.03, 0.11, 0.09, 0, 0.04, { y: -Math.PI / 9 });
  addBox(rightWing, edgeMat, 0.03, 0.04, 0.12, 0.18, 0, 0.04, { y: -Math.PI / 9 });
  c.add(rightWing);

  // Mismatched engines: one heavy, one barely holding on
  addEngine(c, 'left', -0.2, -0.06, -0.3, 0.105, 0.44, accent, 0x40283a);
  addEngine(c, 'right', 0.24, -0.1, -0.2, 0.05, 0.26, accent, 0x40283a);

  // Off-axis rings, different sizes — a gyroscope that never calibrated
  addRing(c, 'gyroHRing', 0.66, primary, { x: Math.PI / 2 + 0.25 }, 0.6);
  addRing(c, 'gyroVRing', 0.42, accent, { y: Math.PI / 2, x: 0.4 }, 0.8);

  // Two tumbling dice (cubes spin via the shard animation)
  addShards(c, 2, 0.065, accent, boxGeometry);
  return {
    coreScaleAbs: 0.28,
    flameScale: 1.1,
    gyroSpeed: 1.9,
    shardRadius: 0.5,
    shardCount: 2,
  };
}

/** Build the full character-specific model, animation personality attached. */
export function buildPlayerRig(characterId: string): THREE.Group {
  const container = new THREE.Group();
  container.name = 'mesh_container';

  const character = getCharacter(characterId);
  const primary = character.color;
  const accent = new THREE.Color(primary).offsetHSL(0.08, 0, 0.04).getHex();

  const personality: RigPersonality = {
    flameScale: 1,
    gyroSpeed: 1,
    coreScaleAbs: 0.32,
    shardRadius: 0.52,
    shardCount: 3,
  };

  let overrides: Partial<RigPersonality>;
  switch (characterId) {
    case 'lash':
      overrides = buildLashRig(container, primary, accent);
      break;
    case 'rail':
      overrides = buildRailRig(container, primary, accent);
      break;
    case 'nova':
      overrides = buildNovaRig(container, primary, accent);
      break;
    case 'byte':
      overrides = buildByteRig(container, primary, accent);
      break;
    case 'ghost':
      overrides = buildGhostRig(container, primary, accent);
      break;
    case 'titan':
      overrides = buildTitanRig(container, primary, accent);
      break;
    case 'flux':
      overrides = buildFluxRig(container, primary, accent);
      break;
    default:
      overrides = buildCypherRig(container, primary, accent);
      break;
  }

  Object.assign(personality, overrides);
  container.userData.theme = personality;
  return container;
}

/**
 * Swap a player's model in place for a (possibly different) character.
 * Disposes the old rig's per-player materials (geometries are pooled) and
 * invalidates RenderSystem's submesh cache so it re-traverses the new rig.
 */
export function applyCharacterModel(root: THREE.Object3D, characterId: string) {
  const old = root.getObjectByName('mesh_container');
  if (old) {
    old.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material && !Array.isArray(child.material)) {
        // If a hit flash is mid-swap, the current material is the shared
        // flash material — dispose the player's own stored one instead.
        const own = (child.userData.originalMaterial as THREE.Material) ?? child.material;
        own.dispose();
      }
    });
    root.remove(old);
  }
  root.add(buildPlayerRig(characterId));
  delete root.userData.cache;
}

/**
 * Initialize (or reset) the player and their starting stats/weapons at the start of a run.
 */
export function initializePlayerForRun(scene: THREE.Scene) {
  const player = world.with('isLocalPlayer', 'transform', 'health').first;
  if (!player) return;

  const characterId = uiState.selectedCharacter;
  const baseStats = getDefaultStats(); // Includes permanent upgrades bought from Shop

  // Initialize active run-specific states
  uiState.runRerolls = uiState.permanentUpgrades.rerolls || 0;
  uiState.runBanishes = uiState.permanentUpgrades.banishes || 0;
  uiState.bannedUpgradeIds = [];
  uiState.overloadCharge = 0;
  uiState.overloadActive = false;
  uiState.overloadTimer = 0;
  uiState.endlessMode = false;
  uiState.showVictoryChoice = false;
  uiState.unlocksThisRun = [];
  uiState.combo = 0;
  uiState.bestCombo = 0;
  uiState.activeProtocolId = '';

  // 1. Reset Position / Rapier Physics Translation
  player.position.set(0, 0.5, 0);
  if (player.transform) {
    player.transform.position.copy(player.position);
    player.transform.rotation.set(0, 0, 0);
  }
  if (player.rigidBody) {
    player.rigidBody.setTranslation({ x: 0, y: 0.5, z: 0 }, true);
    player.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }

  // 2. Clear Existing Weapons Owned by This Player
  const oldWeapons = Array.from(world.with('isWeapon', 'ownerId'));
  for (const w of oldWeapons) {
    if (w.ownerId === player.id) {
      world.remove(w);
    }
  }

  // 3. Clear Existing Orbitals Owned by This Player
  const oldOrbitals = Array.from(world.with('isOrbital', 'orbitalData'));
  for (const orb of oldOrbitals) {
    if (orb.orbitalData?.ownerId === player.id) {
      if (orb.transform) scene.remove(orb.transform);
      world.remove(orb);
    }
  }

  // 4. Character Configurations (data-driven — see CharacterRegistry)
  const character = getCharacter(characterId);
  const starterWeaponId = character.starterWeaponId;
  const charStats = { ...baseStats };
  const baseHp = character.baseHp;
  character.applyStats(charStats);

  const finalMaxHp = baseHp + baseStats.maxHealth;
  if (player.health) {
    player.health.max = finalMaxHp;
    player.health.current = finalMaxHp;
  }

  player.level = 1;
  player.xp = 0;
  player.xpMax = 100;
  player.score = 0;
  player.kills = 0;
  player.reviveProgress = 0;
  player.stats = charStats;

  player.weaponSlots = [{ weaponId: starterWeaponId, level: 1 }];
  player.passiveSlots = [];

  // Map splash: tell the player where they just dropped in
  announce(`ENTERING: ${getLevelConfig().name}`);

  // Rebuild the character-specific model (tears down the previous rig cleanly)
  if (player.transform) {
    applyCharacterModel(player.transform, characterId);
  }

  // Sync Svelte uiState
  uiState.health = { current: finalMaxHp, max: finalMaxHp };
  uiState.level = 1;
  uiState.xp = 0;
  uiState.xpMax = 100;
  uiState.score = 0;
  uiState.kills = 0;
  uiState.creditsCollected = 0;
  uiState.weaponSlots = player.weaponSlots;
  uiState.passiveSlots = player.passiveSlots;

  // Equip Starter Weapon
  const starterWeapon = WEAPONS[starterWeaponId];
  const starterStats = getWeaponStatsAtLevel(starterWeaponId, 1)!;
  world.add({
    isWeapon: true,
    weaponId: starterWeaponId,
    ownerId: player.id,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),

    weapon: {
      cooldownTimer: 0,
      fireRate: starterStats.cooldown,
      damage: starterStats.damage,
      bulletSpeed: starterWeapon.baseSpeed,
      bulletColor: starterWeapon.color,
      bulletLifetime: starterWeapon.baseLifetime,
      category: starterWeapon.category,

      bulletWidth: starterWeapon.bulletWidth,
      bulletLength: starterWeapon.bulletLength,
      visualStyle: starterWeapon.visualStyle,

      bulletCount: starterStats.projectiles,
      bulletSpread: starterWeapon.baseSpread,
      knockback: starterWeapon.baseKnockback,
      bulletPierce: starterStats.pierce,
      bulletExplodeRadius: starterWeapon.explodeRadius,
    },
  });

  // ?max stress-test: replace the single starter weapon with every weapon at
  // max level and make the player invincible.
  applyMaxMode(scene);

  // Data protocol: daily runs force the seeded protocol; everything else gets
  // a pick-1-of-3 modal. In co-op EACH player now picks their own protocol —
  // the MP loop never pauses on modals, so the world keeps simulating, and the
  // choice reaches the host through the regular stats sync.
  // Must run after stats/health are initialized — protocols modify both.
  if (!uiState.isMultiplayer && uiState.isDailyRun) {
    selectProtocol(getDailyConfig().protocolId);
  } else {
    offerProtocolChoice();
  }
}

/**
 * Spawn a physical cyber credit item
 */
export function spawnCredit(_scene: THREE.Scene, x: number, z: number, value: number = 1) {
  // Determine size based on value
  const size = value >= 50 ? 0.9 : value >= 10 ? 0.65 : 0.45;

  return world.add({
    isCredit: true,
    position: new THREE.Vector3(x, 0.3, z),
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      Math.random() * 5 + 3, // upward pop
      (Math.random() - 0.5) * 4,
    ),
    creditValue: value,
    size,
    rotationX: Math.random() * Math.PI,
    rotationY: Math.random() * Math.PI,
  });
}

// --- ENEMY VISUALS (Phase 1.8 bestiary) ---
// Every enemy type is one merged geometry pair: a SOLID layer (lit, standard
// material, baked vertex-color gradients) plus a GLOW layer (additive,
// unlit) that carries eyes, cores, seams and vents. Both layers render as
// InstancedMesh — the whole horde costs at most 2 draw calls per type, and
// geometry detail is paid once no matter how many enemies are alive.
export interface CachedGeom {
  solid: THREE.BufferGeometry;
  glow?: THREE.BufferGeometry;
  wire?: THREE.BufferGeometry; // legacy layer, kept for compatibility
}
export const cachedEnemyGeometries = new Map<string, CachedGeom>();

function getModelMatrix(
  pos: THREE.Vector3,
  scale: THREE.Vector3,
  rot?: THREE.Euler,
): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  if (rot) q.setFromEuler(rot);
  m.compose(pos, q, scale);
  return m;
}

function createColoredGeometry(
  geom: THREE.BufferGeometry,
  colorHex: number,
  matrix?: THREE.Matrix4,
): THREE.BufferGeometry {
  let g = geom.clone();
  if (matrix) {
    g.applyMatrix4(matrix);
  }
  if (g.index) {
    g = g.toNonIndexed();
  }
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color(colorHex);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Bake a vertical dark→hot vertex-color gradient (free richness at render time). */
function createGradientGeometry(
  geom: THREE.BufferGeometry,
  bottomHex: number,
  topHex: number,
  matrix?: THREE.Matrix4,
): THREE.BufferGeometry {
  let g = geom.clone();
  if (matrix) {
    g.applyMatrix4(matrix);
  }
  if (g.index) {
    g = g.toNonIndexed();
  }
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const span = Math.max(1e-5, bb.max.y - bb.min.y);
  const pos = g.attributes.position;
  const cBottom = new THREE.Color(bottomHex);
  const cTop = new THREE.Color(topHex);
  const tmp = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - bb.min.y) / span;
    tmp.copy(cBottom).lerp(cTop, t);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

// Tiny builder helpers so each design below reads as a parts list
type Parts = THREE.BufferGeometry[];
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const S3 = (s: number) => new THREE.Vector3(s, s, s);

export function pregenerateAllEnemyGeometries(): void {
  // 1. GLITCH — a torn fragment of corrupted data: jagged shard cluster with
  //    glow slivers that read as the render tearing itself apart.
  {
    const solid: Parts = [];
    const glow: Parts = [];
    const shards: [number, number, number, number, number, number, number, number, number][] = [
      // sx, sy, sz, px, py, pz, rx, ry, rz
      [0.3, 0.06, 0.18, 0, 0, 0, 0.4, 0.7, 0.2],
      [0.22, 0.05, 0.13, 0.12, 0.09, -0.06, -0.5, 1.9, 0.6],
      [0.26, 0.04, 0.1, -0.11, -0.07, 0.08, 0.9, -0.8, -0.4],
      [0.18, 0.05, 0.1, 0.05, -0.12, -0.1, -1.1, 0.3, 0.9],
      [0.14, 0.04, 0.09, -0.06, 0.14, 0.03, 0.2, -1.4, -0.7],
    ];
    for (const [sx, sy, sz, px, py, pz, rx, ry, rz] of shards) {
      solid.push(
        createGradientGeometry(
          boxGeometry,
          0x032213,
          0x00cc66,
          getModelMatrix(V3(px, py, pz), V3(sx, sy, sz), new THREE.Euler(rx, ry, rz)),
        ),
      );
    }
    solid.push(
      createGradientGeometry(
        octahedronGeometry,
        0x054427,
        0x00ee77,
        getModelMatrix(V3(0, 0, 0), new THREE.Vector3(0.12, 0.2, 0.09)),
      ),
    );
    // Glow: torn slivers + hot core + a trail of escaping fragments
    const slivers: [number, number, number, number][] = [
      [0.09, 0.05, 0.6, 0.4],
      [-0.12, -0.02, -0.5, -0.7],
      [0.02, 0.12, 0.2, -1.1],
      [-0.05, -0.11, -0.9, 0.8],
    ];
    for (const [px, py, rz, rx] of slivers) {
      glow.push(
        createColoredGeometry(
          boxGeometry,
          0x00ff88,
          getModelMatrix(
            V3(px, py, 0),
            new THREE.Vector3(0.018, 0.3, 0.018),
            new THREE.Euler(rx, 0, rz),
          ),
        ),
      );
    }
    glow.push(createColoredGeometry(boxGeometry, 0x99ffcc, getModelMatrix(V3(0, 0, 0), S3(0.08))));
    for (let i = 0; i < 3; i++) {
      glow.push(
        createColoredGeometry(
          octahedronGeometry,
          0x00ff88,
          getModelMatrix(V3((i % 2 ? -1 : 1) * 0.07, i * 0.05 - 0.05, -0.34 - i * 0.1), S3(0.028)),
        ),
      );
    }
    cachedEnemyGeometries.set(EnemyType.GLITCH, {
      solid: BufferGeometryUtils.mergeGeometries(solid),
      glow: BufferGeometryUtils.mergeGeometries(glow),
    });
  }

  // 2. VIRUS — a pathogen: asymmetric hot-tipped spikes around a sickly body,
  //    nucleus burning on the glow layer.
  {
    const solid: Parts = [];
    const glow: Parts = [];
    solid.push(
      createGradientGeometry(
        icosahedronGeometry,
        0x40001a,
        0xcc1140,
        getModelMatrix(V3(0, 0, 0), S3(0.26)),
      ),
    );
    const spikeDirs = [
      V3(0, 1, 1.618),
      V3(0, 1, -1.618),
      V3(0, -1, 1.618),
      V3(0, -1, -1.618),
      V3(1, 1.618, 0),
      V3(1, -1.618, 0),
      V3(-1, 1.618, 0),
      V3(-1, -1.618, 0),
      V3(1.618, 0, 1),
      V3(1.618, 0, -1),
      V3(-1.618, 0, 1),
      V3(-1.618, 0, -1),
    ];
    spikeDirs.forEach((v, i) => {
      v.normalize();
      const len = [0.13, 0.19, 0.16][i % 3]; // asymmetry: three spike lengths
      const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), v);
      const m = new THREE.Matrix4().compose(
        v.clone().multiplyScalar(0.26 + len * 0.5),
        q,
        new THREE.Vector3(0.018, len, 0.018),
      );
      solid.push(createColoredGeometry(cylinderYGeometry, 0x551133, m));
      glow.push(
        createColoredGeometry(
          octahedronGeometry,
          0xff66aa,
          getModelMatrix(v.clone().multiplyScalar(0.28 + len), S3(0.03)),
        ),
      );
    });
    glow.push(
      createColoredGeometry(sphereGeometry, 0xff2266, getModelMatrix(V3(0, 0, 0), S3(0.14))),
    );
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      glow.push(
        createColoredGeometry(
          octahedronGeometry,
          0xff88bb,
          getModelMatrix(
            V3(Math.cos(a) * 0.24, Math.sin(a * 2) * 0.1, Math.sin(a) * 0.24),
            S3(0.02),
          ),
        ),
      );
    }
    cachedEnemyGeometries.set(EnemyType.VIRUS, {
      solid: BufferGeometryUtils.mergeGeometries(solid),
      glow: BufferGeometryUtils.mergeGeometries(glow),
    });
  }

  // 3. FIREWALL — a literal gate, wider than tall: heavy pillars and lintel
  //    framing a burning grid inset on the glow layer.
  {
    const solid: Parts = [];
    const glow: Parts = [];
    for (const side of [-1, 1]) {
      solid.push(
        createGradientGeometry(
          boxGeometry,
          0x140a04,
          0x66290a,
          getModelMatrix(V3(0.48 * side, 0, 0), new THREE.Vector3(0.16, 0.66, 0.16)),
        ),
      );
      solid.push(
        createColoredGeometry(
          boxGeometry,
          0x1c1008,
          getModelMatrix(V3(0.48 * side, -0.36, 0), new THREE.Vector3(0.22, 0.08, 0.22)),
        ),
      );
      glow.push(
        createColoredGeometry(
          sphereGeometry,
          0xffaa00,
          getModelMatrix(V3(0.48 * side, 0.36, 0), S3(0.045)),
        ),
      );
    }
    solid.push(
      createGradientGeometry(
        boxGeometry,
        0x33150a,
        0x66290a,
        getModelMatrix(V3(0, 0.36, 0), new THREE.Vector3(1.1, 0.14, 0.18)),
      ),
    );
    for (const y of [-0.12, 0.04, 0.2]) {
      glow.push(
        createColoredGeometry(
          boxGeometry,
          0xff5500,
          getModelMatrix(V3(0, y, 0), new THREE.Vector3(0.8, 0.028, 0.05)),
        ),
      );
    }
    for (const x of [-0.27, -0.09, 0.09, 0.27]) {
      glow.push(
        createColoredGeometry(
          boxGeometry,
          0xff7700,
          getModelMatrix(V3(x, 0.03, 0), new THREE.Vector3(0.028, 0.5, 0.05)),
        ),
      );
    }
    for (const x of [-0.3, 0, 0.3]) {
      glow.push(
        createColoredGeometry(
          octahedronGeometry,
          0xffaa33,
          getModelMatrix(V3(x, 0.46, 0), S3(0.03)),
        ),
      );
    }
    cachedEnemyGeometries.set(EnemyType.FIREWALL, {
      solid: BufferGeometryUtils.mergeGeometries(solid),
      glow: BufferGeometryUtils.mergeGeometries(glow),
    });
  }

  // 4. ENFORCER — a riot knight: the body hides behind a big frontal energy
  //    shield whose glowing frame explains its projectile-blocking mechanic.
  {
    const solid: Parts = [];
    const glow: Parts = [];
    solid.push(
      createGradientGeometry(
        cylinderYGeometry,
        0x0e1a24,
        0x2e4054,
        getModelMatrix(V3(0, 0, -0.12), new THREE.Vector3(0.14, 0.3, 0.14)),
      ),
    );
    solid.push(
      createGradientGeometry(
        boxGeometry,
        0x16242f,
        0x33465a,
        getModelMatrix(V3(0, 0.22, -0.1), new THREE.Vector3(0.13, 0.1, 0.12)),
      ),
    );
    solid.push(
      createColoredGeometry(
        boxGeometry,
        0x0c141c,
        getModelMatrix(V3(0, 0, 0.2), new THREE.Vector3(0.56, 0.42, 0.05)),
      ),
    );
    for (const side of [-1, 1]) {
      solid.push(
        createColoredGeometry(
          cylinderZGeometry,
          0x1a2836,
          getModelMatrix(V3(0.17 * side, 0, 0.05), new THREE.Vector3(0.024, 0.024, 0.24)),
        ),
      );
      solid.push(
        createColoredGeometry(
          boxGeometry,
          0x22303e,
          getModelMatrix(V3(0.17 * side, 0.16, -0.1), new THREE.Vector3(0.1, 0.06, 0.1)),
        ),
      );
    }
    // Shield frame + chevron + visor: the glow layer sells the wall of light
    glow.push(
      createColoredGeometry(
        boxGeometry,
        0x00ffcc,
        getModelMatrix(V3(0, 0.21, 0.23), new THREE.Vector3(0.56, 0.025, 0.02)),
      ),
    );
    glow.push(
      createColoredGeometry(
        boxGeometry,
        0x00ffcc,
        getModelMatrix(V3(0, -0.21, 0.23), new THREE.Vector3(0.56, 0.025, 0.02)),
      ),
    );
    for (const side of [-1, 1]) {
      glow.push(
        createColoredGeometry(
          boxGeometry,
          0x00ffcc,
          getModelMatrix(V3(0.27 * side, 0, 0.23), new THREE.Vector3(0.025, 0.42, 0.02)),
        ),
      );
      glow.push(
        createColoredGeometry(
          boxGeometry,
          0x00ffcc,
          getModelMatrix(
            V3(-0.05 * side, -0.02, 0.235),
            new THREE.Vector3(0.16, 0.03, 0.02),
            new THREE.Euler(0, 0, 0.6 * side),
          ),
        ),
      );
    }
    glow.push(
      createColoredGeometry(
        boxGeometry,
        0x00ffcc,
        getModelMatrix(V3(0, 0.22, -0.03), new THREE.Vector3(0.1, 0.02, 0.02)),
      ),
    );
    glow.push(
      createColoredGeometry(
        octahedronGeometry,
        0x00ffcc,
        getModelMatrix(V3(0, -0.06, -0.3), S3(0.035)),
      ),
    );
    cachedEnemyGeometries.set(EnemyType.ENFORCER, {
      solid: BufferGeometryUtils.mergeGeometries(solid),
      glow: BufferGeometryUtils.mergeGeometries(glow),
    });
  }

  // 5. COLOSSUS — an industrial hulk: stacked segment tower with burning
  //    vents and the cargo pods it "sheds" as adds.
  {
    const solid: Parts = [];
    const glow: Parts = [];
    const segs: [number, number][] = [
      [0.34, -0.2],
      [0.28, 0],
      [0.22, 0.2],
    ];
    for (const [r, y] of segs) {
      solid.push(
        createGradientGeometry(
          cylinderYGeometry,
          0x0c0c0c,
          0x3a2415,
          getModelMatrix(V3(0, y, 0), new THREE.Vector3(r, 0.2, r)),
        ),
      );
    }
    solid.push(
      createColoredGeometry(
        cylinderYGeometry,
        0x151210,
        getModelMatrix(V3(0.1, 0.38, -0.06), new THREE.Vector3(0.07, 0.18, 0.07)),
      ),
    );
    for (const side of [-1, 1]) {
      solid.push(
        createGradientGeometry(
          boxGeometry,
          0x141210,
          0x33261a,
          getModelMatrix(V3(0.38 * side, -0.08, 0), new THREE.Vector3(0.16, 0.14, 0.22)),
        ),
      );
      // pod windows
      glow.push(
        createColoredGeometry(
          octahedronGeometry,
          0xffcc55,
          getModelMatrix(V3(0.38 * side, -0.05, 0.12), S3(0.02)),
        ),
      );
    }
    // vent slits at the two segment seams
    for (const [ring, y] of [
      [0.3, -0.1],
      [0.24, 0.1],
    ] as [number, number][]) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        glow.push(
          createColoredGeometry(
            boxGeometry,
            0xffaa22,
            getModelMatrix(
              V3(Math.cos(a) * ring, y, Math.sin(a) * ring),
              new THREE.Vector3(0.02, 0.1, 0.02),
            ),
          ),
        );
      }
    }
    glow.push(
      createColoredGeometry(
        octahedronGeometry,
        0xff8800,
        getModelMatrix(V3(0.1, 0.49, -0.06), S3(0.045)),
      ),
    );
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      glow.push(
        createColoredGeometry(
          octahedronGeometry,
          0xff9911,
          getModelMatrix(V3(Math.cos(a) * 0.35, -0.31, Math.sin(a) * 0.35), S3(0.03)),
        ),
      );
    }
    cachedEnemyGeometries.set(EnemyType.COLOSSUS, {
      solid: BufferGeometryUtils.mergeGeometries(solid),
      glow: BufferGeometryUtils.mergeGeometries(glow),
    });
  }

  // 6. WARDEN — an unstable prism caught permanently mid-teleport: crystal
  //    slices offset sideways with light leaking through the gaps.
  {
    const solid: Parts = [];
    const glow: Parts = [];
    const slices: [number, number][] = [
      [-0.15, -0.07],
      [0, 0.05],
      [0.15, -0.02],
    ];
    for (const [y, x] of slices) {
      solid.push(
        createGradientGeometry(
          octahedronGeometry,
          0x2a0026,
          0xff33cc,
          getModelMatrix(V3(x, y, 0), new THREE.Vector3(0.17, 0.13, 0.17)),
        ),
      );
    }
    for (const y of [-0.075, 0.075]) {
      glow.push(
        createColoredGeometry(
          boxGeometry,
          0x00ffff,
          getModelMatrix(V3(0, y, 0), new THREE.Vector3(0.24, 0.012, 0.24)),
        ),
      );
    }
    glow.push(
      createColoredGeometry(
        octahedronGeometry,
        0x00ffff,
        getModelMatrix(V3(0, 0.05, 0.19), S3(0.04)),
      ),
    );
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      glow.push(
        createColoredGeometry(
          octahedronGeometry,
          0xff33cc,
          getModelMatrix(V3(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5), S3(0.045)),
        ),
      );
    }
    cachedEnemyGeometries.set(EnemyType.WARDEN, {
      solid: BufferGeometryUtils.mergeGeometries(solid),
      glow: BufferGeometryUtils.mergeGeometries(glow),
    });
  }

  // 7. HYDRA — three linked serpent heads with burning eyes and a spine
  //    ridge; killing it should feel like decapitating a cluster.
  {
    const solid: Parts = [];
    const glow: Parts = [];
    const heads: [number, number, number, number][] = [
      [-0.3, 0, 0.04, 0.15],
      [0, 0.1, 0, 0.19],
      [0.3, 0, 0.04, 0.15],
    ];
    for (const [x, y, z, r] of heads) {
      solid.push(
        createGradientGeometry(
          icosahedronGeometry,
          0x22000a,
          0xcc1133,
          getModelMatrix(V3(x, y, z), S3(r)),
        ),
      );
      for (const side of [-1, 1]) {
        glow.push(
          createColoredGeometry(
            octahedronGeometry,
            0x00ffee,
            getModelMatrix(V3(x + 0.05 * side, y + 0.03, z + r * 0.8), S3(0.022)),
          ),
        );
      }
      glow.push(
        createColoredGeometry(
          boxGeometry,
          0xff3355,
          getModelMatrix(V3(x, y - 0.06, z + r * 0.8), new THREE.Vector3(0.06, 0.012, 0.012)),
        ),
      );
    }
    for (const side of [-1, 1]) {
      solid.push(
        createColoredGeometry(
          cylinderYGeometry,
          0x44000f,
          getModelMatrix(
            V3(0.15 * side, 0.05, 0.02),
            new THREE.Vector3(0.025, 0.28, 0.025),
            new THREE.Euler(0, 0, Math.PI / 2),
          ),
        ),
      );
      glow.push(
        createColoredGeometry(
          boxGeometry,
          0x00ffcc,
          getModelMatrix(V3(0.15 * side, 0.09, 0.02), new THREE.Vector3(0.24, 0.012, 0.012)),
        ),
      );
    }
    for (let i = 0; i < 5; i++) {
      const x = -0.24 + i * 0.12;
      solid.push(
        createColoredGeometry(
          octahedronGeometry,
          0x88112a,
          getModelMatrix(V3(x, 0.22 - Math.abs(x) * 0.3, 0), new THREE.Vector3(0.03, 0.05, 0.03)),
        ),
      );
    }
    cachedEnemyGeometries.set(EnemyType.HYDRA, {
      solid: BufferGeometryUtils.mergeGeometries(solid),
      glow: BufferGeometryUtils.mergeGeometries(glow),
    });
  }

  // 8. OVERSEER — the all-seeing eye: armored shell plates orbiting a huge
  //    iris that reads from across the arena.
  {
    const solid: Parts = [];
    const glow: Parts = [];
    solid.push(
      createColoredGeometry(sphereGeometry, 0x0e0216, getModelMatrix(V3(0, 0, -0.05), S3(0.3))),
    );
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      solid.push(
        createGradientGeometry(
          boxGeometry,
          0x150520,
          0x7722aa,
          getModelMatrix(
            V3(Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38),
            new THREE.Vector3(0.2, 0.34, 0.06),
            new THREE.Euler(0, -a + Math.PI / 2, 0),
          ),
        ),
      );
    }
    solid.push(
      createColoredGeometry(sphereGeometry, 0x05000a, getModelMatrix(V3(0, 0, 0.3), S3(0.1))),
    );
    glow.push(
      createColoredGeometry(sphereGeometry, 0xff33ff, getModelMatrix(V3(0, 0, 0.18), S3(0.2))),
    );
    glow.push(
      createColoredGeometry(
        torusGeometry,
        0xaa44ff,
        getModelMatrix(V3(0, 0, 0), S3(0.5), new THREE.Euler(Math.PI / 2, 0, 0)),
      ),
    );
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 8;
      glow.push(
        createColoredGeometry(
          octahedronGeometry,
          0xff66ff,
          getModelMatrix(V3(Math.cos(a) * 0.42, 0.28, Math.sin(a) * 0.42), S3(0.03)),
        ),
      );
    }
    cachedEnemyGeometries.set(EnemyType.OVERSEER, {
      solid: BufferGeometryUtils.mergeGeometries(solid),
      glow: BufferGeometryUtils.mergeGeometries(glow),
    });
  }
}

const enemySolidMaterials = new Map<string, THREE.MeshStandardMaterial>();
let enemyGlowMaterial: THREE.MeshBasicMaterial | null = null;
const enemyWireMaterials = new Map<string, THREE.MeshBasicMaterial>();

export function getEnemySolidMaterial(type: EnemyType): THREE.MeshStandardMaterial {
  let mat = enemySolidMaterials.get(type);
  if (!mat) {
    const EMISSIVE: Partial<Record<EnemyType, number>> = {
      [EnemyType.GLITCH]: 0x00ff88,
      [EnemyType.VIRUS]: 0xff0055,
      [EnemyType.FIREWALL]: 0xff5500,
      [EnemyType.ENFORCER]: 0x00ffcc,
      [EnemyType.COLOSSUS]: 0xffaa00,
      [EnemyType.WARDEN]: 0xd900ff,
      [EnemyType.HYDRA]: 0xff2244,
      [EnemyType.OVERSEER]: 0xaa44ff,
    };
    // With the env map lighting metals properly (medium+ tiers), armor can be
    // metallic again; without it (low tier) high metalness renders near-black.
    const tier = getQualityProfile().tier;
    const envLit = tier !== 'low';
    // Bloom (HIGH tier + desktop only) is what turns the faint solid emissive
    // into the neon look — it amplifies the emissive/glow into a bright halo.
    // Mobile never gets bloom (capped at medium tier, and bloom is desktop-only),
    // so with only a 0.15 wash the enemies render as near-black matte on the dark
    // arena and read as INVISIBLE. Where there's no bloom, self-light the body so
    // every enemy is clearly visible on its own.
    const hasBloom = tier === 'high' && !isMobile;
    mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.45,
      metalness: envLit ? 0.5 : 0.15,
      emissive: new THREE.Color(EMISSIVE[type] ?? 0x000000),
      emissiveIntensity: hasBloom ? 0.15 : 0.7,
    });
    enemySolidMaterials.set(type, mat);
  }
  return mat;
}

/** One shared additive material for every glow layer — hues live in vertex colors. */
export function getEnemyGlowMaterial(): THREE.MeshBasicMaterial {
  if (!enemyGlowMaterial) {
    enemyGlowMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }
  return enemyGlowMaterial;
}

export function getEnemyWireMaterial(type: EnemyType): THREE.MeshBasicMaterial {
  let mat = enemyWireMaterials.get(type);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
    });
    enemyWireMaterials.set(type, mat);
  }
  return mat;
}

// Elite/miniboss arrivals get a spawn portal ring (trash already has the
// scale-pop; portals for every spawn would churn meshes at horde rates).
const ELITE_PORTAL_COLORS: Partial<Record<EnemyType, number>> = {
  [EnemyType.ENFORCER]: 0x00ffcc,
  [EnemyType.COLOSSUS]: 0xffaa00,
  [EnemyType.WARDEN]: 0xff00cc,
  [EnemyType.HYDRA]: 0xff2244,
  [EnemyType.OVERSEER]: 0xaa44ff,
};
const portalGeo = new THREE.RingGeometry(0.18, 0.2, 24);

function spawnPortalFx(scene: THREE.Scene, x: number, z: number, type: EnemyType, size: number) {
  const color = ELITE_PORTAL_COLORS[type];
  if (color === undefined) return;
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(portalGeo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.08, z);
  scene.add(mesh);
  world.add({
    isParticle: true,
    position: new THREE.Vector3(x, 0.08, z),
    velocity: new THREE.Vector3(),
    transform: mesh,
    lifeTimer: 0,
    maxLife: 0.6,
    ringGrow: (size * 0.9) / 0.2 - 1, // expand to roughly the enemy's footprint
  });
}

export function spawnEnemy(
  _scene: THREE.Scene,
  x: number,
  z: number,
  type: EnemyType = EnemyType.GLITCH,
  // Phase 1.97: the spawner's wave HP curve (VS re-serves the same enemies
  // bulkier each minute); swarm bodies pass <1 so ring traps stay brittle
  hpMult: number = 1,
) {
  const stats = ENEMY_STATS[type];

  const corr = uiState.corruption;
  const maxHp = Math.max(
    1,
    Math.round(stats.hp * hpMult * corruptionHp(corr) * partyHpMultiplier()),
  );
  const moveSpeed = stats.speed * corruptionSpeed(corr);

  spawnPortalFx(_scene, x, z, type, stats.size);

  const enemy = world.add({
    isEnemy: true,
    enemyType: type,
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(0, 0, 0),
    health: { current: maxHp, max: maxHp },
    moveSpeed,
    size: stats.size,
    rotationY: 0,
    aimTarget: new THREE.Vector3(),
    xpValue: stats.xp,
    baseColor: stats.color,
    spawnAnimTimer: 0.35,
  });
  return enemy;
}

export function spawnXP(_scene: THREE.Scene, x: number, z: number, value: number) {
  // Check XP cap - bank instead of spawning if at limit
  const activeXPCount = world.count('isXP');
  if (activeXPCount >= MAX_ACTIVE_XP) {
    bankXP(value);
    return;
  }

  // Get tier based on value
  const tier = getTierForValue(value);

  // Small random eject velocity
  const angle = Math.random() * Math.PI * 2;
  const force = 1.5;
  const velocity = new THREE.Vector3(Math.cos(angle) * force, 3.0, Math.sin(angle) * force);

  return world.add({
    isXP: true,
    position: new THREE.Vector3(x, 0.5, z),
    velocity: velocity,
    xpValue: value,
    size: tier.size,
    rotationX: Math.random() * Math.PI,
    rotationY: Math.random() * Math.PI,
    particleColor: tier.color,
  });
}
