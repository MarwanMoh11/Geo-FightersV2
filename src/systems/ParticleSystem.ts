import { world } from '../core/world';

export function ParticleSystem(dt: number) {
  // Find all particles that have a lifeTimer (so we know how old they are)
  for (const entity of world.with('isParticle', 'transform', 'lifeTimer', 'maxLife')) {
    if (!entity.transform || entity.lifeTimer === undefined || entity.maxLife === undefined)
      continue;

    // 1. Calculate Progress (0.0 = New, 1.0 = Dead)
    const age = entity.lifeTimer / entity.maxLife;

    // 2. Shrink over time
    // Start at scale 1.0, shrink to 0.0
    const scale = 1.0 - age;
    entity.transform.scale.setScalar(scale);

    // 3. Spin wildly
    // This makes debris look chaotic
    entity.transform.rotateX(10 * dt);
    entity.transform.rotateZ(5 * dt);
  }
}
