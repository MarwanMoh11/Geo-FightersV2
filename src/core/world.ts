import * as THREE from 'three';

let nextId = 0;
export const generateId = () => ++nextId;

export type Entity = {
  id?: number;

  // flags
  isPlayer?: boolean;
  isEnemy?: boolean;
  isProjectile?: boolean;
  isParticle?: boolean;
  isXP?: boolean;
  isWeapon?: boolean;
  ownerId?: number;

  // data
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  transform?: THREE.Object3D;

  // input
  input?: { x: number; y: number; isShooting: boolean };

  // combat
  health?: { current: number; max: number };
  aimTarget?: THREE.Vector3;

  // WEAPON COMPONENT
  weapon?: {
    cooldownTimer: number;
    fireRate: number;
    damage: number;
    bulletSpeed: number;
    bulletColor: number;
    bulletLifetime: number;

    // --- VISUALS (New) ---
    bulletWidth?: number; // Thickness
    bulletLength?: number; // Length (along trajectory)

    // BALLISTICS
    bulletCount?: number;
    bulletSpread?: number;
    knockback?: number;
    bulletPierce?: number;
    bulletExplodeRadius?: number;
  };

  // MODIFIERS
  modifiers?: { damageAdd: number; fireRateMult: number; speedMult: number };

  // PROJECTILE DATA
  projectile?: {
    pierce: number;
    hitList: number[];
    knockback: number;
    explodeRadius: number;
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
