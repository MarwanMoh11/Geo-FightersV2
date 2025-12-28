import * as THREE from 'three';
import type { PlayerStats } from './PlayerStats';

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
  isEnemy?: boolean;
  isProjectile?: boolean;
  isParticle?: boolean;
  isXP?: boolean;
  isWeapon?: boolean;
  isChest?: boolean;
  ownerId?: number;
  chestRarity?: 'common' | 'rare' | 'epic';

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
  weapon?: {
    cooldownTimer: number;
    fireRate: number;
    damage: number;
    bulletSpeed: number;
    bulletColor: number;
    bulletLifetime: number;

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
  };
}

export const world = createECS();
