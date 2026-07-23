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
  playerName?: string; // multiplayer display name (remote players)
  character?: string; // chosen character id (used to tint remote avatars)
  kills?: number; // per-player kill count (co-op scoreboard)
  reviveProgress?: number; // 0-1 while a teammate is reviving this dead player
  ownerConnId?: string; // projectiles: connectionId of the player who fired (kill credit)
  // Wave-scaled contact-damage multiplier (set at spawn, decays the game clock)
  wavePower?: number;
  // Network smoothing targets (clients lerp remote entities toward these)
  netX?: number;
  netZ?: number;
  // Client-side cosmetic knockback impulse (units/s, decays fast) so hits on
  // synced enemies read as an instant shove instead of a filtered 30Hz drift
  fxKickX?: number;
  fxKickZ?: number;
  // Client-side mirror of a host-simulated entity (e.g. enemy projectiles)
  _epMirror?: boolean;
  isEnemy?: boolean;
  isProjectile?: boolean;
  isEnemyProjectile?: boolean;
  isParticle?: boolean;
  isXP?: boolean;
  isCredit?: boolean;
  creditValue?: number;
  isLashTear?: boolean;
  hitList?: number[];
  isAnomaly?: boolean;
  anomalyType?: 'overclock' | 'defrag' | 'leak';
  isVault?: boolean; // data vault greed event (crack for credits + chest)
  isWeapon?: boolean;
  isChest?: boolean;
  isOrbital?: boolean;
  ownerId?: number;
  chestRarity?: 'common' | 'uncommon' | 'rare' | 'epic';
  enemyType?: string; // 'virus' | 'glitch' | 'firewall'
  isBoss?: boolean;
  spawnTimer?: number;
  chargeTimer?: number;
  confusedTimer?: number; // Signal Hijacker: enemy attacks other enemies when > 0
  // VS contact model (Phase 1.98): per-enemy touch-damage cooldown so
  // incoming damage scales with how many bodies are touching the player
  contactCooldown?: number;

  abilityKind?: string;
  abilityTimer?: number;
  dashState?: 'idle' | 'windup' | 'dash' | 'recover';
  phased?: boolean;
  shieldArc?: number;
  shieldTimer?: number;
  telegraph?: number;
  winding?: boolean;
  shieldHp?: number;
  absorbHp?: number;
  noSplit?: boolean;
  lobbing?: number;

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
  color?: number;

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

  // Cosmetic animation timers (Phase 1.5 body language — no gameplay effect)
  recoilTimer?: number; // player kicks back briefly on weapon fire
  levelUpFxTimer?: number; // celebratory flourish on level up
  spawnAnimTimer?: number; // enemies scale-pop in when spawned

  // Phase 1.95 map layer
  isDestructible?: boolean; // instanced scrap crates (DestructibleSystem)
  isPickup?: boolean; // floor consumables
  pickupType?: string; // 'medkit' | 'magnet' | 'bomb'

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
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  rotationX?: number;
  rotationZ?: number;

  // Boss Shockwave Logic
  isBossShockwave?: boolean;
  shockwaveRadius?: number;
  shockwaveMaxRadius?: number;
  shockwaveDamageDealt?: boolean;

  // Rapier physics body (Phase 2)
  rigidBody?: RAPIER.RigidBody;
  collider?: RAPIER.Collider;
  isUpgrading?: boolean;

  // Spatial representation for scene-graph bypass (Phase 5)
  rotationY?: number;
  size?: number;
};

function createECS() {
  const entities: Entity[] = [];

  const indexKeys: (keyof Entity)[] = [
    'isEnemy',
    'isProjectile',
    'isEnemyProjectile',
    'isParticle',
    'isInstancedParticle',
    'isXP',
    'isLashTear',
    'isAnomaly',
    'isWeapon',
    'isChest',
    'isDestructible',
    'isPickup',
    'isPlayer',
    'isLocalPlayer',
    'isBossShockwave',
    'lifeTimer',
    'transform',
    'abilityKind',
  ];

  const indexes = new Map<keyof Entity, Set<Entity>>();
  for (const key of indexKeys) {
    indexes.set(key, new Set<Entity>());
  }

  const addToIndexes = (entity: Entity) => {
    for (const key of indexKeys) {
      if (entity[key] !== undefined) {
        indexes.get(key)!.add(entity);
      }
    }
  };

  const removeFromIndexes = (entity: Entity) => {
    for (const key of indexKeys) {
      if (entity[key] !== undefined) {
        indexes.get(key)!.delete(entity);
      }
    }
  };

  // id -> slot in `entities`, so remove() is O(1) swap-remove and get() is
  // O(1) instead of indexOf+find scans (matters at horde entity counts where
  // hundreds of deaths/pickups happen per second).
  const idIndex = new Map<number, number>();

  return {
    add: (entity: Entity) => {
      entity.id = generateId();
      idIndex.set(entity.id, entities.length);
      entities.push(entity);
      addToIndexes(entity);
      return entity;
    },
    remove: (entity: Entity) => {
      const index = entity.id !== undefined ? idIndex.get(entity.id) : undefined;
      if (index !== undefined) {
        const last = entities[entities.length - 1];
        entities[index] = last;
        if (last.id !== undefined) idIndex.set(last.id, index);
        entities.pop();
        idIndex.delete(entity.id!);
      }
      removeFromIndexes(entity);
    },
    with: (...components: (keyof Entity)[]) => {
      let bestKey: keyof Entity | null = null;
      let minSize = Infinity;

      for (const comp of components) {
        const idx = indexes.get(comp);
        if (idx) {
          if (idx.size < minSize) {
            minSize = idx.size;
            bestKey = comp;
          }
        }
      }

      const source = bestKey ? indexes.get(bestKey)! : entities;

      return {
        get first() {
          for (const e of source) {
            if (components.every((c) => e[c] !== undefined)) {
              return e;
            }
          }
          return undefined;
        },
        [Symbol.iterator]: function* () {
          for (const e of source) {
            if (components.every((c) => e[c] !== undefined)) {
              yield e;
            }
          }
        },
      };
    },
    get: (id: number) => {
      const index = idIndex.get(id);
      return index !== undefined ? entities[index] : undefined;
    },
    count: (comp: keyof Entity) => {
      const idx = indexes.get(comp);
      return idx ? idx.size : 0;
    },
  };
}

export const world = createECS();
