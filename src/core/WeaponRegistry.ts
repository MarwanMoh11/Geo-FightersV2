/**
 * WeaponRegistry - Comprehensive cyberpunk weapon library
 *
 * 10 base weapons with 10 evolutions:
 * - Directional: Monowire Lash, Smart Rail Needles
 * - AoE: EMP Pulse Node, Cryo-Foam Disperser
 * - Orbital: Drone Halo, Photon Blades
 * - Global: Signal Hijacker, Orbital Kill Ping
 * - High-Risk: Overclock Engine, Memory Leak
 */

// --- WEAPON DEFINITION ---
export interface WeaponDef {
  id: string;
  name: string;
  description: string;
  category: 'directional' | 'aoe' | 'orbit' | 'global';

  // Base stats (at level 1)
  baseDamage: number;
  baseCooldown: number;
  baseProjectiles: number;
  baseSpeed: number;
  baseLifetime: number;
  basePierce: number;
  baseArea: number;
  baseKnockback: number;
  baseSpread: number;
  explodeRadius: number;

  // Per-level bonuses
  levelBonuses: {
    damage?: number;
    cooldown?: number;
    pierce?: number;
    area?: number;
  };
  projectileMilestones?: number[];
  maxLevel: number;

  // Visuals
  visualStyle: 'BOLT' | 'SHARD' | 'ORB';
  color: number;
  bulletWidth: number;
  bulletLength: number;

  // Evolution
  evolvesInto?: string;
  evolutionRequires?: string;
  isEvolved?: boolean;
}

