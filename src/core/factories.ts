import * as THREE from 'three';
import { world } from './world';
import { getDefaultStats } from './PlayerStats';
import { WEAPONS, getWeaponStatsAtLevel } from './WeaponRegistry';
import { getTierForValue, bankXP, MAX_ACTIVE_XP } from './XPManager';
import { createDynamicBody, isRapierInitialized } from './RapierWorld';
import { uiState } from './UIState.svelte';

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

const enemyMaterials: Record<string, Record<string, THREE.Material>> = {
  glitch: {
    coreMat: new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x00ff88,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.8,
    }),
    cageMat1: new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
    }),
    cageMat2: new THREE.MeshBasicMaterial({
      color: 0x00aa66,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    }),
    shardMat: new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x00ff88,
      emissiveIntensity: 1.2,
    }),
  },
  virus: {
    coreMat: new THREE.MeshStandardMaterial({
      color: 0xff0055,
      emissive: 0xff0055,
      emissiveIntensity: 0.7,
      roughness: 0.4,
      metalness: 0.2,
      transparent: true,
      opacity: 0.85,
    }),
    innerCoreMat: new THREE.MeshStandardMaterial({
      color: 0x550022,
      roughness: 0.8,
      metalness: 0.9,
    }),
    needleMat: new THREE.MeshStandardMaterial({
      color: 0x442233,
      roughness: 0.5,
      metalness: 0.8,
    }),
    tipMat: new THREE.MeshStandardMaterial({
      color: 0xff0088,
      emissive: 0xff0088,
      emissiveIntensity: 1.5,
    }),
    dnaMat: new THREE.MeshStandardMaterial({
      color: 0xff55aa,
      emissive: 0xff55aa,
      emissiveIntensity: 1.0,
    }),
  },
  firewall: {
    pillarMat: new THREE.MeshStandardMaterial({
      color: 0x332211,
      roughness: 0.4,
      metalness: 0.9,
    }),
    shieldMat: new THREE.MeshStandardMaterial({
      color: 0xff5500,
      emissive: 0xff5500,
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.5,
      transparent: true,
      opacity: 0.8,
    }),
    stripMat: new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0xffaa00,
      emissiveIntensity: 1.5,
    }),
  },
  enforcer: {
    chassisMat: new THREE.MeshStandardMaterial({
      color: 0x223344,
      roughness: 0.3,
      metalness: 0.9,
    }),
    shieldMat: new THREE.MeshStandardMaterial({
      color: 0x00ffcc,
      emissive: 0x00ffcc,
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.7,
      transparent: true,
      opacity: 0.8,
    }),
    eyeMat: new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 2.0,
    }),
    flameMat: new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.8,
    }),
  },
  colossus: {
    metalMat: new THREE.MeshStandardMaterial({
      color: 0xff3300,
      emissive: 0xff3300,
      emissiveIntensity: 0.3,
      roughness: 0.5,
      metalness: 0.7,
    }),
    darkMetal: new THREE.MeshStandardMaterial({
      color: 0x221111,
      roughness: 0.4,
      metalness: 0.9,
    }),
    energyMat: new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0xffaa00,
      emissiveIntensity: 1.5,
    }),
  },
  warden: {
    coreMat: new THREE.MeshStandardMaterial({
      color: 0xaa00ff,
      emissive: 0x5500aa,
      emissiveIntensity: 0.8,
      roughness: 0.05,
      metalness: 0.95,
    }),
    ringMat: new THREE.MeshStandardMaterial({
      color: 0xd900ff,
      emissive: 0xd900ff,
      emissiveIntensity: 1.0,
      roughness: 0.2,
      metalness: 0.8,
    }),
  },
  hydra: {
    coreMat: new THREE.MeshStandardMaterial({
      color: 0x0088ff,
      emissive: 0x0055ff,
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.9,
    }),
    beamMat: new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.8,
    }),
  },
  overseer: {
    coreMat: new THREE.MeshStandardMaterial({
      color: 0xff0055,
      emissive: 0xff0055,
      emissiveIntensity: 0.9,
      roughness: 0.1,
      metalness: 0.9,
    }),
    darkMat: new THREE.MeshStandardMaterial({
      color: 0x220005,
      roughness: 0.3,
      metalness: 0.9,
    }),
    wireMat1: new THREE.MeshBasicMaterial({ color: 0xff0055, wireframe: true }),
    wireMat2: new THREE.MeshBasicMaterial({ color: 0xffaa00, wireframe: true }),
    wireMat3: new THREE.MeshBasicMaterial({ color: 0xff00aa, wireframe: true }),
  },
};

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
  const starterWeaponId = 'pulse_repeater';
  const starterWeapon = WEAPONS[starterWeaponId];
  const starterStats = getWeaponStatsAtLevel(starterWeaponId, 1)!;

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
    modifiers: { damageAdd: 0, fireRateMult: 1.0, speedMult: 1.0 },

    // VS-style inventory
    weaponSlots: [{ weaponId: starterWeaponId, level: 1 }],
    passiveSlots: [],
    stats: getDefaultStats(),
  });

  // 1b. CREATE RAPIER RIGID BODY for player (only if local player)
  if (isLocal && isRapierInitialized() && player.id !== undefined) {
    const { rigidBody, collider } = createDynamicBody(startX, startZ, PLAYER_RADIUS, player.id);
    player.rigidBody = rigidBody;
    player.collider = collider;
  }

  // 2. EQUIP STARTER WEAPON from registry
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

