/**
 * ParticleComputeSystem - GPU-Ready Particle Updates
 *
 * Prepared for WebGPU compute shaders to handle particle lifetime, scaling, and rotation.
 * Currently uses CPU updates but structured for GPU migration.
 *
 * NOTE: Full GPU compute implementation pending Three.js StorageBuffer API stabilization
 */

import { dlog } from '../core/debug';

/**
 * Initialize the particle compute system (placeholder for future GPU compute).
 */
export function initParticleComputeSystem() {
  // GPU buffer initialization will go here once Three.js WebGPU compute API is stable
  dlog('[ParticleComputeSystem] Initialized (placeholder, GPU-ready)');
}

/**
 * Per-frame particle compute tick (currently a no-op; ParticleSystem handles CPU updates).
 *
 * @param {number} _dt - delta time since last frame in seconds
 * @param {unknown} _renderer - the renderer instance (unused)
 */
export function ParticleComputeSystem(_dt: number, _renderer: unknown) {
  // Intentionally a no-op for now: ParticleSystem owns the CPU update.
  // Running a CPU copy here as well double-applied scale/rotation each frame.
  // When the WebGPU compute path lands, it should REPLACE ParticleSystem's
  // loop rather than run alongside it.
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
