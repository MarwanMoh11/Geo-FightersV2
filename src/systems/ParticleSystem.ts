import { world } from '../core/world';
import * as THREE from 'three';

const PARTICLE_GRAVITY = 25.0;
const maxParticles = 2000;
const explosionGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const particleMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
});

let instancedMesh: THREE.InstancedMesh | null = null;

// Reusable math objects to prevent per-frame allocations during rendering
const tempPosition = new THREE.Vector3();
const tempScale = new THREE.Vector3();
const tempRotation = new THREE.Euler();
const tempQuaternion = new THREE.Quaternion();
const tempMatrix = new THREE.Matrix4();
const tempColor = new THREE.Color();

/**
 * Per-frame particle tick: update lifetimes, gravity, spin, and scale for all
 * active particles, then render instanced debris via InstancedMesh.
 *
 * @param {number} dt - delta time since last frame in seconds
 * @param {THREE.Scene} [scene] - the Three.js scene for instanced particle rendering
 */
export function ParticleSystem(dt: number, scene?: THREE.Scene) {
  // 1. Update active particles' physics, scale, and rotations
  for (const entity of world.with('isParticle', 'lifeTimer', 'maxLife')) {
    if (entity.lifeTimer === undefined || entity.maxLife === undefined) continue;

    // Calculate Progress (0.0 = New, 1.0 = Dead)
    const age = Math.min(entity.lifeTimer / entity.maxLife, 1);

    // 2a. EXPANDING RINGS (blast waves, evolution flashes): grow + fade out (not instanced)
    if (entity.ringGrow !== undefined && entity.transform) {
      const eased = 1 - (1 - age) * (1 - age); // ease-out
      entity.transform.scale.setScalar(1 + eased * entity.ringGrow);
      const mesh = entity.transform as { material?: { opacity?: number } };
      if (mesh.material && mesh.material.opacity !== undefined) {
        mesh.material.opacity = 0.8 * (1 - age);
      }
      continue;
    }

    // 2b. Instanced particles (calculate spatial properties directly on coordinates)
    if (entity.isInstancedParticle) {
      // Gravity arc for debris (skip flat FX rings, which carry no spin)
      if (entity.spinX !== undefined && entity.velocity) {
        entity.velocity.y -= PARTICLE_GRAVITY * dt;
        if (entity.position.y < 0.05 && entity.velocity.y < 0) {
          entity.position.y = 0.05;
          entity.velocity.y *= -0.4; // small bounce
        }
      }

      // Tumble: ease out with age
      const spinEase = 1 - age;
      if (entity.rotationX !== undefined) {
        entity.rotationX += (entity.spinX ?? 10) * spinEase * dt;
      }
      if (entity.rotationZ !== undefined) {
        entity.rotationZ += (entity.spinZ ?? 5) * spinEase * dt;
      }
    } else if (entity.transform) {
      // 2c. Non-instanced particles (other legacy debris)
      // Shrink over time with an ease-out so the pop reads better
      const scale = 1.0 - age * age;
      entity.transform.scale.setScalar(Math.max(scale, 0.001));

      // Gravity arc for debris
      if (entity.spinX !== undefined && entity.velocity) {
        entity.velocity.y -= PARTICLE_GRAVITY * dt;
        if (entity.position.y < 0.05 && entity.velocity.y < 0) {
          entity.position.y = 0.05;
          entity.velocity.y *= -0.4; // small bounce
        }
      }

      // Tumble
      const spinEase = 1 - age;
      entity.transform.rotation.x += (entity.spinX ?? 10) * spinEase * dt;
      entity.transform.rotation.z += (entity.spinZ ?? 5) * spinEase * dt;
    }
  }

  // 2. Render instanced particles using InstancedMesh
  if (scene) {
    if (instancedMesh && instancedMesh.parent !== scene) {
      instancedMesh = null;
    }

    let count = 0;

    for (const entity of world.with('isInstancedParticle', 'position', 'particleColor')) {
      if (count >= maxParticles) break;

      if (!instancedMesh) {
        instancedMesh = new THREE.InstancedMesh(explosionGeo, particleMaterial, maxParticles);
        instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        instancedMesh.frustumCulled = false;

        // Pre-allocate instanceColor array to maximum size
        const defaultColor = new THREE.Color(0xffffff);
        for (let j = 0; j < maxParticles; j++) {
          instancedMesh.setColorAt(j, defaultColor);
        }

        scene.add(instancedMesh);
      }

      // Calculate scale (shrinking with age)
      const age =
        entity.lifeTimer !== undefined && entity.maxLife !== undefined
          ? Math.min(entity.lifeTimer / entity.maxLife, 1)
          : 0;
      const scaleBase = 1.0 - age * age;
      const scaleVal = Math.max(scaleBase, 0.001);

      // Compose matrix directly from entity properties
      tempPosition.copy(entity.position);

      const sX = (entity.scaleX ?? 1.0) * scaleVal;
      const sY = (entity.scaleY ?? 1.0) * scaleVal;
      const sZ = (entity.scaleZ ?? 1.0) * scaleVal;
      tempScale.set(sX, sY, sZ);

      tempRotation.set(entity.rotationX ?? 0, 0, entity.rotationZ ?? 0);
      tempQuaternion.setFromEuler(tempRotation);

      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);

      instancedMesh.setMatrixAt(count, tempMatrix);
      tempColor.setHex(entity.particleColor ?? 0xffffff);
      instancedMesh.setColorAt(count, tempColor);
      count++;
    }

    if (count > 0 && instancedMesh) {
      instancedMesh.count = count;
      instancedMesh.instanceMatrix.needsUpdate = true;
      if (instancedMesh.instanceColor) {
        instancedMesh.instanceColor.needsUpdate = true;
      }
      instancedMesh.visible = true;
    } else {
      if (instancedMesh) {
        instancedMesh.count = 0;
        instancedMesh.visible = false;
      }
    }
  }
}
