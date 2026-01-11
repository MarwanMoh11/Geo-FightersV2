/**
 * RapierWorld.ts - Physics Engine Management
 * 
 * Manages Rapier.js WASM physics engine initialization and simulation.
 * Provides collision event handling and entity-collider mapping.
 */

import RAPIER from '@dimforge/rapier3d-compat';

// Rapier world instance (singleton)
let rapierWorld: RAPIER.World | null = null;
let eventQueue: RAPIER.EventQueue | null = null;

// Map collider handles to entity IDs for collision lookup
const colliderToEntityMap = new Map<number, number>();

/**
 * Initialize the Rapier WASM module and create physics world.
 * Must be called before any physics operations.
 */
export async function initRapier(): Promise<void> {
    console.log('[Rapier] Initializing WASM module...');

    // Initialize Rapier WASM
    await RAPIER.init();

    // Create physics world with gravity (Y-down)
    const gravity = new RAPIER.Vector3(0.0, -9.81, 0.0);
    rapierWorld = new RAPIER.World(gravity);

    // Create event queue for collision detection
    eventQueue = new RAPIER.EventQueue(true);

    console.log('[Rapier] ✅ Physics world initialized');
}

/**
 * Get the Rapier physics world instance.
 */
export function getRapierWorld(): RAPIER.World {
    if (!rapierWorld) {
        throw new Error('[Rapier] World not initialized. Call initRapier() first.');
    }
    return rapierWorld;
}

/**
 * Get the collision event queue.
 */
export function getEventQueue(): RAPIER.EventQueue {
    if (!eventQueue) {
        throw new Error('[Rapier] EventQueue not initialized. Call initRapier() first.');
    }
    return eventQueue;
}

/**
 * Step the physics simulation.
 * @param dt Delta time in seconds
 */
export function stepPhysics(_dt: number): void {
    if (!rapierWorld || !eventQueue) return;

    // Use fixed timestep for stability (Rapier handles interpolation)
    rapierWorld.step(eventQueue);
}

/**
 * Register a collider-entity mapping for collision callbacks.
 */
export function registerColliderEntity(colliderHandle: number, entityId: number): void {
    colliderToEntityMap.set(colliderHandle, entityId);
}

/**
 * Unregister a collider when entity is removed.
 */
export function unregisterCollider(colliderHandle: number): void {
    colliderToEntityMap.delete(colliderHandle);
}

/**
 * Get entity ID from collider handle.
 */
export function getEntityByColliderHandle(handle: number): number | undefined {
    return colliderToEntityMap.get(handle);
}

/**
 * Create a static cuboid collider for obstacles.
 */
export function createStaticCuboid(
    x: number, z: number,
    halfWidth: number, halfHeight: number, halfDepth: number
): RAPIER.Collider {
    const world = getRapierWorld();

    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfWidth, halfHeight, halfDepth)
        .setTranslation(x, halfHeight, z);

    return world.createCollider(colliderDesc);
}

/**
 * Create a dynamic rigid body with ball collider for entities.
 * Uses kinematic position-based for arcade control - we set position, Rapier detects collisions.
 */
export function createDynamicBody(
    x: number, z: number,
    radius: number,
    entityId: number
): { rigidBody: RAPIER.RigidBody; collider: RAPIER.Collider } {
    const world = getRapierWorld();

    // Use kinematic position-based: we control position, Rapier handles collision detection
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(x, 0.5, z)
        .setCcdEnabled(true);

    const rigidBody = world.createRigidBody(bodyDesc);

    // Create ball collider (NOT a sensor - we want physical collision response)
    const colliderDesc = RAPIER.ColliderDesc.ball(radius)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
        .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.DEFAULT | RAPIER.ActiveCollisionTypes.KINEMATIC_KINEMATIC);

    const collider = world.createCollider(colliderDesc, rigidBody);

    // Register for collision lookup
    registerColliderEntity(collider.handle, entityId);

    return { rigidBody, collider };
}

/**
 * Create a kinematic rigid body for projectiles (sensor, no physics response).
 */
export function createKinematicBody(
    x: number, z: number,
    radius: number,
    entityId: number
): { rigidBody: RAPIER.RigidBody; collider: RAPIER.Collider } {
    const world = getRapierWorld();

    // Kinematic position-based body (we control position directly)
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(x, 0.5, z)
        .setCcdEnabled(true);

    const rigidBody = world.createRigidBody(bodyDesc);

    // Sensor collider (detects overlaps but doesn't push)
    const colliderDesc = RAPIER.ColliderDesc.ball(radius)
        .setSensor(true)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
        .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.DEFAULT | RAPIER.ActiveCollisionTypes.KINEMATIC_KINEMATIC);

    const collider = world.createCollider(colliderDesc, rigidBody);

    registerColliderEntity(collider.handle, entityId);

    return { rigidBody, collider };
}

/**
 * Remove a rigid body and its colliders from the world.
 */
export function removeBody(rigidBody: RAPIER.RigidBody): void {
    const world = getRapierWorld();

    // Get collider count and unregister each
    const numColliders = rigidBody.numColliders();
    for (let i = 0; i < numColliders; i++) {
        const collider = rigidBody.collider(i);
        if (collider) {
            unregisterCollider(collider.handle);
        }
    }

    world.removeRigidBody(rigidBody);
}

/**
 * Check if Rapier is initialized.
 */
export function isRapierInitialized(): boolean {
    return rapierWorld !== null;
}
