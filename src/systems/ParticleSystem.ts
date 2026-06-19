import { world } from '../core/world';
import * as THREE from 'three';

const PARTICLE_GRAVITY = 25.0;
const maxParticles = 2000;
const explosionGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const particleMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
});

let instancedMesh: THREE.InstancedMesh | null = null;

export function ParticleSystem(dt: number, scene?: THREE.Scene) {
  // 1. Update active particles' physics, scale, and rotations
  for (const entity of world.with('isParticle', 'transform', 'lifeTimer', 'maxLife')) {
    if (!entity.transform || entity.lifeTimer === undefined || entity.maxLife === undefined)
      continue;

    // Calculate Progress (0.0 = New, 1.0 = Dead)
    const age = Math.min(entity.lifeTimer / entity.maxLife, 1);

    // 2a. EXPANDING RINGS (blast waves, evolution flashes): grow + fade out (not instanced)
    if (entity.ringGrow !== undefined) {
      const eased = 1 - (1 - age) * (1 - age); // ease-out
      entity.transform.scale.setScalar(1 + eased * entity.ringGrow);
      const mesh = entity.transform as { material?: { opacity?: number } };
      if (mesh.material && mesh.material.opacity !== undefined) {
        mesh.material.opacity = 0.8 * (1 - age);
      }
      continue;
    }

    // 2b. Shrink over time with an ease-out so the pop reads better
    const scale = 1.0 - age * age;
    entity.transform.scale.setScalar(Math.max(scale, 0.001));

    // 3. Gravity arc for debris (skip flat FX rings, which carry no spin)
    if (entity.spinX !== undefined && entity.velocity) {
      entity.velocity.y -= PARTICLE_GRAVITY * dt;
      if (entity.position.y < 0.05 && entity.velocity.y < 0) {
        entity.position.y = 0.05;
        entity.velocity.y *= -0.4; // small bounce
      }
    }

    // 4. Tumble: per-particle rates assigned at spawn, easing out with age
    const spinEase = 1 - age;
    entity.transform.rotation.x += (entity.spinX ?? 10) * spinEase * dt;
    entity.transform.rotation.z += (entity.spinZ ?? 5) * spinEase * dt;

    // Sync matrix changes for instancing
    entity.transform.updateMatrix();
    entity.transform.updateMatrixWorld(true);
  }

  // 2. Render instanced particles using InstancedMesh
  if (scene) {
    const instancedEntities = Array.from(
      world.with('isInstancedParticle', 'transform', 'particleColor'),
    );

    if (instancedEntities.length > 0) {
      if (!instancedMesh) {
        instancedMesh = new THREE.InstancedMesh(explosionGeo, particleMaterial, maxParticles);
        instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        instancedMesh.frustumCulled = false;
        
        // Pre-allocate instanceColor array to maximum size
        const defaultColor = new THREE.Color(0xffffff);
        for (let i = 0; i < maxParticles; i++) {
          instancedMesh.setColorAt(i, defaultColor);
        }
        
        scene.add(instancedMesh);
      }

      const count = Math.min(instancedEntities.length, maxParticles);
      instancedMesh.count = count;

      const tempColor = new THREE.Color();
      for (let i = 0; i < count; i++) {
        const entity = instancedEntities[i];
        if (entity.transform && entity.particleColor !== undefined) {
          instancedMesh.setMatrixAt(i, entity.transform.matrixWorld);
          tempColor.setHex(entity.particleColor);
          instancedMesh.setColorAt(i, tempColor);
        }
      }

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
