/**
 * OrbitalSystem - Simple orbital weapon handling
 *
 * Orbital projectiles rotate around the player at fixed positions.
 * Much simpler implementation than before.
 */

import { world } from '../core/world';
import * as THREE from 'three';

const ORBIT_RADIUS = 3.5;
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

    // Calculate position based on index (evenly spaced)
    const totalOrbitals = orbitals.filter((o) => o.orbitalData?.ownerId === player.id).length;
    const angleOffset = (i / totalOrbitals) * Math.PI * 2;
    const angle = globalOrbitAngle + angleOffset;

    // Position around player
    entity.position.x = player.position.x + Math.cos(angle) * ORBIT_RADIUS;
    entity.position.z = player.position.z + Math.sin(angle) * ORBIT_RADIUS;
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
  visualStyle: string,
  bulletWidth: number,
  bulletLength: number,
  _orbitSpeed: number,
) {
  // Count existing orbitals for this owner
  const existing = Array.from(world.with('isOrbital', 'orbitalData')).filter(
    (e) => e.orbitalData?.ownerId === owner.id,
  );

  const toSpawn = count - existing.length;
  if (toSpawn <= 0) return;

  console.log(`[Orbital] Spawning ${toSpawn} new orbitals for count=${count}`);

  // Create material
  const material = new THREE.MeshStandardMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: 2.0,
    roughness: 0,
    metalness: 0,
  });

  for (let i = 0; i < toSpawn; i++) {
    let mesh: THREE.Object3D;

    if (visualStyle === 'ORB') {
      const geo = new THREE.IcosahedronGeometry(bulletWidth, 1);
      mesh = new THREE.Mesh(geo, material);
    } else {
      // BOLT style - elongated blade
      const geo = new THREE.BoxGeometry(bulletWidth, bulletWidth * 0.5, bulletLength);
      mesh = new THREE.Mesh(geo, material);
    }

    // Initial position at player
    mesh.position.copy(owner.position);
    mesh.position.y = 0.8;
    mesh.castShadow = true;

    scene.add(mesh);

    world.add({
      isOrbital: true,
      isProjectile: true,
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
