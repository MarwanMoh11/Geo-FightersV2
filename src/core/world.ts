import * as THREE from 'three';
import type { PlayerStats } from './PlayerStats';
import type RAPIER from '@dimforge/rapier3d-compat';

let nextId = 0;
export const generateId = () => ++nextId;

// Inventory slot types
export interface WeaponSlot {
  weaponId: string;
  level: number;
}

export interface PassiveSlot {
  passiveId: string;
  level: number;
}

export type Entity = {
  id?: number;

  // flags
  isPlayer?: boolean;
  isLocalPlayer?: boolean;
  connectionId?: string;
  isEnemy?: boolean;
  isProjectile?: boolean;
  isEnemyProjectile?: boolean;
  isParticle?: boolean;
  isXP?: boolean;
  isWeapon?: boolean;
  isChest?: boolean;
  isOrbital?: boolean;
  ownerId?: number;
  chestRarity?: 'common' | 'rare' | 'epic';
  enemyType?: string; // 'virus' | 'glitch' | 'firewall'
  isBoss?: boolean;
  spawnTimer?: number;
  chargeTimer?: number;
  confusedTimer?: number; // Signal Hijacker: enemy attacks other enemies when > 0

  // Orbital weapon data
  orbitalData?: {
    ownerId: number;
    angle: number;
    orbitSpeed: number;
    orbitRadius: number;
  };

  // VS-style inventory
  weaponSlots?: WeaponSlot[];
  passiveSlots?: PassiveSlot[];
  stats?: PlayerStats;

  // data
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  transform?: THREE.Object3D;
  sprite?: THREE.Sprite;
  spriteRight?: THREE.Sprite;
  spriteLeft?: THREE.Sprite;
  facingRight?: boolean;

  // input
  input?: { x: number; y: number; isShooting: boolean };

  // combat
  health?: { current: number; max: number };
  aimTarget?: THREE.Vector3;

  // WEAPON
  weaponId?: string; // Track which weapon definition this entity belongs to
  weapon?: {
    cooldownTimer: number;
    fireRate: number;
    damage: number;
    bulletSpeed: number;
    bulletColor: number;
    bulletLifetime: number;
    category?: string; // 'directional' | 'aoe' | 'orbit' | 'global'

    // VISUALS
    bulletWidth?: number;
    bulletLength?: number;
    visualStyle?: string; // 'BOLT', 'SHARD', 'ORB'

    // BALLISTICS
    bulletCount?: number;
    bulletSpread?: number;
    knockback?: number;
    bulletPierce?: number;
    bulletExplodeRadius?: number;
  };

  // MODIFIERS
  modifiers?: { damageAdd: number; fireRateMult: number; speedMult: number };

  // PROJECTILE
  projectile?: {
    pierce: number;
    hitList: number[];
    knockback: number;
    explodeRadius: number;
    // New: visual rotation speed for ORBS
    spinSpeed?: number;
    // Signal Hijacker: applies confusion instead of damage
    confusionDuration?: number;
  };

  // stats
  level?: number;
  xp?: number;
  xpMax?: number;
  score?: number;
  moveSpeed?: number;

  // misc
  lifeTimer?: number;
  maxLife?: number;
  damage?: number;
  xpValue?: number;
  hitFlashTimer?: number;
  stunTimer?: number;
  baseColor?: number;

  // Post-hit invulnerability window (player)
  invulnTimer?: number;
  // Decaying knockback impulse, applied on top of input velocity (player)
  knockback?: THREE.Vector3;
  // Per-particle tumble rates so debris doesn't spin in lockstep
  spinX?: number;
  spinZ?: number;
  // Expanding ring FX: target scale multiplier reached at end of life
  ringGrow?: number;
  isInstancedParticle?: boolean;
  particleColor?: number;

  // Boss Shockwave Logic
  isBossShockwave?: boolean;
  shockwaveRadius?: number;
  shockwaveMaxRadius?: number;
  shockwaveDamageDealt?: boolean;

  // Rapier physics body (Phase 2)
  rigidBody?: RAPIER.RigidBody;
  collider?: RAPIER.Collider;
  isUpgrading?: boolean;
};

function createECS() {
  const entities: Entity[] = [];
  return {
    add: (entity: Entity) => {
      entity.id = generateId();
      entities.push(entity);
      return entity;
    },
    remove: (entity: Entity) => {
      const index = entities.indexOf(entity);
      if (index > -1) entities.splice(index, 1);
    },
    with: (...components: (keyof Entity)[]) => {
      return {
        get first() {
          return entities.find((e) => components.every((c) => e[c] !== undefined));
        },
        [Symbol.iterator]: function* () {
          for (const e of entities) {
            if (components.every((c) => e[c] !== undefined)) yield e;
          }
        },
      };
    },
    get: (id: number) => {
      return entities.find((e) => e.id === id);
    },
  };
}

export const world = createECS();
