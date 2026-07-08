import * as THREE from 'three';
import { world } from './world';
import { getDefaultStats } from './PlayerStats';
import { getCharacter } from './CharacterRegistry';
import { offerProtocolChoice, selectProtocol } from './ProtocolRegistry';
import { getDailyConfig } from './DailyManager';
import { WEAPONS, getWeaponStatsAtLevel } from './WeaponRegistry';
import { getTierForValue, bankXP, MAX_ACTIVE_XP } from './XPManager';
import { createDynamicBody, isRapierInitialized } from './RapierWorld';
import { uiState } from './UIState.svelte';
import { partyHpMultiplier } from './difficulty';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// Player/enemy collision radii
const PLAYER_RADIUS = 0.8;
const ENEMY_RADIUS = 0.6;

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

const ENEMY_STATS: Record<EnemyType, EnemyStats> = {
  // Standard enemies
  [EnemyType.GLITCH]: { hp: 12, speed: 0.8, size: 2.0, color: 0xffffff, xp: 10 },
  [EnemyType.VIRUS]: { hp: 5, speed: 1.2, size: 1.5, color: 0xffffff, xp: 5 },
  [EnemyType.FIREWALL]: { hp: 150, speed: 0.5, size: 3.5, color: 0xffffff, xp: 30 },
  // Elite enemies
  [EnemyType.ENFORCER]: { hp: 200, speed: 0.6, size: 3.0, color: 0xffffff, xp: 40 },
  [EnemyType.COLOSSUS]: { hp: 500, speed: 0.3, size: 5.0, color: 0xffffff, xp: 80 },
  [EnemyType.WARDEN]: { hp: 120, speed: 1.5, size: 2.5, color: 0xffffff, xp: 35 },
  // Mini-bosses
  [EnemyType.HYDRA]: { hp: 800, speed: 0.4, size: 6.0, color: 0xffffff, xp: 150 },
  [EnemyType.OVERSEER]: { hp: 2000, speed: 0.25, size: 8.0, color: 0xffffff, xp: 300 },
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

// --- CACHE & TYPES ---
// --- GEOMETRY PRE-MERGING FOR ENEMY TYPES ---
export interface CachedGeom {
  solid: THREE.BufferGeometry;
  wire?: THREE.BufferGeometry;
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

function pregenerateAllEnemyGeometries(): void {
  // 1. GLITCH
  const glitchSolidParts: THREE.BufferGeometry[] = [];
  const voxelOffsets = [
    new THREE.Vector3(0.05, -0.05, 0.05),
    new THREE.Vector3(-0.05, 0.08, -0.05),
    new THREE.Vector3(0.08, 0.05, -0.08),
    new THREE.Vector3(-0.08, -0.08, 0.08),
    new THREE.Vector3(0, 0, 0),
  ];
  voxelOffsets.forEach((offset) => {
    glitchSolidParts.push(
      createColoredGeometry(
        boxGeometry,
        0x00ff88,
        getModelMatrix(offset, new THREE.Vector3().setScalar(0.15)),
      ),
    );
  });
  const shardOffsets = [
    new THREE.Vector3(-0.1, 0.1, -0.35),
    new THREE.Vector3(0.15, -0.1, -0.45),
    new THREE.Vector3(-0.05, -0.15, -0.55),
  ];
  shardOffsets.forEach((offset) => {
    glitchSolidParts.push(
      createColoredGeometry(
        boxGeometry,
        0x00ff88,
        getModelMatrix(offset, new THREE.Vector3(0.04, 0.04, 0.12)),
      ),
    );
  });
  const glitchSolid = BufferGeometryUtils.mergeGeometries(glitchSolidParts);

  const glitchWireParts: THREE.BufferGeometry[] = [];
  glitchWireParts.push(
    createColoredGeometry(
      octahedronGeometry,
      0x00ff88,
      getModelMatrix(new THREE.Vector3(), new THREE.Vector3().setScalar(0.45)),
    ),
  );
  glitchWireParts.push(
    createColoredGeometry(
      octahedronGeometry,
      0x00aa66,
      getModelMatrix(new THREE.Vector3(), new THREE.Vector3().setScalar(0.55)),
    ),
  );
  const glitchWire = BufferGeometryUtils.mergeGeometries(glitchWireParts);
  cachedEnemyGeometries.set(EnemyType.GLITCH, { solid: glitchSolid, wire: glitchWire });

  // 2. VIRUS
  const virusParts: THREE.BufferGeometry[] = [];
  virusParts.push(
    createColoredGeometry(
      icosahedronGeometry,
      0xff0055,
      getModelMatrix(new THREE.Vector3(), new THREE.Vector3().setScalar(0.26)),
    ),
  );
  virusParts.push(
    createColoredGeometry(
      sphereGeometry,
      0x550022,
      getModelMatrix(new THREE.Vector3(), new THREE.Vector3().setScalar(0.15)),
    ),
  );

  const virusSpikeVertices = [
    new THREE.Vector3(0, 1, 1.618),
    new THREE.Vector3(0, 1, -1.618),
    new THREE.Vector3(0, -1, 1.618),
    new THREE.Vector3(0, -1, -1.618),
    new THREE.Vector3(1, 1.618, 0),
    new THREE.Vector3(1, -1.618, 0),
    new THREE.Vector3(-1, 1.618, 0),
    new THREE.Vector3(-1, -1.618, 0),
    new THREE.Vector3(1.618, 0, 1),
    new THREE.Vector3(1.618, 0, -1),
    new THREE.Vector3(-1.618, 0, 1),
    new THREE.Vector3(-1.618, 0, -1),
  ];
  virusSpikeVertices.forEach((v) => {
    v.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);

    const basePos = v.clone().multiplyScalar(0.28);
    const baseMatrix = new THREE.Matrix4().compose(basePos, q, new THREE.Vector3(0.02, 0.16, 0.02));
    virusParts.push(createColoredGeometry(cylinderYGeometry, 0x442233, baseMatrix));

    const tipPos = v.clone().multiplyScalar(0.37);
    const tipMatrix = new THREE.Matrix4().compose(tipPos, q, new THREE.Vector3().setScalar(0.04));
    virusParts.push(createColoredGeometry(sphereGeometry, 0xff0088, tipMatrix));
  });

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const radius = 0.38;
    const height = Math.sin(angle * 2) * 0.25;
    const pos = new THREE.Vector3(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    virusParts.push(
      createColoredGeometry(
        sphereGeometry,
        0xff55aa,
        getModelMatrix(pos, new THREE.Vector3().setScalar(0.03)),
      ),
    );
  }
  const virusSolid = BufferGeometryUtils.mergeGeometries(virusParts);
  cachedEnemyGeometries.set(EnemyType.VIRUS, { solid: virusSolid });

  // 3. FIREWALL
  const firewallParts: THREE.BufferGeometry[] = [];
  firewallParts.push(
    createColoredGeometry(
      boxGeometry,
      0x332211,
      getModelMatrix(new THREE.Vector3(-0.4, 0, 0), new THREE.Vector3(0.15, 0.9, 0.15)),
    ),
  );
  firewallParts.push(
    createColoredGeometry(
      boxGeometry,
      0x332211,
      getModelMatrix(new THREE.Vector3(0.4, 0, 0), new THREE.Vector3(0.15, 0.9, 0.15)),
    ),
  );
  firewallParts.push(
    createColoredGeometry(
      boxGeometry,
      0xffaa00,
      getModelMatrix(new THREE.Vector3(-0.4, 0, 0), new THREE.Vector3(0.02, 0.8, 0.16)),
    ),
  );
  firewallParts.push(
    createColoredGeometry(
      boxGeometry,
      0xffaa00,
      getModelMatrix(new THREE.Vector3(0.4, 0, 0), new THREE.Vector3(0.02, 0.8, 0.16)),
    ),
  );
  firewallParts.push(
    createColoredGeometry(
      sphereGeometry,
      0xffaa00,
      getModelMatrix(new THREE.Vector3(-0.4, 0.48, 0), new THREE.Vector3().setScalar(0.06)),
    ),
  );
  firewallParts.push(
    createColoredGeometry(
      sphereGeometry,
      0xffaa00,
      getModelMatrix(new THREE.Vector3(0.4, 0.48, 0), new THREE.Vector3().setScalar(0.06)),
    ),
  );
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const pos = new THREE.Vector3((c - 1) * 0.24, (r - 0.5) * 0.3, 0);
      firewallParts.push(
        createColoredGeometry(
          boxGeometry,
          0xff5500,
          getModelMatrix(pos, new THREE.Vector3(0.22, 0.22, 0.05)),
        ),
      );
    }
  }
  const firewallSolid = BufferGeometryUtils.mergeGeometries(firewallParts);
  cachedEnemyGeometries.set(EnemyType.FIREWALL, { solid: firewallSolid });

  // 4. ENFORCER
  const enforcerParts: THREE.BufferGeometry[] = [];
  enforcerParts.push(
    createColoredGeometry(
      cylinderYGeometry,
      0x223344,
      getModelMatrix(
        new THREE.Vector3(),
        new THREE.Vector3(0.18, 0.38, 0.18),
        new THREE.Euler(Math.PI / 2, 0, 0),
      ),
    ),
  );
  enforcerParts.push(
    createColoredGeometry(
      boxGeometry,
      0x223344,
      getModelMatrix(new THREE.Vector3(0, 0, 0.22), new THREE.Vector3(0.35, 0.28, 0.05)),
    ),
  );
  enforcerParts.push(
    createColoredGeometry(
      boxGeometry,
      0x00ffcc,
      getModelMatrix(new THREE.Vector3(0, 0.12, 0.22), new THREE.Vector3(0.37, 0.03, 0.06)),
    ),
  );
  enforcerParts.push(
    createColoredGeometry(
      boxGeometry,
      0x223344,
      getModelMatrix(
        new THREE.Vector3(-0.245, 0, 0.17),
        new THREE.Vector3(0.16, 0.28, 0.04),
        new THREE.Euler(0, Math.PI / 5, 0),
      ),
    ),
  );
  enforcerParts.push(
    createColoredGeometry(
      boxGeometry,
      0x223344,
      getModelMatrix(
        new THREE.Vector3(0.245, 0, 0.17),
        new THREE.Vector3(0.16, 0.28, 0.04),
        new THREE.Euler(0, -Math.PI / 5, 0),
      ),
    ),
  );
  enforcerParts.push(
    createColoredGeometry(
      cylinderZGeometry,
      0x223344,
      getModelMatrix(new THREE.Vector3(-0.26, -0.05, 0.05), new THREE.Vector3(0.03, 0.03, 0.28)),
    ),
  );
  enforcerParts.push(
    createColoredGeometry(
      cylinderZGeometry,
      0x223344,
      getModelMatrix(new THREE.Vector3(0.26, -0.05, 0.05), new THREE.Vector3(0.03, 0.03, 0.28)),
    ),
  );
  enforcerParts.push(
    createColoredGeometry(
      cylinderYGeometry,
      0x223344,
      getModelMatrix(new THREE.Vector3(0, -0.2, -0.05), new THREE.Vector3(0.1, 0.12, 0.1)),
    ),
  );
  enforcerParts.push(
    createColoredGeometry(
      coneZGeometry,
      0x00ffcc,
      getModelMatrix(
        new THREE.Vector3(0, -0.25, -0.05),
        new THREE.Vector3(0.06, 0.06, 0.18),
        new THREE.Euler(0, Math.PI, 0),
      ),
    ),
  );
  enforcerParts.push(
    createColoredGeometry(
      boxGeometry,
      0x00ffcc,
      getModelMatrix(new THREE.Vector3(-0.45, 0, 0), new THREE.Vector3(0.08, 0.15, 0.02)),
    ),
  );
  enforcerParts.push(
    createColoredGeometry(
      boxGeometry,
      0x00ffcc,
      getModelMatrix(new THREE.Vector3(0.45, 0, 0), new THREE.Vector3(0.08, 0.15, 0.02)),
    ),
  );
  const enforcerSolid = BufferGeometryUtils.mergeGeometries(enforcerParts);
  cachedEnemyGeometries.set(EnemyType.ENFORCER, { solid: enforcerSolid });

  // 5. COLOSSUS
  const colossusParts: THREE.BufferGeometry[] = [];
  colossusParts.push(
    createColoredGeometry(
      cylinderYGeometry,
      0x111111,
      getModelMatrix(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0.35, 0.18, 0.35)),
    ),
  );
  colossusParts.push(
    createColoredGeometry(
      cylinderYGeometry,
      0x444444,
      getModelMatrix(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.26, 0.18, 0.26)),
    ),
  );
  colossusParts.push(
    createColoredGeometry(
      cylinderYGeometry,
      0x111111,
      getModelMatrix(new THREE.Vector3(0, 0.2, 0), new THREE.Vector3(0.16, 0.18, 0.16)),
    ),
  );
  colossusParts.push(
    createColoredGeometry(
      cylinderYGeometry,
      0x111111,
      getModelMatrix(
        new THREE.Vector3(-0.08, 0.28, -0.08),
        new THREE.Vector3(0.03, 0.16, 0.03),
        new THREE.Euler(Math.PI / 6, 0, 0),
      ),
    ),
  );
  const smoke0Pos = new THREE.Vector3(-0.08, 0.28, -0.08).add(
    new THREE.Vector3(0, 0.1, -0.05).applyEuler(new THREE.Euler(Math.PI / 6, 0, 0)),
  );
  colossusParts.push(
    createColoredGeometry(
      coneZGeometry,
      0x00ff88,
      getModelMatrix(
        smoke0Pos,
        new THREE.Vector3(0.025, 0.025, 0.1),
        new THREE.Euler(Math.PI / 6, 0, 0),
      ),
    ),
  );
  colossusParts.push(
    createColoredGeometry(
      cylinderYGeometry,
      0x111111,
      getModelMatrix(
        new THREE.Vector3(0.08, 0.28, -0.08),
        new THREE.Vector3(0.03, 0.16, 0.03),
        new THREE.Euler(Math.PI / 6, 0, 0),
      ),
    ),
  );
  const smoke1Pos = new THREE.Vector3(0.08, 0.28, -0.08).add(
    new THREE.Vector3(0, 0.1, -0.05).applyEuler(new THREE.Euler(Math.PI / 6, 0, 0)),
  );
  colossusParts.push(
    createColoredGeometry(
      coneZGeometry,
      0x00ff88,
      getModelMatrix(
        smoke1Pos,
        new THREE.Vector3(0.025, 0.025, 0.1),
        new THREE.Euler(Math.PI / 6, 0, 0),
      ),
    ),
  );
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pos = new THREE.Vector3(Math.cos(angle) * 0.35, -0.16, Math.sin(angle) * 0.35);
    colossusParts.push(
      createColoredGeometry(
        sphereGeometry,
        0x00ff88,
        getModelMatrix(pos, new THREE.Vector3().setScalar(0.04)),
      ),
    );
  }
  const colossusSolid = BufferGeometryUtils.mergeGeometries(colossusParts);
  cachedEnemyGeometries.set(EnemyType.COLOSSUS, { solid: colossusSolid });

  // 6. WARDEN
  const wardenParts: THREE.BufferGeometry[] = [];
  wardenParts.push(
    createColoredGeometry(
      octahedronGeometry,
      0xff00cc,
      getModelMatrix(new THREE.Vector3(), new THREE.Vector3().setScalar(0.24)),
    ),
  );
  wardenParts.push(
    createColoredGeometry(
      sphereGeometry,
      0x00ffff,
      getModelMatrix(new THREE.Vector3(), new THREE.Vector3().setScalar(0.12)),
    ),
  );
  wardenParts.push(
    createColoredGeometry(
      torusGeometry,
      0x00ffff,
      getModelMatrix(
        new THREE.Vector3(),
        new THREE.Vector3().setScalar(0.42),
        new THREE.Euler(Math.PI / 2, 0, 0),
      ),
    ),
  );
  wardenParts.push(
    createColoredGeometry(
      torusGeometry,
      0x00ffff,
      getModelMatrix(
        new THREE.Vector3(),
        new THREE.Vector3().setScalar(0.38),
        new THREE.Euler(0, Math.PI / 2, 0),
      ),
    ),
  );
  wardenParts.push(
    createColoredGeometry(
      torusGeometry,
      0x00ffff,
      getModelMatrix(new THREE.Vector3(), new THREE.Vector3().setScalar(0.46)),
    ),
  );
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const pos = new THREE.Vector3(Math.cos(angle) * 0.52, 0, Math.sin(angle) * 0.52);
    wardenParts.push(
      createColoredGeometry(
        octahedronGeometry,
        0xff00cc,
        getModelMatrix(pos, new THREE.Vector3().setScalar(0.05)),
      ),
    );
  }
  const wardenSolid = BufferGeometryUtils.mergeGeometries(wardenParts);
  cachedEnemyGeometries.set(EnemyType.WARDEN, { solid: wardenSolid });

  // 7. HYDRA
  const hydraParts: THREE.BufferGeometry[] = [];
  hydraParts.push(
    createColoredGeometry(
      icosahedronGeometry,
      0xff0033,
      getModelMatrix(new THREE.Vector3(-0.26, 0, 0), new THREE.Vector3().setScalar(0.15)),
    ),
  );
  hydraParts.push(
    createColoredGeometry(
      torusGeometry,
      0x00ffcc,
      getModelMatrix(
        new THREE.Vector3(-0.26, 0, 0),
        new THREE.Vector3().setScalar(0.2),
        new THREE.Euler(Math.PI / 2, 0, 0),
      ),
    ),
  );
  hydraParts.push(
    createColoredGeometry(
      icosahedronGeometry,
      0xff0033,
      getModelMatrix(new THREE.Vector3(0, 0.08, 0), new THREE.Vector3().setScalar(0.18)),
    ),
  );
  hydraParts.push(
    createColoredGeometry(
      torusGeometry,
      0x00ffcc,
      getModelMatrix(
        new THREE.Vector3(0, 0.08, 0),
        new THREE.Vector3().setScalar(0.24),
        new THREE.Euler(0, Math.PI / 2, 0),
      ),
    ),
  );
  hydraParts.push(
    createColoredGeometry(
      icosahedronGeometry,
      0xff0033,
      getModelMatrix(new THREE.Vector3(0.26, 0, 0), new THREE.Vector3().setScalar(0.15)),
    ),
  );
  hydraParts.push(
    createColoredGeometry(
      torusGeometry,
      0x00ffcc,
      getModelMatrix(
        new THREE.Vector3(0.26, 0, 0),
        new THREE.Vector3().setScalar(0.2),
        new THREE.Euler(Math.PI / 2, 0, 0),
      ),
    ),
  );
  hydraParts.push(
    createColoredGeometry(
      cylinderYGeometry,
      0x00ffcc,
      getModelMatrix(
        new THREE.Vector3(-0.13, 0.04, 0),
        new THREE.Vector3(0.02, 0.26, 0.02),
        new THREE.Euler(0, 0, Math.PI / 2),
      ),
    ),
  );
  hydraParts.push(
    createColoredGeometry(
      cylinderYGeometry,
      0x00ffcc,
      getModelMatrix(
        new THREE.Vector3(0.13, 0.04, 0),
        new THREE.Vector3(0.02, 0.26, 0.02),
        new THREE.Euler(0, 0, Math.PI / 2),
      ),
    ),
  );
  const hydraSolid = BufferGeometryUtils.mergeGeometries(hydraParts);
  cachedEnemyGeometries.set(EnemyType.HYDRA, { solid: hydraSolid });

  // 8. OVERSEER
  const overseerParts: THREE.BufferGeometry[] = [];
  overseerParts.push(
    createColoredGeometry(
      sphereGeometry,
      0xff00ff,
      getModelMatrix(new THREE.Vector3(), new THREE.Vector3().setScalar(0.18)),
    ),
  );
  overseerParts.push(
    createColoredGeometry(
      boxGeometry,
      0xff00ff,
      getModelMatrix(new THREE.Vector3(), new THREE.Vector3().setScalar(0.32)),
    ),
  );
  overseerParts.push(
    createColoredGeometry(
      octahedronGeometry,
      0xff00ff,
      getModelMatrix(new THREE.Vector3(), new THREE.Vector3().setScalar(0.44)),
    ),
  );
  overseerParts.push(
    createColoredGeometry(
      icosahedronGeometry,
      0xff00ff,
      getModelMatrix(new THREE.Vector3(), new THREE.Vector3().setScalar(0.54)),
    ),
  );
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const pos = new THREE.Vector3(Math.cos(angle) * 0.65, 0, Math.sin(angle) * 0.65);
    overseerParts.push(
      createColoredGeometry(
        cylinderZGeometry,
        0x111111,
        getModelMatrix(pos, new THREE.Vector3(0.04, 0.04, 0.15)),
      ),
    );
    const glowPos = pos.clone().add(new THREE.Vector3(0, 0, 0.08));
    overseerParts.push(
      createColoredGeometry(
        sphereGeometry,
        0xff00ff,
        getModelMatrix(glowPos, new THREE.Vector3().setScalar(0.025)),
      ),
    );
  }
  const overseerSolid = BufferGeometryUtils.mergeGeometries(overseerParts);
  cachedEnemyGeometries.set(EnemyType.OVERSEER, { solid: overseerSolid });
}

