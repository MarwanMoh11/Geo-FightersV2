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

  const container = new THREE.Group();
  container.name = 'mesh_container';
  playerGroup.add(container);

  // Central Core Sphere (Glowing energy source)
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x00d5ff,
    emissive: 0x00d5ff,
    emissiveIntensity: 0.9,
    roughness: 0.1,
    metalness: 0.9,
  });
  const coreMesh = new THREE.Mesh(sphereGeometry, coreMat);
  coreMesh.scale.setScalar(0.32);
  coreMesh.name = 'core';
  container.add(coreMesh);

  // Core Shell / Cage (outer protective faceted hull)
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0x223344,
    roughness: 0.2,
    metalness: 0.9,
    wireframe: true,
  });
  const shellMesh = new THREE.Mesh(icosahedronGeometry, shellMat);
  shellMesh.scale.setScalar(0.38);
  shellMesh.name = 'shell';
  container.add(shellMesh);

  // Swept wings (flanking left/right)
  const leftWing = new THREE.Group();
  leftWing.name = 'leftWing';
  leftWing.position.set(-0.42, 0, -0.05);

  const wingMat = new THREE.MeshStandardMaterial({
    color: 0x334455,
    roughness: 0.3,
    metalness: 0.8,
  });
  const leftWingMesh = new THREE.Mesh(boxGeometry, wingMat);
  leftWingMesh.scale.set(0.35, 0.04, 0.25);
  leftWingMesh.position.set(-0.175, 0, -0.05);
  leftWingMesh.rotation.y = -Math.PI / 8; // Sweep back
  leftWing.add(leftWingMesh);

  const tipMat = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    emissive: 0x00ffff,
    emissiveIntensity: 1.5,
  });
  const leftTipMesh = new THREE.Mesh(boxGeometry, tipMat);
  leftTipMesh.scale.set(0.04, 0.05, 0.28);
  leftTipMesh.position.set(-0.35, 0, -0.05);
  leftTipMesh.rotation.y = -Math.PI / 8;
  leftWing.add(leftTipMesh);
  container.add(leftWing);

  const rightWing = new THREE.Group();
  rightWing.name = 'rightWing';
  rightWing.position.set(0.42, 0, -0.05);

  const rightWingMesh = new THREE.Mesh(boxGeometry, wingMat);
  rightWingMesh.scale.set(0.35, 0.04, 0.25);
  rightWingMesh.position.set(0.175, 0, -0.05);
  rightWingMesh.rotation.y = Math.PI / 8; // Sweep back
  rightWing.add(rightWingMesh);

  const rightTipMesh = new THREE.Mesh(boxGeometry, tipMat);
  rightTipMesh.scale.set(0.04, 0.05, 0.28);
  rightTipMesh.position.set(0.35, 0, -0.05);
  rightTipMesh.rotation.y = Math.PI / 8;
  rightWing.add(rightTipMesh);
  container.add(rightWing);

  // Left & Right engine booster cylinders
  const thrusterMat = new THREE.MeshStandardMaterial({
    color: 0x444455,
    roughness: 0.4,
    metalness: 0.8,
  });
  const leftThruster = new THREE.Mesh(cylinderZGeometry, thrusterMat);
  leftThruster.scale.set(0.09, 0.09, 0.42);
  leftThruster.position.set(-0.38, -0.08, -0.22);
  leftThruster.name = 'leftThruster';
  container.add(leftThruster);

  const rightThruster = new THREE.Mesh(cylinderZGeometry, thrusterMat);
  rightThruster.scale.set(0.09, 0.09, 0.42);
  rightThruster.position.set(0.38, -0.08, -0.22);
  rightThruster.name = 'rightThruster';
  container.add(rightThruster);

  // Double-layered thruster flame cones
  const fireInnerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const fireOuterMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.7,
  });

  const leftFireInner = new THREE.Mesh(coneZGeometry, fireInnerMat);
  leftFireInner.scale.set(0.05, 0.05, 0.18);
  leftFireInner.position.set(0, 0, -0.22);
  leftFireInner.name = 'leftFireInner';
  leftThruster.add(leftFireInner);

  const leftFireOuter = new THREE.Mesh(coneZGeometry, fireOuterMat);
  leftFireOuter.scale.set(0.08, 0.08, 0.28);
  leftFireOuter.position.set(0, 0, -0.26);
  leftFireOuter.name = 'leftFireOuter';
  leftThruster.add(leftFireOuter);

  const rightFireInner = new THREE.Mesh(coneZGeometry, fireInnerMat);
  rightFireInner.scale.set(0.05, 0.05, 0.18);
  rightFireInner.position.set(0, 0, -0.22);
  rightFireInner.name = 'rightFireInner';
  rightThruster.add(rightFireInner);

  const rightFireOuter = new THREE.Mesh(coneZGeometry, fireOuterMat);
  rightFireOuter.scale.set(0.08, 0.08, 0.28);
  rightFireOuter.position.set(0, 0, -0.26);
  rightFireOuter.name = 'rightFireOuter';
  rightThruster.add(rightFireOuter);

  // Multi-segmented visor (forward eye system)
  const visorGroup = new THREE.Group();
  visorGroup.name = 'visorGroup';
  visorGroup.position.set(0, 0.06, 0.32);

  const mainVisorMat = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    emissive: 0x00ffff,
    emissiveIntensity: 1.8,
  });
  const mainVisor = new THREE.Mesh(boxGeometry, mainVisorMat);
  mainVisor.scale.set(0.36, 0.07, 0.07);
  visorGroup.add(mainVisor);

  const sensorMat = new THREE.MeshStandardMaterial({
    color: 0x223344,
    roughness: 0.2,
    metalness: 0.8,
  });
  const leftSensor = new THREE.Mesh(boxGeometry, sensorMat);
  leftSensor.scale.setScalar(0.05);
  leftSensor.position.set(-0.2, 0, -0.03);
  visorGroup.add(leftSensor);

  const rightSensor = leftSensor.clone();
  rightSensor.position.x = 0.2;
  visorGroup.add(rightSensor);
  container.add(visorGroup);

  // Dual-axis Stabilizer rings (Horizontal & Vertical gyros)
  const gyroGroup = new THREE.Group();
  gyroGroup.name = 'gyroGroup';

  const hRingMat = new THREE.MeshStandardMaterial({
    color: 0x00e5ff,
    emissive: 0x00e5ff,
    emissiveIntensity: 0.5,
    roughness: 0.1,
    metalness: 0.9,
  });
  const gyroHRing = new THREE.Mesh(torusGeometry, hRingMat);
  gyroHRing.scale.set(0.62, 0.62, 0.62);
  gyroHRing.rotation.x = Math.PI / 2;
  gyroHRing.name = 'gyroHRing';
  gyroGroup.add(gyroHRing);

  const vRingMat = new THREE.MeshStandardMaterial({
    color: 0x0088ff,
    emissive: 0x0088ff,
    emissiveIntensity: 0.7,
    roughness: 0.1,
    metalness: 0.9,
  });
  const gyroVRing = new THREE.Mesh(torusGeometry, vRingMat);
  gyroVRing.scale.set(0.56, 0.56, 0.56);
  gyroVRing.rotation.y = Math.PI / 2;
  gyroVRing.name = 'gyroVRing';
  gyroGroup.add(gyroVRing);
  container.add(gyroGroup);

  // Bottom twin gun weapon barrels (hardpoints)
  const weaponGroup = new THREE.Group();
  weaponGroup.name = 'weaponGroup';
  weaponGroup.position.set(0, -0.22, 0.08);

  const turretBase = new THREE.Mesh(cylinderYGeometry, thrusterMat);
  turretBase.scale.set(0.1, 0.06, 0.1);
  weaponGroup.add(turretBase);

  const barrelMat = new THREE.MeshStandardMaterial({
    color: 0x111118,
    roughness: 0.3,
    metalness: 0.9,
  });
  const leftBarrel = new THREE.Mesh(cylinderZGeometry, barrelMat);
  leftBarrel.scale.set(0.025, 0.025, 0.22);
  leftBarrel.position.set(-0.05, -0.04, 0.08);
  leftBarrel.name = 'leftBarrel';
  weaponGroup.add(leftBarrel);

  const rightBarrel = leftBarrel.clone();
  rightBarrel.position.x = 0.05;
  rightBarrel.name = 'rightBarrel';
  weaponGroup.add(rightBarrel);
  container.add(weaponGroup);

  // 3 Orbiting energy shield shards
  const shieldGroup = new THREE.Group();
  shieldGroup.name = 'shieldGroup';
  const shardMat = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    emissive: 0x00ffff,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.7,
  });
  for (let i = 0; i < 3; i++) {
    const shard = new THREE.Mesh(octahedronGeometry, shardMat);
    shard.scale.setScalar(0.05);
    shard.name = `shieldShard_${i}`;
    shieldGroup.add(shard);
  }
  container.add(shieldGroup);

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

  // Update visual core color based on character
  if (player.transform) {
    const core = player.transform.getObjectByName('core') as THREE.Mesh;
    if (core && core.material) {
      const mat = core.material as THREE.MeshStandardMaterial;
      mat.color.setHex(character.color);
      mat.emissive.setHex(character.color);
    }
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
