import * as THREE from 'three';

// 1. Define the Shape of an Entity
export type Entity = {
  id?: number;

  // flags
  isPlayer?: boolean;
  isEnemy?: boolean;
  isProjectile?: boolean;
  isParticle?: boolean;
  isXP?: boolean;

  // data
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  transform?: THREE.Object3D;

  // input
  input?: {
    x: number;
    y: number;
    isShooting: boolean;
  };

  // combat
  health?: {
    current: number;
    max: number;
  };
  aimTarget?: THREE.Vector3;

  // weapon
  weapon?: {
    cooldownTimer: number;
    fireRate: number;
    damage: number;
    bulletSpeed: number;
    bulletColor: number;
    bulletLifetime: number;
  };

  // --- NEW STATS (Fixes the 9 Errors) ---
  level?: number;
  xp?: number;
  xpMax?: number; // XP needed for next level
  score?: number; // Total kills/data collected

  // misc
  lifeTimer?: number;
  maxLife?: number;
  damage?: number;
  xpValue?: number;

  // juice
  hitFlashTimer?: number;
  stunTimer?: number;
};

// 2. Create the ECS World
function createECS() {
  const entities: Entity[] = [];

  return {
    add: (entity: Entity) => {
      entities.push(entity);
      return entity;
    },
    remove: (entity: Entity) => {
      const index = entities.indexOf(entity);
      if (index > -1) {
        entities.splice(index, 1);
      }
    },
    // Query Helper
    with: (...components: (keyof Entity)[]) => {
      return {
        get first() {
          return entities.find((e) => components.every((c) => e[c] !== undefined));
        },
        [Symbol.iterator]: function* () {
          for (const e of entities) {
            if (components.every((c) => e[c] !== undefined)) {
              yield e;
            }
          }
        },
      };
    },
  };
}

export const world = createECS();
