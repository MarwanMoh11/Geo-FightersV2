import { World } from 'miniplex';
import * as THREE from 'three';

export type Entity = {
    id?: number;

    // Tags
    isPlayer?: boolean;
    isEnemy?: boolean; // <--- New Tag
    isProjectile?: boolean;

    // Physics
    position?: THREE.Vector3;
    velocity?: THREE.Vector3;
    transform?: THREE.Object3D;

    // Stats
    health?: { current: number; max: number };
    damage?: number;

    // Input & Aiming
    input?: {
        x: number;
        y: number;
        isShooting: boolean;
    };

    // <--- NEW: Where is this entity aiming?
    aimTarget?: THREE.Vector3;


    // --- WEAPONRY ---
    weapon?: {
        cooldownTimer: number; // Counts down to 0
        fireRate: number;      // Time between shots (e.g., 0.2s)
        damage: number;
        bulletSpeed: number;
        bulletColor: number;
        bulletLifetime: number; // How long bullets last
    };

    // --- PROJECTILE STATS ---
    lifeTimer?: number; // Counts UP to expire
    maxLife?: number;   // When to die
};

export const world = new World<Entity>();