const enemySolidMaterials = new Map<string, THREE.MeshStandardMaterial>();
const enemyWireMaterials = new Map<string, THREE.MeshBasicMaterial>();
const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });

export function getEnemySolidMaterial(type: EnemyType): THREE.MeshStandardMaterial {
  let mat = enemySolidMaterials.get(type);
  if (!mat) {
    let emissiveColor = 0x000000;
    let emissiveIntensity = 0.0;
    if (type === EnemyType.GLITCH) {
      emissiveColor = 0x00ff88;
      emissiveIntensity = 0.4;
    } else if (type === EnemyType.VIRUS) {
      emissiveColor = 0xff0055;
      emissiveIntensity = 0.4;
    } else if (type === EnemyType.FIREWALL) {
      emissiveColor = 0xff5500;
      emissiveIntensity = 0.4;
    } else if (type === EnemyType.ENFORCER) {
      emissiveColor = 0x00ffcc;
      emissiveIntensity = 0.4;
    } else if (type === EnemyType.COLOSSUS) {
      emissiveColor = 0xffaa00;
      emissiveIntensity = 0.4;
    } else if (type === EnemyType.WARDEN) {
      emissiveColor = 0xd900ff;
      emissiveIntensity = 0.4;
    } else if (type === EnemyType.HYDRA) {
      emissiveColor = 0x00ffff;
      emissiveIntensity = 0.4;
    } else if (type === EnemyType.OVERSEER) {
      emissiveColor = 0xff0055;
      emissiveIntensity = 0.4;
    }

    mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
      metalness: 0.1, // Reduced from 0.8 to prevent dark/black appearance without environment maps
      emissive: new THREE.Color(emissiveColor),
      emissiveIntensity: emissiveIntensity,
    });
    enemySolidMaterials.set(type, mat);
  }
  return mat;
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

