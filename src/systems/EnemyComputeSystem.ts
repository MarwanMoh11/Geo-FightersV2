/**
 * EnemyComputeSystem - GPU-Ready Enemy Flocking/Separation
 *
 * Prepared for WebGPU compute shaders to handle enemy separation and flocking behaviors.
 * Currently uses CPU calculations but structured for GPU migration.
 *
 * NOTE: Full GPU compute implementation pending Three.js StorageBuffer API stabilization
 */

import { world } from '../core/world';

// Constants (mirrored from EnemySystem)
const SEPARATION_RADIUS_SQ = 1.0 * 1.0;
const SEPARATION_STRENGTH = 20.0;

export function initEnemyComputeSystem() {
  // GPU buffer initialization will go here once Three.js WebGPU compute API is stable
  console.log('[EnemyComputeSystem] Initialized (CPU mode, GPU-ready)');
}

export function EnemyComputeSystem(dt: number, _renderer: any) {
  // Get enemies
  const enemyEntities = Array.from(world.with('isEnemy', 'position', 'velocity'));

  if (enemyEntities.length === 0) return;

  // CPU-based separation (ready for GPU migration)
  performSeparation(dt, enemyEntities);
}

function performSeparation(dt: number, enemyEntities: any[]) {
  const enemyCount = enemyEntities.length;

  // Perform separation checks (optimized for CPU, ready to move to GPU)
  for (let i = 0; i < enemyCount; i++) {
    const enemy = enemyEntities[i];
    let checksRemaining = 10; // Match MAX_SEPARATION_CHECKS from EnemySystem

    for (let j = i + 1; j < enemyCount && checksRemaining > 0; j++) {
      const other = enemyEntities[j];

      const dx = enemy.position.x - other.position.x;
      const dz = enemy.position.z - other.position.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < SEPARATION_RADIUS_SQ && distSq > 0.0001) {
        checksRemaining--;

        // Inverse distance force
        const force = (1.0 - distSq / SEPARATION_RADIUS_SQ) * SEPARATION_STRENGTH * dt;
        const invDist = 1.0 / Math.sqrt(distSq);
        const fx = dx * invDist * force;
        const fz = dz * invDist * force;

        // Apply to both (Newton's 3rd law)
        enemy.velocity.x += fx;
        enemy.velocity.z += fz;
        other.velocity.x -= fx;
        other.velocity.z -= fz;
      }
    }
  }
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