// --- WEAPON REGISTRY ---
export const WEAPONS: Record<string, WeaponDef> = {
  // ========================================
  // STARTER WEAPON
  // ========================================
  pulse_repeater: {
    id: 'pulse_repeater',
    name: 'MK-1 PULSE REPEATER',
    description: 'Reliable directional fire.',
    category: 'directional',
    baseDamage: 4,
    baseCooldown: 0.35,
    baseProjectiles: 1,
    baseSpeed: 30,
    baseLifetime: 1.5,
    basePierce: 2, // P1.97: VS density — starter shots must plow through packs
    baseArea: 1.0,
    baseKnockback: 5,
    baseSpread: 0,
    explodeRadius: 0,
    levelBonuses: { damage: 1, cooldown: 0.015 },
    projectileMilestones: [4, 7],
    maxLevel: 8,
    visualStyle: 'BOLT',
    color: 0x00ffff, // Cyan pulse
    bulletWidth: 0.2,
    bulletLength: 1.0,
    evolvesInto: 'omega_pulse',
    evolutionRequires: 'power_cell',
  },

  // ========================================
  // SET A: DIRECTIONAL
  // ========================================
  monowire_lash: {
    id: 'monowire_lash',
    name: 'MONOWIRE LASH',
    description: 'Slicing energy filaments. High pierce.',
    category: 'directional',
    baseDamage: 6,
    baseCooldown: 0.8,
    baseProjectiles: 1,
    baseSpeed: 40,
    baseLifetime: 0.4,
    basePierce: 4,
    baseArea: 1.2,
    baseKnockback: 3,
    baseSpread: 15,
    explodeRadius: 0,
    levelBonuses: { damage: 1.5, pierce: 1, cooldown: 0.02 },
    projectileMilestones: [5],
    maxLevel: 8,
    visualStyle: 'BOLT',
    color: 0xff00ff, // Magenta wire
    bulletWidth: 0.05,
    bulletLength: 2.5, // Thinner, longer for wire look
    evolvesInto: 'nanofiber_guillotine',
    evolutionRequires: 'power_cell',
  },

  smart_rail_needles: {
    id: 'smart_rail_needles',
    name: 'SMART RAIL NEEDLES',
    description: 'Hypersonic spikes. Fast, low area.',
    category: 'directional',
    baseDamage: 5,
    baseCooldown: 0.25,
    baseProjectiles: 2,
    baseSpeed: 55,
    baseLifetime: 1.0,
    basePierce: 2, // P1.97: VS density — needles should skewer two bodies
    baseArea: 0.8,
    baseKnockback: 8,
    baseSpread: 8,
    explodeRadius: 0,
    levelBonuses: { damage: 0.8, cooldown: 0.015 },
    projectileMilestones: [3, 6],
    maxLevel: 8,
    visualStyle: 'SHARD',
    color: 0x00ff88, // Neon green needles
    bulletWidth: 0.08,
    bulletLength: 0.4, // Smaller, faster needles
    evolvesInto: 'magnetic_railstorm',
    evolutionRequires: 'accelerator_chip',
  },

  // ========================================
  // SET B: AREA DENIAL
  // ========================================
  emp_pulse_node: {
    id: 'emp_pulse_node',
    name: 'EMP PULSE NODE',
    description: 'Periodic shockwave. Stuns enemies.',
    category: 'aoe',
    baseDamage: 3,
    baseCooldown: 1.5,
    baseProjectiles: 1,
    baseSpeed: 0,
    baseLifetime: 0.3,
    basePierce: 999,
    baseArea: 2.5,
    baseKnockback: 2,
    baseSpread: 360,
    explodeRadius: 2.5,
    levelBonuses: { damage: 0.5, area: 0.12, cooldown: 0.02 },
    maxLevel: 8,
    visualStyle: 'ORB',
    color: 0x6666ff, // Electric blue pulse
    bulletWidth: 1.2,
    bulletLength: 1.2, // Larger for AOE feel
    evolvesInto: 'blackout_field',
    evolutionRequires: 'capacitor',
  },

  cryo_foam_disperser: {
    id: 'cryo_foam_disperser',
    name: 'CRYO-FOAM DISPERSER',
    description: 'Frost puddles. Slows and stacks.',
    category: 'aoe',
    baseDamage: 2,
    baseCooldown: 2.0,
    baseProjectiles: 1,
    baseSpeed: 8,
    baseLifetime: 3.0,
    basePierce: 999,
    baseArea: 1.8,
    baseKnockback: 0,
    baseSpread: 0,
    explodeRadius: 2.0,
    levelBonuses: { damage: 0.4, area: 0.1, cooldown: 0.02 },
    projectileMilestones: [4, 7],
    maxLevel: 8,
    visualStyle: 'ORB',
    color: 0x66ccff, // Ice blue cryo
    bulletWidth: 0.8,
    bulletLength: 0.8,
    evolvesInto: 'thermal_collapse',
    evolutionRequires: 'cooling_system',
  },

  // ========================================
  // SET C: ORBITAL
  // ========================================
  drone_halo: {
    id: 'drone_halo',
    name: 'DRONE HALO',
    description: 'Orbiting drones. Solid collision damage.',
    category: 'orbit',
    baseDamage: 8,
    baseCooldown: 0.5,
    baseProjectiles: 2,
    baseSpeed: 8,
    baseLifetime: 999,
    basePierce: 999,
    baseArea: 1.0,
    baseKnockback: 4,
    baseSpread: 360,
    explodeRadius: 0,
    levelBonuses: { damage: 1.2, area: 0.08 },
    projectileMilestones: [3, 5, 7],
    maxLevel: 8,
    visualStyle: 'ORB',
    color: 0xffcc00, // Golden drone cores
    bulletWidth: 0.5,
    bulletLength: 0.5,
    evolvesInto: 'swarm_intelligence',
    evolutionRequires: 'ai_core',
  },

  photon_blades: {
    id: 'photon_blades',
    name: 'PHOTON BLADES',
    description: 'Rotating hard-light arcs. High area.',
    category: 'orbit',
    baseDamage: 10,
    baseCooldown: 0.6,
    baseProjectiles: 2,
    baseSpeed: 10,
    baseLifetime: 999,
    basePierce: 999,
    baseArea: 1.4,
    baseKnockback: 6,
    baseSpread: 360,
    explodeRadius: 0,
    levelBonuses: { damage: 1.5, area: 0.1, cooldown: 0.015 },
    projectileMilestones: [4, 6],
    maxLevel: 8,
    visualStyle: 'BOLT',
    color: 0xffffff, // Pure white light blades
    bulletWidth: 0.1,
    bulletLength: 2.0, // Longer blades for arc effect
    evolvesInto: 'photon_curtain',
    evolutionRequires: 'optics_suite',
  },

  // ========================================
  // SET D: GLOBAL
  // ========================================
  signal_hijacker: {
    id: 'signal_hijacker',
    name: 'SIGNAL HIJACKER',
    description: 'Jam signal that makes enemies attack each other.',
    category: 'aoe', // Changed to AoE pulse
    baseDamage: 0,
    baseCooldown: 4.0,
    baseProjectiles: 1,
    baseSpeed: 0,
    baseLifetime: 0.5,
    basePierce: 999,
    baseArea: 6.0,
    baseKnockback: 0,
    baseSpread: 0,
    explodeRadius: 6.0,
    levelBonuses: { area: 0.15, cooldown: 0.04 },
    maxLevel: 8,
    visualStyle: 'ORB',
    color: 0xff8800, // Orange signal waves
    bulletWidth: 1.0,
    bulletLength: 1.0,
    evolvesInto: 'neural_cascade',
    evolutionRequires: 'signal_booster',
  },

  orbital_kill_ping: {
    id: 'orbital_kill_ping',
    name: 'ORBITAL KILL PING',
    description: 'Delayed strike from above.',
    category: 'global',
    baseDamage: 25,
    baseCooldown: 2.5,
    baseProjectiles: 1,
    baseSpeed: 80,
    baseLifetime: 0.3,
    basePierce: 1,
    baseArea: 1.5,
    baseKnockback: 15,
    baseSpread: 0,
    explodeRadius: 2.5,
    levelBonuses: { damage: 4, area: 0.1, cooldown: 0.02 },
    projectileMilestones: [5, 8],
    maxLevel: 8,
    visualStyle: 'BOLT',
    color: 0xff2222, // Red targeting laser
    bulletWidth: 0.4,
    bulletLength: 4.0, // Tall strike from above
    evolvesInto: 'saturation_strike',
    evolutionRequires: 'targeting_os',
  },

  // ========================================
  // SET E: HIGH-RISK / CURSE SYNERGY
  // ========================================
  overclock_engine: {
    id: 'overclock_engine',
    name: 'OVERCLOCK ENGINE',
    description: 'Unstable surges. Scales with Curse.',
    category: 'aoe',
    baseDamage: 8,
    baseCooldown: 1.0,
    baseProjectiles: 3,
    baseSpeed: 20,
    baseLifetime: 1.5,
    basePierce: 2,
    baseArea: 1.0,
    baseKnockback: 5,
    baseSpread: 45,
    explodeRadius: 1.5,
    levelBonuses: { damage: 2, area: 0.08, cooldown: 0.02 },
    maxLevel: 8,
    visualStyle: 'SHARD',
    color: 0xff5500, // Orange fire shards
    bulletWidth: 0.3,
    bulletLength: 0.5,
    evolvesInto: 'runaway_singularity',
    evolutionRequires: 'quantum_regulator',
  },

  memory_leak: {
    id: 'memory_leak',
    name: 'MEMORY LEAK',
    description: 'Delayed burst on enemy death.',
    category: 'global',
    baseDamage: 4,
    baseCooldown: 1.8,
    baseProjectiles: 1,
    baseSpeed: 25,
    baseLifetime: 2.5,
    basePierce: 5,
    baseArea: 1.2,
    baseKnockback: 2,
    baseSpread: 360,
    explodeRadius: 1.2,
    levelBonuses: { damage: 1, pierce: 1, area: 0.1 },
    projectileMilestones: [4, 7],
    maxLevel: 8,
    visualStyle: 'ORB',
    color: 0xaa44ff, // Purple data orbs
    bulletWidth: 0.45,
    bulletLength: 0.45,
    evolvesInto: 'heap_overflow',
    evolutionRequires: 'debug_suite',
  },

  // ========================================
  // SET F: UNLOCKABLE ARSENAL (gated by achievements — see ProgressManager)
  // ========================================
  arc_splitter: {
    id: 'arc_splitter',
    name: 'ARC SPLITTER',
    description: 'Forked lightning bolts. Wide coverage.',
    category: 'directional',
    baseDamage: 5,
    baseCooldown: 0.6,
    baseProjectiles: 3,
    baseSpeed: 38,
    baseLifetime: 1.2,
    basePierce: 2,
    baseArea: 1.0,
    baseKnockback: 4,
    baseSpread: 40,
    explodeRadius: 0,
    levelBonuses: { damage: 1, cooldown: 0.02 },
    projectileMilestones: [4, 7],
    maxLevel: 8,
    visualStyle: 'BOLT',
    color: 0x88ddff, // Pale lightning
    bulletWidth: 0.12,
    bulletLength: 1.4,
    evolvesInto: 'tesla_matrix',
    evolutionRequires: 'clock_skipper',
  },

  void_mortar: {
    id: 'void_mortar',
    name: 'VOID MORTAR',
    description: 'Slow heavy shells. Massive blasts.',
    category: 'global',
    baseDamage: 18,
    baseCooldown: 2.2,
    baseProjectiles: 1,
    baseSpeed: 14,
    baseLifetime: 2.0,
    basePierce: 1,
    baseArea: 1.6,
    baseKnockback: 18,
    baseSpread: 20,
    explodeRadius: 3.2,
    levelBonuses: { damage: 3, area: 0.12, cooldown: 0.025 },
    projectileMilestones: [5, 8],
    maxLevel: 8,
    visualStyle: 'ORB',
    color: 0x7733ff, // Deep void purple
    bulletWidth: 0.55,
    bulletLength: 0.55,
    evolvesInto: 'event_horizon',
    evolutionRequires: 'capacitor',
  },

  gale_rotor: {
    id: 'gale_rotor',
    name: 'GALE ROTOR',
    description: 'Shredding wind blades circle outward.',
    category: 'aoe',
    baseDamage: 4,
    baseCooldown: 0.9,
    baseProjectiles: 2,
    baseSpeed: 16,
    baseLifetime: 2.2,
    basePierce: 6,
    baseArea: 1.3,
    baseKnockback: 10,
    baseSpread: 360,
    explodeRadius: 0,
    levelBonuses: { damage: 0.8, pierce: 1, area: 0.08 },
    projectileMilestones: [4, 6, 8],
    maxLevel: 8,
    visualStyle: 'SHARD',
    color: 0xaaffee, // Mint gale
    bulletWidth: 0.25,
    bulletLength: 0.6,
    evolvesInto: 'cyclone_core',
    evolutionRequires: 'speed_boosters',
  },

  beam_lancer: {
    id: 'beam_lancer',
    name: 'BEAM LANCER',
    description: 'Piercing light lance. Surgical damage.',
    category: 'directional',
    baseDamage: 14,
    baseCooldown: 1.1,
    baseProjectiles: 1,
    baseSpeed: 70,
    baseLifetime: 0.9,
    basePierce: 8,
    baseArea: 0.9,
    baseKnockback: 2,
    baseSpread: 0,
    explodeRadius: 0,
    levelBonuses: { damage: 2.5, pierce: 2, cooldown: 0.02 },
    projectileMilestones: [6],
    maxLevel: 8,
    visualStyle: 'BOLT',
    color: 0xffee66, // Solar beam
    bulletWidth: 0.09,
    bulletLength: 3.2,
    evolvesInto: 'prism_array',
    evolutionRequires: 'optics_suite',
  },

  shard_mines: {
    id: 'shard_mines',
    name: 'SHARD MINES',
    description: 'Proximity crystals detonate on contact.',
    category: 'aoe',
    baseDamage: 12,
    baseCooldown: 1.6,
    baseProjectiles: 2,
    baseSpeed: 5,
    baseLifetime: 6.0,
    basePierce: 999,
    baseArea: 1.2,
    baseKnockback: 12,
    baseSpread: 360,
    explodeRadius: 2.2,
    levelBonuses: { damage: 2, area: 0.1, cooldown: 0.02 },
    projectileMilestones: [3, 5, 7],
    maxLevel: 8,
    visualStyle: 'SHARD',
    color: 0xff66aa, // Rose crystal
    bulletWidth: 0.35,
    bulletLength: 0.5,
    evolvesInto: 'fission_lattice',
    evolutionRequires: 'shield_matrix',
  },

  echo_javelin: {
    id: 'echo_javelin',
    name: 'ECHO JAVELIN',
    description: 'Returning spears hit twice.',
    category: 'directional',
    baseDamage: 9,
    baseCooldown: 0.85,
    baseProjectiles: 1,
    baseSpeed: 34,
    baseLifetime: 1.6,
    basePierce: 5,
    baseArea: 1.1,
    baseKnockback: 7,
    baseSpread: 12,
    explodeRadius: 0,
    levelBonuses: { damage: 1.6, pierce: 1, cooldown: 0.02 },
    projectileMilestones: [4, 7],
    maxLevel: 8,
    visualStyle: 'BOLT',
    color: 0x66ffcc, // Aqua echo
    bulletWidth: 0.14,
    bulletLength: 2.2,
    evolvesInto: 'resonance_storm',
    evolutionRequires: 'regen_module',
  },

  // ========================================
  // EVOLVED WEAPONS
  // ========================================
  omega_pulse: {
    id: 'omega_pulse',
    name: 'OMEGA PULSE',
    description: 'Fires in all directions continuously.',
    category: 'global',
    isEvolved: true,
    baseDamage: 15,
    baseCooldown: 0.18,
    baseProjectiles: 8,
    baseSpeed: 35,
    baseLifetime: 1.8,
    basePierce: 2,
    baseArea: 1.2,
    baseKnockback: 8,
    baseSpread: 360,
    explodeRadius: 0,
    levelBonuses: {},
    maxLevel: 1,
    visualStyle: 'BOLT',
    color: 0x00ffff,
    bulletWidth: 0.2,
    bulletLength: 1.0,
  },

  nanofiber_guillotine: {
    id: 'nanofiber_guillotine',
    name: 'NANOFIBER GUILLOTINE',
    description: 'Filaments return after max range.',
    category: 'directional',
    isEvolved: true,
    baseDamage: 18,
    baseCooldown: 0.5,
    baseProjectiles: 3,
    baseSpeed: 45,
    baseLifetime: 0.8,
    basePierce: 999,
    baseArea: 1.5,
    baseKnockback: 5,
    baseSpread: 25,
    explodeRadius: 0,
    levelBonuses: {},
    maxLevel: 1,
    visualStyle: 'BOLT',
    color: 0xff00ff,
    bulletWidth: 0.1,
    bulletLength: 2.5,
  },

  magnetic_railstorm: {
    id: 'magnetic_railstorm',
    name: 'MAGNETIC RAILSTORM',
    description: 'Needles arc toward enemies.',
    category: 'global',
    isEvolved: true,
    baseDamage: 12,
    baseCooldown: 0.15,
    baseProjectiles: 5,
    baseSpeed: 50,
    baseLifetime: 1.5,
    basePierce: 2,
    baseArea: 1.0,
    baseKnockback: 6,
    baseSpread: 40,
    explodeRadius: 0,
    levelBonuses: {},
    maxLevel: 1,
    visualStyle: 'SHARD',
    color: 0x00ff88,
    bulletWidth: 0.12,
    bulletLength: 0.8,
  },

  blackout_field: {
    id: 'blackout_field',
    name: 'BLACKOUT FIELD',
    description: 'Constant suppression aura.',
    category: 'aoe',
    isEvolved: true,
    baseDamage: 8,
    baseCooldown: 0.8,
    baseProjectiles: 1,
    baseSpeed: 0,
    baseLifetime: 0.5,
    basePierce: 999,
    baseArea: 4.0,
    baseKnockback: 1,
    baseSpread: 360,
    explodeRadius: 4.0,
    levelBonuses: {},
    maxLevel: 1,
    visualStyle: 'ORB',
    color: 0x4444ff,
    bulletWidth: 1.2,
    bulletLength: 1.2,
  },

  thermal_collapse: {
    id: 'thermal_collapse',
    name: 'THERMAL COLLAPSE GRID',
    description: 'Frozen enemies explode on death.',
    category: 'aoe',
    isEvolved: true,
    baseDamage: 10,
    baseCooldown: 1.2,
    baseProjectiles: 3,
    baseSpeed: 12,
    baseLifetime: 4.0,
    basePierce: 999,
    baseArea: 2.5,
    baseKnockback: 0,
    baseSpread: 360,
    explodeRadius: 3.0,
    levelBonuses: {},
    maxLevel: 1,
    visualStyle: 'ORB',
    color: 0x88ddff,
    bulletWidth: 0.8,
    bulletLength: 0.8,
  },

  swarm_intelligence: {
    id: 'swarm_intelligence',
    name: 'SWARM INTELLIGENCE',
    description: 'Drones seek densest enemy zones.',
    category: 'orbit',
    isEvolved: true,
    baseDamage: 15,
    baseCooldown: 0.3,
    baseProjectiles: 6,
    baseSpeed: 12,
    baseLifetime: 999,
    basePierce: 999,
    baseArea: 1.3,
    baseKnockback: 5,
    baseSpread: 360,
    explodeRadius: 0,
    levelBonuses: {},
    maxLevel: 1,
    visualStyle: 'ORB',
    color: 0xffff00,
    bulletWidth: 0.5,
    bulletLength: 0.5,
  },

  photon_curtain: {
    id: 'photon_curtain',
    name: 'PHOTON CURTAIN',
    description: 'Continuous wall with no gaps.',
    category: 'orbit',
    isEvolved: true,
    baseDamage: 18,
    baseCooldown: 0.4,
    baseProjectiles: 4,
    baseSpeed: 12,
    baseLifetime: 999,
    basePierce: 999,
    baseArea: 2.0,
    baseKnockback: 8,
    baseSpread: 360,
    explodeRadius: 0,
    levelBonuses: {},
    maxLevel: 1,
    visualStyle: 'BOLT',
    color: 0xffffff,
    bulletWidth: 0.2,
    bulletLength: 2.0,
  },

  neural_cascade: {
    id: 'neural_cascade',
    name: 'NEURAL CASCADE',
    description: 'Chain hijacks spread on kill.',
    category: 'global',
    isEvolved: true,
    baseDamage: 5,
    baseCooldown: 2.0,
    baseProjectiles: 3,
    baseSpeed: 70,
    baseLifetime: 0.8,
    basePierce: 10,
    baseArea: 3.0,
    baseKnockback: 0,
    baseSpread: 360,
    explodeRadius: 2.0,
    levelBonuses: {},
    maxLevel: 1,
    visualStyle: 'ORB',
    color: 0xff8800,
    bulletWidth: 0.4,
    bulletLength: 0.4,
  },

  saturation_strike: {
    id: 'saturation_strike',
    name: 'SATURATION STRIKE',
    description: 'Marks entire screen for bombardment.',
    category: 'global',
    isEvolved: true,
    baseDamage: 40,
    baseCooldown: 4.0,
    baseProjectiles: 5,
    baseSpeed: 100,
    baseLifetime: 0.4,
    basePierce: 1,
    baseArea: 2.0,
    baseKnockback: 20,
    baseSpread: 360,
    explodeRadius: 3.5,
    levelBonuses: {},
    maxLevel: 1,
    visualStyle: 'BOLT',
    color: 0xff0000,
    bulletWidth: 0.4,
    bulletLength: 4.0,
  },

  runaway_singularity: {
    id: 'runaway_singularity',
    name: 'RUNAWAY SINGULARITY',
    description: 'Damage scales with enemy count.',
    category: 'aoe',
    isEvolved: true,
    baseDamage: 20,
    baseCooldown: 0.6,
    baseProjectiles: 5,
    baseSpeed: 25,
    baseLifetime: 2.0,
    basePierce: 4,
    baseArea: 1.5,
    baseKnockback: 8,
    baseSpread: 60,
    explodeRadius: 2.5,
    levelBonuses: {},
    maxLevel: 1,
    visualStyle: 'SHARD',
    color: 0xff4400,
    bulletWidth: 0.3,
    bulletLength: 0.5,
  },

  tesla_matrix: {
    id: 'tesla_matrix',
    name: 'TESLA MATRIX',
    description: 'A lattice of chain lightning in all directions.',
    category: 'global',
    isEvolved: true,
    baseDamage: 11,
    baseCooldown: 0.3,
    baseProjectiles: 6,
    baseSpeed: 42,
    baseLifetime: 1.4,
    basePierce: 4,
    baseArea: 1.2,
    baseKnockback: 5,
    baseSpread: 360,
    explodeRadius: 0,
    levelBonuses: {},
    maxLevel: 1,
    visualStyle: 'BOLT',
    color: 0xaaeeff,
    bulletWidth: 0.12,
    bulletLength: 1.6,
  },

  event_horizon: {
    id: 'event_horizon',
    name: 'EVENT HORIZON',
    description: 'Shells collapse into pulling singularities.',
    category: 'global',
    isEvolved: true,
    baseDamage: 30,
    baseCooldown: 1.6,
    baseProjectiles: 2,
    baseSpeed: 16,
    baseLifetime: 2.4,
    basePierce: 2,
    baseArea: 2.2,
    baseKnockback: 24,
    baseSpread: 40,
    explodeRadius: 4.5,
    levelBonuses: {},
    maxLevel: 1,
    visualStyle: 'ORB',
    color: 0x5511ff,
    bulletWidth: 0.7,
    bulletLength: 0.7,
  },

  cyclone_core: {
    id: 'cyclone_core',
    name: 'CYCLONE CORE',
    description: 'A permanent storm shreds everything nearby.',
    category: 'aoe',
    isEvolved: true,
    baseDamage: 8,
    baseCooldown: 0.5,
    baseProjectiles: 5,
    baseSpeed: 20,
    baseLifetime: 3.0,
    basePierce: 999,
    baseArea: 1.8,
    baseKnockback: 14,
    baseSpread: 360,
    explodeRadius: 0,
    levelBonuses: {},
    maxLevel: 1,
    visualStyle: 'SHARD',
    color: 0xccfff5,
    bulletWidth: 0.3,
    bulletLength: 0.7,
  },

  prism_array: {
    id: 'prism_array',
    name: 'PRISM ARRAY',
    description: 'Lances refract into a fan of beams.',
    category: 'directional',
    isEvolved: true,
    baseDamage: 22,
    baseCooldown: 0.55,
    baseProjectiles: 5,
    baseSpeed: 80,
    baseLifetime: 1.0,
    basePierce: 999,
    baseArea: 1.1,
    baseKnockback: 4,
    baseSpread: 35,
    explodeRadius: 0,
    levelBonuses: {},
    maxLevel: 1,
    visualStyle: 'BOLT',
    color: 0xfff2aa,
    bulletWidth: 0.1,
    bulletLength: 3.4,
  },

  fission_lattice: {
    id: 'fission_lattice',
    name: 'FISSION LATTICE',
    description: 'Mines split into smaller mines on detonation.',
    category: 'aoe',
    isEvolved: true,
    baseDamage: 20,
    baseCooldown: 1.0,
    baseProjectiles: 4,
    baseSpeed: 7,
    baseLifetime: 7.0,
    basePierce: 999,
    baseArea: 1.5,
    baseKnockback: 16,
    baseSpread: 360,
    explodeRadius: 3.0,
    levelBonuses: {},
    maxLevel: 1,
    visualStyle: 'SHARD',
    color: 0xff88cc,
    bulletWidth: 0.4,
    bulletLength: 0.55,
  },

  resonance_storm: {
    id: 'resonance_storm',
    name: 'RESONANCE STORM',
    description: 'Javelins echo endlessly between enemies.',
    category: 'directional',
    isEvolved: true,
    baseDamage: 16,
    baseCooldown: 0.4,
    baseProjectiles: 3,
    baseSpeed: 40,
    baseLifetime: 2.0,
    basePierce: 999,
    baseArea: 1.3,
    baseKnockback: 9,
    baseSpread: 24,
    explodeRadius: 0,
    levelBonuses: {},
    maxLevel: 1,
    visualStyle: 'BOLT',
    color: 0x99ffdd,
    bulletWidth: 0.16,
    bulletLength: 2.4,
  },

  heap_overflow: {
    id: 'heap_overflow',
    name: 'HEAP OVERFLOW',
    description: 'Burst damage stacks indefinitely.',
    category: 'global',
    isEvolved: true,
    baseDamage: 12,
    baseCooldown: 1.0,
    baseProjectiles: 4,
    baseSpeed: 30,
    baseLifetime: 3.0,
    basePierce: 10,
    baseArea: 1.8,
    baseKnockback: 3,
    baseSpread: 360,
    explodeRadius: 2.0,
    levelBonuses: {},
    maxLevel: 1,
    visualStyle: 'ORB',
    color: 0x8800ff,
    bulletWidth: 0.45,
    bulletLength: 0.45,
  },
};

