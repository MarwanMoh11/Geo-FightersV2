import * as THREE from 'three';
import type { PlayerStats } from './PlayerStats';
import type { ExploitDef } from './ExploitRegistry';
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

export interface ProjectileMods {
  pierce: number;
  explodeRadius: number;
  knockback: number;
  hitList: number[];
  spinSpeed?: number;
  confusionDuration?: number;
  // --- exploit-driven (added by build-depth plan); all default to 0/empty when unused
  ricochetLeft?: number;
  ricochetDamageMult?: number;
  chainLeft?: number;
  chainRange?: number;
  poolOnKill?: number; // damage per second
  poolRadius?: number;
  poolDuration?: number;
  procEvery?: number; // 0 = off; >0 = proc cadence in seconds
  procTimer?: number; // runtime accumulator
  critProc?: boolean;
  pierceProcOnProc?: boolean;
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
  isPool?: boolean;
  dps?: number;
  radius?: number;
  // Breach-dive ICE construct: enemy entity spawned inside the dive sub-scene
  // and cleaned up on teardown (Bug B). True only for dive-local illusions.
  isICE?: boolean;
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
  // TODO(@grunt): initialize in factories.ts spawnPlayer player literal
  exploitSlots?: (ExploitDef | null)[];
  overflowAccumulator?: Partial<Record<'cooldown' | 'might' | 'area' | 'amount', number>>;

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
  projectile?: ProjectileMods;
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
  /**
   * This player is jacked into a breach dive. Their arena body kneels at the
   * terminal: it does not accept movement input or fire, and teammates defend
   * it. Replicated in co-op so every client renders the kneeling pose and the
   * host grants the same damage bubble it grants for blocking modals.
   */
  isDiving?: boolean;

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
    'isPool',
    'isAnomaly',
    'isWeapon',
    'isChest',
    'isDestructible',
    'isPickup',
    'isPlayer',
    'isLocalPlayer',
    'isBossShockwave',
    'isICE',
    'lifeTimer',
    'transform',
    'abilityKind',
  ];

  const indexes = new Map<keyof Entity, Set<Entity>>();
  for (const key of indexKeys) {
    indexes.set(key, new Set<Entity>());
  }

  // A component counts as PRESENT when it is neither undefined nor an explicit
  // `false`. The flags in indexKeys are all optional booleans, and `false` means
  // "doesn't have it" — treating it as present is what let `isLocalPlayer: false`
  // put remote players into the local-player index. Numbers (lifeTimer: 0) and
  // objects are unaffected.
  const has = (entity: Entity, key: keyof Entity) =>
    entity[key] !== undefined && entity[key] !== false;

  const addToIndexes = (entity: Entity) => {
    for (const key of indexKeys) {
      if (has(entity, key)) {
        indexes.get(key)!.add(entity);
      }
    }
  };

  const removeFromIndexes = (entity: Entity) => {
    // Unconditional: a flag may have been flipped since add(), and leaving the
    // entity in a stale index Set is how removed entities keep getting iterated.
    for (const key of indexKeys) {
      indexes.get(key)!.delete(entity);
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
      const mapped = entity.id !== undefined ? idIndex.get(entity.id) : undefined;

      // The mapped slot MUST actually hold this entity before we swap-remove it.
      //
      // If anything reassigns `entity.id` after world.add() (the network mirrors
      // used to, to adopt the host's id), idIndex ends up pointing at a
      // different entity's slot. The old unguarded swap then overwrote that live
      // entity, popped a second one off the end, and — when the index was past
      // the end — left `undefined` holes in `entities`. Every later
      // world.with() that fell back to scanning `entities` (any query whose
      // components aren't indexed, e.g. `isBoss`) then threw on the holes, and
      // once `entities` had been over-popped to empty while idIndex still held
      // keys, `last` came back undefined and remove() itself threw.
      //
      // Falling back to a linear scan is O(n) but only on the corrupt path,
      // which should now be unreachable.
      const index =
        mapped !== undefined && entities[mapped] === entity ? mapped : entities.indexOf(entity);

      if (index !== -1) {
        // Drop our own mapping first so the swap below can't resurrect it.
        if (entity.id !== undefined && mapped === index) idIndex.delete(entity.id);
        const last = entities[entities.length - 1];
        entities.pop();
        if (last !== entity) {
          entities[index] = last;
          if (last?.id !== undefined) idIndex.set(last.id, index);
        }
      } else if (entity.id !== undefined && mapped !== undefined) {
        // Not in the array at all — clear the dangling mapping.
        idIndex.delete(entity.id);
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

      // Explicit loop, not `components.every(c => has(e, c))`. `every` with an
      // arrow closing over `e` allocates a fresh closure FOR EVERY ENTITY
      // VISITED, and the hottest queries in the game are the un-indexed ones
      // (PhysicsSystem's `with('position','velocity')` falls back to scanning
      // the whole entity array). At horde density that was thousands of
      // throwaway closures per frame, per query, feeding the GC for nothing.
      const matches = (e: Entity): boolean => {
        for (let i = 0; i < components.length; i++) {
          if (!has(e, components[i])) return false;
        }
        return true;
      };

      return {
        get first() {
          for (const e of source) {
            if (e !== undefined && matches(e)) {
              return e;
            }
          }
          return undefined;
        },
        [Symbol.iterator]: function* () {
          for (const e of source) {
            if (e !== undefined && matches(e)) {
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