function buildEnemyMesh(type: EnemyType, size: number): THREE.Object3D {
  if (cachedEnemyGeometries.size === 0) {
    pregenerateAllEnemyGeometries();
  }

  const container = new THREE.Group();
  container.name = 'mesh_container';

  const geomData = cachedEnemyGeometries.get(type);
  if (geomData) {
    // 1. Solid Mesh
    const solidMat = getEnemySolidMaterial(type);
    const solidMesh = new THREE.Mesh(geomData.solid, solidMat);
    solidMesh.name = 'solidMesh';
    solidMesh.scale.setScalar(size);
    solidMesh.castShadow = true;
    solidMesh.receiveShadow = true;
    container.add(solidMesh);

    // 2. Wireframe Mesh (only if exists, e.g. for glitch)
    if (geomData.wire) {
      const wireMat = getEnemyWireMaterial(type);
      const wireMesh = new THREE.Mesh(geomData.wire, wireMat);
      wireMesh.name = 'wireMesh';
      wireMesh.scale.setScalar(size);
      container.add(wireMesh);
    }
  } else {
    // Fallback: create a simple box if not found
    const fallbackMesh = new THREE.Mesh(boxGeometry, fallbackMaterial);
    fallbackMesh.scale.setScalar(size);
    container.add(fallbackMesh);
  }

  // Position it floating above the ground
  container.position.y = size * 0.35;
  return container;
}

