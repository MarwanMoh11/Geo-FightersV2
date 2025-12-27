import { world } from '../core/world';
import * as THREE from 'three';

const dummyOrigin = new THREE.Vector3();

export function WeaponSystem(dt: number, scene: THREE.Scene) {
    // Query entities that have a Weapon, Position, and Aim
    for (const entity of world.with('weapon', 'position', 'aimTarget')) {

        // 1. Tick down cooldown
        if (entity.weapon.cooldownTimer > 0) {
            entity.weapon.cooldownTimer -= dt;
        }

        // 2. Check Firing Condition
        // In "Survivor" games, you usually fire automatically, or when input.isShooting is true.
        // Let's assume Auto-Fire for now if a target exists, OR manual fire.
        const wantsToFire = entity.input?.isShooting || (entity.aimTarget.lengthSq() > 0);

        // 3. Fire!
        if (wantsToFire && entity.weapon.cooldownTimer <= 0) {
            spawnProjectile(entity, scene);
            entity.weapon.cooldownTimer = entity.weapon.fireRate; // Reset cooldown
        }
    }
}

function spawnProjectile(shooter: any, scene: THREE.Scene) {
    // Calculate Direction
    const direction = new THREE.Vector3()
        .subVectors(shooter.aimTarget, shooter.position)
        .normalize();

    // Handle edge case: if shooter is exactly on target, shoot forward
    if (direction.lengthSq() === 0) direction.set(0, 0, 1);

    // Create Visuals (Yellow Cube Bullet)
    const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const material = new THREE.MeshStandardMaterial({
        color: shooter.weapon.bulletColor,
        emissive: shooter.weapon.bulletColor,
        emissiveIntensity: 0.5
    });
    const mesh = new THREE.Mesh(geometry, material);

    // Start at shooter position (plus a little offset forward)
    mesh.position.copy(shooter.position).add(direction.clone().multiplyScalar(1.0));
    mesh.castShadow = true;
    scene.add(mesh);

    // Create Entity
    world.add({
        isProjectile: true,
        position: mesh.position,
        velocity: direction.multiplyScalar(shooter.weapon.bulletSpeed), // PhysicsSystem handles the moving!
        lifeTimer: 0,
        maxLife: shooter.weapon.bulletLifetime,
        transform: mesh
    });
}