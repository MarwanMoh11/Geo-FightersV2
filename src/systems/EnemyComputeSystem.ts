/**
 * EnemyComputeSystem - GPU-Ready Enemy Flocking/Separation
 *
 * Prepared for WebGPU compute shaders to handle enemy separation and flocking behaviors.
 * Currently uses CPU calculations but structured for GPU migration.
 *
 * NOTE: Full GPU compute implementation pending Three.js StorageBuffer API stabilization
 */

import { dlog } from '../core/debug';

/**
 * Initialize the enemy compute system (placeholder for future GPU compute).
 */
export function initEnemyComputeSystem() {
  // GPU buffer initialization will go here once Three.js WebGPU compute API is stable
  dlog('[EnemyComputeSystem] Initialized (placeholder, GPU-ready)');
}

/**
 * Per-frame enemy compute tick (currently a no-op; EnemySystem handles CPU separation).
 *
 * @param {number} _dt - delta time since last frame in seconds
 * @param {unknown} _renderer - the renderer instance (unused)
 */
export function EnemyComputeSystem(_dt: number, _renderer: unknown) {
  // Intentionally a no-op for now: EnemySystem owns separation on the CPU.
  // Running a CPU copy here as well applied separation forces TWICE per frame,
  // making hordes jitter and over-spread. When the WebGPU compute path lands,
  // it should REPLACE EnemySystem's separation loop rather than run alongside it.
}

/**
 * GPU Migration Roadmap:
 *
 * Phase 1 (Current): CPU implementation with GPU-ready structure
 * Phase 1.5 (Next): Implement using Three.js WebGPU compute nodes when API stabilizes
 *
 * Benefits of GPU compute:
 * - 5-10x performance improvement for 300+ enemies
 * - Parallel processing of all separation calculations
 * - Shared memory for nearby enemy positions
 * - Reduced CPU overhead
 *
 * Required APIs (when available):
 * - StorageBuffer for position/velocity data
 * - ComputeNode for shader execution
 * - Work group dispatch with shared memory
 */