export function spawnEnemy(
  _scene: THREE.Scene,
  x: number,
  z: number,
  type: EnemyType = EnemyType.GLITCH,
) {
  const stats = ENEMY_STATS[type];
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  // Corruption hardens enemies (+15% HP per level); endless mode keeps
  // scaling them after the 10:00 victory; co-op makes them tankier per extra
  // living fighter (neutral 1.0 in solo).
  const corruptionHp = 1 + uiState.corruption * 0.15;
  const endlessHp = uiState.endlessMode ? 1 + Math.max(0, uiState.gameTime - 600) / 180 : 1;
  const maxHp = Math.round(stats.hp * corruptionHp * endlessHp * partyHpMultiplier());

  // 1. Build and attach the custom 3D model
  const enemyMesh = buildEnemyMesh(type, stats.size);
  group.add(enemyMesh);

  // 2. Attach the shadow mesh
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.setScalar(stats.size / 2);
  shadow.position.y = 0.02;
  shadow.name = 'shadow';
  group.add(shadow);

  const enemy = world.add({
    isEnemy: true,
    enemyType: type,
    position: group.position,
    velocity: new THREE.Vector3(0, 0, 0),
    health: { current: maxHp, max: maxHp },
    moveSpeed: stats.speed,
    transform: group,
    size: stats.size,
    aimTarget: new THREE.Vector3(),
    xpValue: stats.xp,
    baseColor: stats.color,
    spawnAnimTimer: 0.35, // scale-pop entrance (RenderSystem)
  });

  // Create Rapier rigid body for enemy (only in single-player or on the Host)
  const isHostOrSingle = !uiState.isMultiplayer || uiState.isHost;
  if (isHostOrSingle && isRapierInitialized() && enemy.id !== undefined) {
    // Use enemy size to determine radius (scaled down for gameplay)
    const radius = Math.max(ENEMY_RADIUS, stats.size * 0.3);
    const { rigidBody, collider } = createDynamicBody(x, z, radius, enemy.id);
    enemy.rigidBody = rigidBody;
    enemy.collider = collider;
  }
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
