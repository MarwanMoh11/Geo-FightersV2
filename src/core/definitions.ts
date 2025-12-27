// --- WEAPON BLUEPRINTS ---

export const STARTER_WEAPON = {
  name: 'MK-1 PULSE REPEATER',
  damage: 4,
  fireRate: 0.35,
  speed: 30,
  range: 1.5,
  color: 0x00ffff,
  width: 0.15,
  length: 0.8,
  count: 1,
  spread: 0,
  knockback: 5,
  pierce: 1,
  explodeRadius: 0,
};

export const SHOTGUN_WEAPON = {
  name: 'V-8 SCATTERGUN',
  damage: 3,
  fireRate: 0.9,
  speed: 22,
  range: 0.5,
  color: 0xffaa00,
  width: 0.2,
  length: 0.4,
  count: 6,
  spread: 30,
  knockback: 20,
  pierce: 1,
  explodeRadius: 0,
};

// NEW: AREA OF EFFECT
export const LAUNCHER_WEAPON = {
  name: 'HELIX-7 PLASMA LAUNCHER',
  damage: 15, // High impact damage
  fireRate: 1.2, // Slow fire
  speed: 12, // Slow projectile (dodgeable)
  range: 2.0,
  color: 0x9900ff, // Purple
  width: 0.6, // Fat projectile
  length: 0.6, // Almost a sphere
  count: 1,
  spread: 0,
  knockback: 10,
  pierce: 1,
  explodeRadius: 3.5, // Big Boom (3.5 unit radius)
};

// NEW: INFINITE PIERCE
export const RAILGUN_WEAPON = {
  name: 'OMNI-RAIL CANNON',
  damage: 25, // One-shots standard enemies
  fireRate: 1.5, // Very slow cooldown
  speed: 60, // Instant travel
  range: 2.0,
  color: 0xff0055, // Red
  width: 0.1, // Thin beam
  length: 4.0, // Very long tracer
  count: 1,
  spread: 0,
  knockback: 30, // Pins enemies back
  pierce: 999, // Goes through everything
  explodeRadius: 0,
};