// --- CACHE & TYPES ---
function buildEnemyMesh(type: EnemyType, size: number): THREE.Object3D {
  const container = new THREE.Group();
  container.name = 'mesh_container';
  const mats = enemyMaterials[type];

  switch (type) {
    case EnemyType.GLITCH: {
      // Cluster of 5 voxel cubes that will jitter in RenderSystem
      for (let i = 0; i < 5; i++) {
        const voxel = new THREE.Mesh(boxGeometry, mats.coreMat);
        voxel.name = `voxel_${i}`;
        voxel.scale.setScalar(size * 0.15);
        voxel.position.set(
          (Math.random() - 0.5) * size * 0.3,
          (Math.random() - 0.5) * size * 0.3,
          (Math.random() - 0.5) * size * 0.3,
        );
        container.add(voxel);
      }

      // Outer nested wireframe octahedrons
      const cage1 = new THREE.Mesh(octahedronGeometry, mats.cageMat1);
      cage1.scale.setScalar(size * 0.45);
      cage1.name = 'cage1';
      container.add(cage1);

      const cage2 = new THREE.Mesh(octahedronGeometry, mats.cageMat2);
      cage2.scale.setScalar(size * 0.55);
      cage2.name = 'cage2';
      container.add(cage2);

      // Trailing glitch coordinate shards
      for (let i = 0; i < 3; i++) {
        const shard = new THREE.Mesh(boxGeometry, mats.shardMat);
        shard.name = `shard_${i}`;
        shard.scale.set(size * 0.04, size * 0.04, size * 0.12);
        shard.position.set(
          (Math.random() - 0.5) * size * 0.4,
          (Math.random() - 0.5) * size * 0.4,
          -size * 0.25 - Math.random() * size * 0.3,
        );
        container.add(shard);
      }
      break;
    }
    case EnemyType.VIRUS: {
      // Outer semi-transparent icosahedron capsid
      const outerCapsid = new THREE.Mesh(icosahedronGeometry, mats.coreMat);
      outerCapsid.scale.setScalar(size * 0.26);
      outerCapsid.name = 'outerCapsid';
      container.add(outerCapsid);

      // Inner dense replication core
      const innerCore = new THREE.Mesh(sphereGeometry, mats.innerCoreMat);
      innerCore.scale.setScalar(size * 0.15);
      innerCore.name = 'innerCore';
      container.add(innerCore);

      const vertices = [
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

      vertices.forEach((v, idx) => {
        v.normalize();
        const spikeGroup = new THREE.Group();
        spikeGroup.name = `spikeGroup_${idx}`;

        const base = new THREE.Mesh(cylinderYGeometry, mats.needleMat);
        base.scale.set(size * 0.02, size * 0.16, size * 0.02);
        base.position.set(0, size * 0.08, 0);

        const tip = new THREE.Mesh(sphereGeometry, mats.tipMat);
        tip.scale.setScalar(size * 0.04);
        tip.position.set(0, size * 0.17, 0);

        spikeGroup.add(base);
        spikeGroup.add(tip);

        // Orient spike group to point outward along vertex direction
        spikeGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
        spikeGroup.position.copy(v).multiplyScalar(size * 0.2);

        container.add(spikeGroup);
      });

      // DNA Double-Helix orbiting loop
      const dnaGroup = new THREE.Group();
      dnaGroup.name = 'dnaGroup';
      for (let i = 0; i < 8; i++) {
        const node = new THREE.Mesh(sphereGeometry, mats.dnaMat);
        node.name = `dnaNode_${i}`;
        node.scale.setScalar(size * 0.03);
        dnaGroup.add(node);
      }
      container.add(dnaGroup);
      break;
    }
    case EnemyType.FIREWALL: {
      // Left Pillar
      const leftPillar = new THREE.Mesh(boxGeometry, mats.pillarMat);
      leftPillar.scale.set(size * 0.15, size * 0.9, size * 0.15);
      leftPillar.position.set(-size * 0.4, 0, 0);
      leftPillar.name = 'leftPillar';
      container.add(leftPillar);

      // Right Pillar
      const rightPillar = leftPillar.clone();
      rightPillar.position.x = size * 0.4;
      rightPillar.name = 'rightPillar';
      container.add(rightPillar);

      // Glowing power strips on pillars
      const leftStrip = new THREE.Mesh(boxGeometry, mats.stripMat);
      leftStrip.scale.set(size * 0.02, size * 0.8, size * 0.16);
      leftStrip.position.set(-size * 0.4, 0, 0);
      container.add(leftStrip);

      const rightStrip = leftStrip.clone();
      rightStrip.position.x = size * 0.4;
      container.add(rightStrip);

      // Energy Gate Matrix: 6 overlapping horizontal/vertical shield tiles
      const shieldGroup = new THREE.Group();
      shieldGroup.name = 'shieldGroup';

      const rows = 2;
      const cols = 3;
      let count = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tile = new THREE.Mesh(boxGeometry, mats.shieldMat);
          tile.name = `tile_${count}`;
          tile.scale.set(size * 0.22, size * 0.22, size * 0.05);
          tile.position.set((c - 1) * size * 0.24, (r - 0.5) * size * 0.3, 0);
          shieldGroup.add(tile);
          count++;
        }
      }
      container.add(shieldGroup);

      // Projector nodes
      const leftNode = new THREE.Mesh(sphereGeometry, mats.stripMat);
      leftNode.scale.setScalar(size * 0.06);
      leftNode.position.set(-size * 0.4, size * 0.48, 0);
      leftNode.name = 'leftNode';
      container.add(leftNode);

      const rightNode = leftNode.clone();
      rightNode.position.x = size * 0.4;
      rightNode.name = 'rightNode';
      container.add(rightNode);
      break;
    }
    case EnemyType.ENFORCER: {
      // Armored central chassis
      const chassis = new THREE.Mesh(cylinderYGeometry, mats.chassisMat);
      chassis.scale.set(size * 0.18, size * 0.38, size * 0.18);
      chassis.rotation.x = Math.PI / 2;
      chassis.name = 'chassis';
      container.add(chassis);

      // Heavy curved compound shield in front (3 plates)
      const shieldGroup = new THREE.Group();
      shieldGroup.name = 'shieldGroup';
      shieldGroup.position.set(0, 0, size * 0.22);

      const centerPlate = new THREE.Mesh(boxGeometry, mats.chassisMat);
      centerPlate.scale.set(size * 0.35, size * 0.28, size * 0.05);
      centerPlate.name = 'centerPlate';
      shieldGroup.add(centerPlate);

      // Glowing trim on center plate
      const trim = new THREE.Mesh(boxGeometry, mats.eyeMat);
      trim.scale.set(size * 0.37, size * 0.03, size * 0.06);
      trim.position.set(0, size * 0.12, 0);
      shieldGroup.add(trim);

      // Flanking angled plates
      const leftPlate = new THREE.Mesh(boxGeometry, mats.chassisMat);
      leftPlate.scale.set(size * 0.16, size * 0.28, size * 0.04);
      leftPlate.position.set(-size * 0.245, 0, -size * 0.05); // pre-translated offset position
      leftPlate.rotation.y = Math.PI / 5;
      leftPlate.name = 'leftPlate';
      shieldGroup.add(leftPlate);

      const rightPlate = new THREE.Mesh(boxGeometry, mats.chassisMat);
      rightPlate.scale.set(size * 0.16, size * 0.28, size * 0.04);
      rightPlate.position.set(size * 0.245, 0, -size * 0.05);
      rightPlate.rotation.y = -Math.PI / 5;
      rightPlate.name = 'rightPlate';
      shieldGroup.add(rightPlate);

      container.add(shieldGroup);

      // Twin Gun Barrels
      const leftBarrel = new THREE.Mesh(cylinderZGeometry, mats.chassisMat);
      leftBarrel.scale.set(size * 0.03, size * 0.03, size * 0.28);
      leftBarrel.position.set(-size * 0.26, -size * 0.05, size * 0.05);
      leftBarrel.name = 'leftBarrel';
      container.add(leftBarrel);

      const rightBarrel = leftBarrel.clone();
      rightBarrel.position.x = size * 0.26;
      rightBarrel.name = 'rightBarrel';
      container.add(rightBarrel);

      // Repulsor lift nozzle
      const nozzle = new THREE.Mesh(cylinderYGeometry, mats.chassisMat);
      nozzle.scale.set(size * 0.1, size * 0.12, size * 0.1);
      nozzle.position.set(0, -size * 0.2, -size * 0.05);
      nozzle.name = 'nozzle';
      container.add(nozzle);

      const flame = new THREE.Mesh(coneZGeometry, mats.flameMat);
      flame.scale.set(size * 0.06, size * 0.06, size * 0.18);
      flame.rotation.y = Math.PI; // point backwards
      flame.position.set(0, -size * 0.25, -size * 0.05);
      flame.name = 'flame';
      container.add(flame);

      // Orbiting shield shards (2 shards rotating around Enforcer)
      const orbiterGroup = new THREE.Group();
      orbiterGroup.name = 'orbiterGroup';
      for (let i = 0; i < 2; i++) {
        const orb = new THREE.Mesh(boxGeometry, mats.shieldMat);
        orb.name = `orb_${i}`;
        orb.scale.set(size * 0.08, size * 0.15, size * 0.02);
        orbiterGroup.add(orb);
      }
      container.add(orbiterGroup);
      break;
    }
    case EnemyType.COLOSSUS: {
      // Bottom step (Stationary base)
      const baseStep = new THREE.Mesh(cylinderYGeometry, mats.darkMetal);
      baseStep.scale.set(size * 0.35, size * 0.18, size * 0.35);
      baseStep.name = 'baseStep';
      baseStep.position.y = -size * 0.2;
      container.add(baseStep);

      // Middle step (Rotates Clockwise)
      const midStep = new THREE.Mesh(cylinderYGeometry, mats.metalMat);
      midStep.scale.set(size * 0.26, size * 0.18, size * 0.26);
      midStep.name = 'midStep';
      midStep.position.y = 0;
      container.add(midStep);

      // Top step (Rotates Counter-Clockwise)
      const topStep = new THREE.Mesh(cylinderYGeometry, mats.darkMetal);
      topStep.scale.set(size * 0.16, size * 0.18, size * 0.16);
      topStep.name = 'topStep';
      topStep.position.y = size * 0.2;
      container.add(topStep);

      // Exhaust Pipes on top
      const exhaustGroup = new THREE.Group();
      exhaustGroup.name = 'exhaustGroup';

      const pipePositions = [
        new THREE.Vector3(-size * 0.08, size * 0.28, -size * 0.08),
        new THREE.Vector3(size * 0.08, size * 0.28, -size * 0.08),
      ];
      pipePositions.forEach((pos, idx) => {
        const pipe = new THREE.Mesh(cylinderYGeometry, mats.darkMetal);
        pipe.scale.set(size * 0.03, size * 0.16, size * 0.03);
        pipe.rotation.x = Math.PI / 6; // angled back
        pipe.position.copy(pos);
        pipe.name = `pipe_${idx}`;

        // Add fire/smoke cone
        const smoke = new THREE.Mesh(coneZGeometry, mats.energyMat);
        smoke.scale.set(size * 0.025, size * 0.025, size * 0.1);
        smoke.position.set(0, size * 0.1, -size * 0.05);
        smoke.name = `smoke_${idx}`;
        pipe.add(smoke);

        exhaustGroup.add(pipe);
      });
      container.add(exhaustGroup);

      // 4 Shield node projectors on base corners
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const projector = new THREE.Mesh(sphereGeometry, mats.energyMat);
        projector.scale.setScalar(size * 0.04);
        projector.position.set(
          Math.cos(angle) * size * 0.35,
          -size * 0.16,
          Math.sin(angle) * size * 0.35,
        );
        projector.name = `projector_${i}`;
        container.add(projector);
      }
      break;
    }
    case EnemyType.WARDEN: {
      // Octahedron core
      const core = new THREE.Mesh(octahedronGeometry, mats.coreMat);
      core.scale.setScalar(size * 0.24);
      core.name = 'core';
      container.add(core);

      // Inner glowing energy sphere
      const innerCore = new THREE.Mesh(sphereGeometry, mats.ringMat);
      innerCore.scale.setScalar(size * 0.12);
      innerCore.name = 'innerCore';
      container.add(innerCore);

      // Triple Gimbal Rings (horizontal, vertical-X, vertical-Z)
      const ring1 = new THREE.Mesh(torusGeometry, mats.ringMat);
      ring1.scale.setScalar(size * 0.42);
      ring1.rotation.x = Math.PI / 2;
      ring1.name = 'ring1';
      container.add(ring1);

      const ring2 = new THREE.Mesh(torusGeometry, mats.ringMat);
      ring2.scale.setScalar(size * 0.38);
      ring2.rotation.y = Math.PI / 2;
      ring2.name = 'ring2';
      container.add(ring2);

      const ring3 = new THREE.Mesh(torusGeometry, mats.ringMat);
      ring3.scale.setScalar(size * 0.46);
      ring3.name = 'ring3';
      container.add(ring3);

      // 4 orbiting crystal nodes
      const orbiterGroup = new THREE.Group();
      orbiterGroup.name = 'orbiterGroup';

      for (let i = 0; i < 4; i++) {
        const crystal = new THREE.Mesh(octahedronGeometry, mats.coreMat);
        crystal.scale.setScalar(size * 0.05);
        crystal.name = `crystal_${i}`;
        orbiterGroup.add(crystal);
      }
      container.add(orbiterGroup);
      break;
    }
    case EnemyType.HYDRA: {
      // 3 Hovering nodes
      const c1 = new THREE.Group();
      c1.position.set(-size * 0.26, 0, 0);
      c1.name = 'node1';
      const c1Mesh = new THREE.Mesh(icosahedronGeometry, mats.coreMat);
      c1Mesh.scale.setScalar(size * 0.15);
      c1.add(c1Mesh);
      const c1Ring = new THREE.Mesh(torusGeometry, mats.beamMat);
      c1Ring.scale.setScalar(size * 0.2);
      c1Ring.rotation.x = Math.PI / 2;
      c1Ring.name = 'ring1';
      c1.add(c1Ring);
      container.add(c1);

      const c2 = new THREE.Group();
      c2.position.set(0, size * 0.08, 0);
      c2.name = 'node2';
      const c2Mesh = new THREE.Mesh(icosahedronGeometry, mats.coreMat);
      c2Mesh.scale.setScalar(size * 0.18);
      c2.add(c2Mesh);
      const c2Ring = new THREE.Mesh(torusGeometry, mats.beamMat);
      c2Ring.scale.setScalar(size * 0.24);
      c2Ring.rotation.y = Math.PI / 2;
      c2Ring.name = 'ring2';
      c2.add(c2Ring);
      container.add(c2);

      const c3 = new THREE.Group();
      c3.position.set(size * 0.26, 0, 0);
      c3.name = 'node3';
      const c3Mesh = new THREE.Mesh(icosahedronGeometry, mats.coreMat);
      c3Mesh.scale.setScalar(size * 0.15);
      c3.add(c3Mesh);
      const c3Ring = c1Ring.clone();
      c3Ring.name = 'ring3';
      c3.add(c3Ring);
      container.add(c3);

      // Connecting energy beams
      const leftBeam = new THREE.Mesh(cylinderYGeometry, mats.beamMat);
      leftBeam.scale.set(size * 0.02, 1, size * 0.02); // Height scale is 1 initially, adjusted dynamically
      leftBeam.rotation.z = Math.PI / 2; // Lie flat along X-axis
      leftBeam.name = 'leftBeam';
      container.add(leftBeam);

      const rightBeam = new THREE.Mesh(cylinderYGeometry, mats.beamMat);
      rightBeam.scale.set(size * 0.02, 1, size * 0.02);
      rightBeam.rotation.z = Math.PI / 2;
      rightBeam.name = 'rightBeam';
      container.add(rightBeam);
      break;
    }
    case EnemyType.OVERSEER: {
      // Core sphere
      const core = new THREE.Mesh(sphereGeometry, mats.coreMat);
      core.scale.setScalar(size * 0.18);
      core.name = 'core';
      container.add(core);

      // Three Concentric Cages
      const ring1 = new THREE.Mesh(boxGeometry, mats.wireMat1);
      ring1.scale.setScalar(size * 0.32);
      ring1.name = 'ring1';
      container.add(ring1);

      const ring2 = new THREE.Mesh(octahedronGeometry, mats.wireMat2);
      ring2.scale.setScalar(size * 0.44);
      ring2.name = 'ring2';
      container.add(ring2);

      const ring3 = new THREE.Mesh(icosahedronGeometry, mats.wireMat3);
      ring3.scale.setScalar(size * 0.54);
      ring3.name = 'ring3';
      container.add(ring3);

      // 4 floating weapon satellite pods
      const satellites = new THREE.Group();
      satellites.name = 'satellites';
      for (let i = 0; i < 4; i++) {
        const sat = new THREE.Mesh(cylinderZGeometry, mats.darkMat);
        sat.scale.set(size * 0.04, size * 0.04, size * 0.15);
        sat.name = `sat_${i}`;

        const satGlow = new THREE.Mesh(sphereGeometry, mats.coreMat);
        satGlow.scale.setScalar(size * 0.025);
        satGlow.position.set(0, 0, size * 0.08);
        satGlow.name = 'glow';
        sat.add(satGlow);
        satellites.add(sat);
      }
      container.add(satellites);
      break;
    }
  }

  // Position it floating above the ground
  container.position.y = size * 0.35;
  return container;
}

export function spawnEnemy(
  scene: THREE.Scene,
  x: number,
  z: number,
  type: EnemyType = EnemyType.GLITCH,
) {
  const stats = ENEMY_STATS[type];
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);

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
    health: { current: stats.hp, max: stats.hp },
    moveSpeed: stats.speed,
    transform: group,
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
  const activeXPCount = Array.from(world.with('isXP')).length;
  if (activeXPCount >= MAX_ACTIVE_XP) {
    bankXP(value);
    return;
  }

  // Get tier based on value
  const tier = getTierForValue(value);

  // Create dummy Object3D (not added to the scene)
  const dummy = new THREE.Object3D();
  dummy.scale.setScalar(tier.size);
  dummy.position.set(x, 0.5, z);
  dummy.updateMatrixWorld(true);

  // Small random eject velocity
  const angle = Math.random() * Math.PI * 2;
  const force = 1.5;
  const velocity = new THREE.Vector3(Math.cos(angle) * force, 3.0, Math.sin(angle) * force);

  return world.add({
    isXP: true,
    position: dummy.position,
    velocity: velocity,
    xpValue: value,
    transform: dummy,
    particleColor: tier.color,
  });
}
