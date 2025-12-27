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
  visualStyle: 'BOLT', // Standard sleek cylinder
};

export const SHOTGUN_WEAPON = {
  name: 'V-8 SCATTERGUN',
  damage: 3,
  fireRate: 0.9,
  speed: 22,
  range: 0.5,
  color: 0xffaa00,
  width: 0.3,
  length: 0.3, // Chunky
  count: 6,
  spread: 30,
  knockback: 20,
  pierce: 1,
  explodeRadius: 0,
  visualStyle: 'SHARD', // Jagged Tetrahedrons
};

export const LAUNCHER_WEAPON = {
  name: 'HELIX-7 PLASMA LAUNCHER',
  damage: 15,
  fireRate: 1.2,
  speed: 12,
  range: 2.0,
  color: 0x9900ff,
  width: 0.5,
  length: 0.5,
  count: 1,
  spread: 0,
  knockback: 10,
  pierce: 1,
  explodeRadius: 3.5,
  visualStyle: 'ORB', // Rotating Core + Shell
};

export const RAILGUN_WEAPON = {
  name: 'OMNI-RAIL CANNON',
  damage: 25,
  fireRate: 1.5,
  speed: 60,
  range: 2.0,
  color: 0xff0055,
  width: 0.1,
  length: 4.0,
  count: 1,
  spread: 0,
  knockback: 30,
  pierce: 999,
  explodeRadius: 0,
  visualStyle: 'BOLT', // Long beam
};
