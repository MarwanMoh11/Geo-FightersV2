import { world } from '../core/world';

const PARTICLE_GRAVITY = 25.0;

export function ParticleSystem(dt: number) {
  // Find all particles that have a lifeTimer (so we know how old they are)
  for (const entity of world.with('isParticle', 'transform', 'lifeTimer', 'maxLife')) {
    if (!entity.transform || entity.lifeTimer === undefined || entity.maxLife === undefined)
      continue;

    // 1. Calculate Progress (0.0 = New, 1.0 = Dead)
    const age = Math.min(entity.lifeTimer / entity.maxLife, 1);

    // 2a. EXPANDING RINGS (blast waves, evolution flashes): grow + fade out
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
    // so debris settles instead of spinning at full speed forever
    const spinEase = 1 - age;
    entity.transform.rotation.x += (entity.spinX ?? 10) * spinEase * dt;
    entity.transform.rotation.z += (entity.spinZ ?? 5) * spinEase * dt;
  }
}
