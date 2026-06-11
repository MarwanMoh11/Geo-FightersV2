/**
 * ParticleComputeSystem - GPU-Ready Particle Updates
 *
 * Prepared for WebGPU compute shaders to handle particle lifetime, scaling, and rotation.
 * Currently uses CPU updates but structured for GPU migration.
 *
 * NOTE: Full GPU compute implementation pending Three.js StorageBuffer API stabilization
 */

import { world } from '../core/world';

export function initParticleComputeSystem() {
  // GPU buffer initialization will go here once Three.js WebGPU compute API is stable
  console.log('[ParticleComputeSystem] Initialized (CPU mode, GPU-ready)');
}

export function ParticleComputeSystem(dt: number, _renderer: any) {
  // Get current particles
  const particleEntities = Array.from(
    world.with('isParticle', 'transform', 'lifeTimer', 'maxLife'),
  );

  // Early exit if no particles
  if (particleEntities.length === 0) return;

  // CPU-based updates (ready for GPU migration)
  for (const entity of particleEntities) {
    if (!entity.transform || entity.lifeTimer === undefined || entity.maxLife === undefined)
      continue;

    // Calculate age (0.0 = new, 1.0 = dead)
    const age = entity.lifeTimer / entity.maxLife;

    // Calculate scale (shrink over time)
    const scale = 1.0 - age;
    entity.transform.scale.setScalar(scale);

    // Update rotation (spin wildly)
    entity.transform.rotateX(10 * dt);
    entity.transform.rotateZ(5 * dt);
  }
}

/**
 * GPU Migration Roadmap:
 *
 * Phase 1 (Current): CPU implementation with GPU-ready structure
 * Phase 1.5 (Next): Implement using Three.js WebGPU compute nodes when API stabilizes
 *
 * Benefits of GPU compute:
 * - 10-100x performance improvement for 1000+ particles
 * - Parallel processing of all particles
 * - Reduced CPU->GPU data transfer
 *
 * Required APIs (when available):
 * - StorageBuffer or equivalent for particle data
 * - ComputeNode for shader execution
 * - Work group dispatch
 */
