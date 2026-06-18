import { dlog } from '../core/debug';
import { world } from '../core/world';
import * as THREE from 'three';
import { createKinematicBody, isRapierInitialized } from '../core/RapierWorld';
import { createCustomProjectileMesh } from '../core/projectileVisuals';

const ORBIT_RADIUS = 3.5;
// ... (rest of constants and OrbitalSystem unchanged)
const ORBIT_SPEED = 2.5; // Radians per second

// Track orbital angle globally
let globalOrbitAngle = 0;

export function OrbitalSystem(dt: number) {
  const player = world.with('isPlayer', 'position').first;
  if (!player) return;

  // Update global angle
  globalOrbitAngle += ORBIT_SPEED * dt;

  // Get all orbitals for the player
  const orbitals = Array.from(world.with('isOrbital', 'position', 'transform', 'orbitalData'));

  for (let i = 0; i < orbitals.length; i++) {
    const entity = orbitals[i];
    if (!entity.orbitalData || entity.orbitalData.ownerId !== player.id) continue;

    // Find other orbitals of the same weapon type to space them evenly
    const sameWeaponOrbitals = orbitals.filter(
      (o) => o.orbitalData?.ownerId === player.id && o.weaponId === entity.weaponId,
    );
    const idx = sameWeaponOrbitals.indexOf(entity);
    const total = sameWeaponOrbitals.length;

    if (total === 0 || idx === -1) continue;

    const angleOffset = (idx / total) * Math.PI * 2;

    // Customize radius and rotation based on weapon type
    const isBlade = entity.weaponId === 'photon_blades' || entity.weaponId === 'photon_curtain';
    const orbitRadius = isBlade ? 5.0 : 3.5;
    const direction = isBlade ? -1.0 : 1.0;
    const speedMult = isBlade ? 0.85 : 1.0;
    const angle = globalOrbitAngle * direction * speedMult + angleOffset;

    // Position around player
    entity.position.x = player.position.x + Math.cos(angle) * orbitRadius;
    entity.position.z = player.position.z + Math.sin(angle) * orbitRadius;
    entity.position.y = 0.8;

    // Rotate mesh to face tangent
    if (entity.transform) {
      entity.transform.rotation.y = -angle + Math.PI / 2;
    }
  }
}

/**
 * Spawn orbital projectiles around the player
 */
export function spawnOrbitalProjectile(
  scene: THREE.Scene,
  owner: any,
  count: number,
  damage: number,
  color: number,
  _visualStyle: string,
  bulletWidth: number,
  bulletLength: number,
  _orbitSpeed: number,
  weaponId: string = '',
) {
  // Count existing orbitals for this owner and weapon type
  const existing = Array.from(world.with('isOrbital', 'orbitalData')).filter(
    (e) => e.orbitalData?.ownerId === owner.id && e.weaponId === weaponId,
  );

  const toSpawn = count - existing.length;
  if (toSpawn <= 0) return;

  dlog(`[Orbital] Spawning ${toSpawn} new orbitals for count=${count}`);

  for (let i = 0; i < toSpawn; i++) {
    // Generate tangent facing direction for initial mesh orientation
    const angle = (i / count) * Math.PI * 2;
    const tangentDir = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));

    const mesh = createCustomProjectileMesh(weaponId, color, bulletWidth, bulletLength, tangentDir);

    // Initial position at player
    mesh.position.copy(owner.position);
    mesh.position.y = 0.8;
    mesh.castShadow = true;

    scene.add(mesh);

    const projectile = world.add({
      isOrbital: true,
      isProjectile: true,
      weaponId: weaponId,
      position: mesh.position,
      velocity: new THREE.Vector3(0, 0, 0),
      transform: mesh,
      damage: damage,
      orbitalData: {
        ownerId: owner.id,
        angle: 0,
        orbitSpeed: 0,
        orbitRadius: ORBIT_RADIUS,
      },
      projectile: {
        pierce: 999,
        explodeRadius: 0,
        knockback: 5,
        hitList: [],
        spinSpeed: 0,
      },
      lifeTimer: 0,
      maxLife: 9999,
    });

    // Add Rapier rigid body for collision
    if (isRapierInitialized() && projectile.id !== undefined) {
      const radius = bulletWidth * 1.5; // Orbitals have a larger presence
      const { rigidBody, collider } = createKinematicBody(
        mesh.position.x,
        mesh.position.z,
        radius,
        projectile.id,
      );
      projectile.rigidBody = rigidBody;
      projectile.collider = collider;
    }
  }
}

export function removePlayerOrbitals(ownerId: number, scene: THREE.Scene) {
  for (const entity of world.with('isOrbital', 'orbitalData', 'transform')) {
    if (entity.orbitalData?.ownerId === ownerId) {
      if (entity.transform) scene.remove(entity.transform);
      world.remove(entity);
    }
  }
}