// --- HELPER FUNCTIONS ---

export function getWeaponStatsAtLevel(
  weaponId: string,
  level: number,
): {
  damage: number;
  cooldown: number;
  projectiles: number;
  pierce: number;
  area: number;
} | null {
  const def = WEAPONS[weaponId];
  if (!def) return null;

  const clampedLevel = Math.min(level, def.maxLevel);
  const levelsGained = clampedLevel - 1;

  const damage = def.baseDamage + (def.levelBonuses.damage || 0) * levelsGained;
  const cooldownReduction = (def.levelBonuses.cooldown || 0) * levelsGained;
  const cooldown = Math.round(def.baseCooldown * (1 - cooldownReduction) * 100) / 100;

  let projectiles = def.baseProjectiles;
  if (def.projectileMilestones) {
    for (const milestone of def.projectileMilestones) {
      if (clampedLevel >= milestone) projectiles++;
    }
  }

  const pierce = def.basePierce + (def.levelBonuses.pierce || 0) * levelsGained;
  const areaBonus = (def.levelBonuses.area || 0) * levelsGained;
  const area = Math.round(def.baseArea * (1 + areaBonus) * 100) / 100;

  return { damage, cooldown, projectiles, pierce, area };
}

export function canLevelUp(weaponId: string, currentLevel: number): boolean {
  const def = WEAPONS[weaponId];
  if (!def) return false;
  return currentLevel < def.maxLevel;
}

export function getBaseWeapons(): WeaponDef[] {
  return Object.values(WEAPONS).filter((w) => !w.isEvolved);
}

export function isEvolvedWeapon(weaponId: string): boolean {
  const def = WEAPONS[weaponId];
  return def?.isEvolved === true;
}
