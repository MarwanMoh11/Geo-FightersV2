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
        baseDamage: 4, baseCooldown: 0.35, baseProjectiles: 1,
        baseSpeed: 30, baseLifetime: 1.5, basePierce: 1,
        baseArea: 1.0, baseKnockback: 5, baseSpread: 0, explodeRadius: 0,
        levelBonuses: { damage: 1, cooldown: 0.015 },
        projectileMilestones: [4, 7],
        maxLevel: 8,
        visualStyle: 'BOLT', color: 0x00ffff,
        bulletWidth: 0.15, bulletLength: 0.8,
        evolvesInto: 'omega_pulse', evolutionRequires: 'power_cell',
    },

    // ========================================
    // SET A: DIRECTIONAL
    // ========================================
    monowire_lash: {
        id: 'monowire_lash',
        name: 'MONOWIRE LASH',
        description: 'Slicing energy filaments. High pierce.',
        category: 'directional',
        baseDamage: 6, baseCooldown: 0.8, baseProjectiles: 1,
        baseSpeed: 40, baseLifetime: 0.4, basePierce: 4,
        baseArea: 1.2, baseKnockback: 3, baseSpread: 15, explodeRadius: 0,
        levelBonuses: { damage: 1.5, pierce: 1, cooldown: 0.02 },
        projectileMilestones: [5],
        maxLevel: 8,
        visualStyle: 'BOLT', color: 0xff00ff,
        bulletWidth: 0.08, bulletLength: 2.0,
        evolvesInto: 'nanofiber_guillotine', evolutionRequires: 'power_cell',
    },

    smart_rail_needles: {
        id: 'smart_rail_needles',
        name: 'SMART RAIL NEEDLES',
        description: 'Hypersonic spikes. Fast, low area.',
        category: 'directional',
        baseDamage: 5, baseCooldown: 0.25, baseProjectiles: 2,
        baseSpeed: 55, baseLifetime: 1.0, basePierce: 1,
        baseArea: 0.8, baseKnockback: 8, baseSpread: 8, explodeRadius: 0,
        levelBonuses: { damage: 0.8, cooldown: 0.015 },
        projectileMilestones: [3, 6],
        maxLevel: 8,
        visualStyle: 'SHARD', color: 0x00ff88,
        bulletWidth: 0.1, bulletLength: 0.6,
        evolvesInto: 'magnetic_railstorm', evolutionRequires: 'accelerator_chip',
    },

    // ========================================
    // SET B: AREA DENIAL
    // ========================================
    emp_pulse_node: {
        id: 'emp_pulse_node',
        name: 'EMP PULSE NODE',
        description: 'Periodic shockwave. Stuns enemies.',
        category: 'aoe',
        baseDamage: 3, baseCooldown: 1.5, baseProjectiles: 1,
        baseSpeed: 0, baseLifetime: 0.3, basePierce: 999,
        baseArea: 2.5, baseKnockback: 2, baseSpread: 360, explodeRadius: 2.5,
        levelBonuses: { damage: 0.5, area: 0.12, cooldown: 0.02 },
        maxLevel: 8,
        visualStyle: 'ORB', color: 0x4444ff,
        bulletWidth: 0.8, bulletLength: 0.8,
        evolvesInto: 'blackout_field', evolutionRequires: 'capacitor',
    },

    cryo_foam_disperser: {
        id: 'cryo_foam_disperser',
        name: 'CRYO-FOAM DISPERSER',
        description: 'Frost puddles. Slows and stacks.',
        category: 'aoe',
        baseDamage: 2, baseCooldown: 2.0, baseProjectiles: 1,
        baseSpeed: 8, baseLifetime: 3.0, basePierce: 999,
        baseArea: 1.8, baseKnockback: 0, baseSpread: 0, explodeRadius: 2.0,
        levelBonuses: { damage: 0.4, area: 0.1, cooldown: 0.02 },
        projectileMilestones: [4, 7],
        maxLevel: 8,
        visualStyle: 'ORB', color: 0x88ddff,
        bulletWidth: 0.6, bulletLength: 0.6,
        evolvesInto: 'thermal_collapse', evolutionRequires: 'cooling_system',
    },

    // ========================================
    // SET C: ORBITAL
    // ========================================
    drone_halo: {
        id: 'drone_halo',
        name: 'DRONE HALO',
        description: 'Orbiting drones. Solid collision damage.',
        category: 'orbit',
        baseDamage: 8, baseCooldown: 0.5, baseProjectiles: 2,
        baseSpeed: 8, baseLifetime: 999, basePierce: 999,
        baseArea: 1.0, baseKnockback: 4, baseSpread: 360, explodeRadius: 0,
        levelBonuses: { damage: 1.2, area: 0.08 },
        projectileMilestones: [3, 5, 7],
        maxLevel: 8,
        visualStyle: 'ORB', color: 0xffff00,
        bulletWidth: 0.4, bulletLength: 0.4,
        evolvesInto: 'swarm_intelligence', evolutionRequires: 'ai_core',
    },

    photon_blades: {
        id: 'photon_blades',
        name: 'PHOTON BLADES',
        description: 'Rotating hard-light arcs. High area.',
        category: 'orbit',
        baseDamage: 10, baseCooldown: 0.6, baseProjectiles: 2,
        baseSpeed: 10, baseLifetime: 999, basePierce: 999,
        baseArea: 1.4, baseKnockback: 6, baseSpread: 360, explodeRadius: 0,
        levelBonuses: { damage: 1.5, area: 0.1, cooldown: 0.015 },
        projectileMilestones: [4, 6],
        maxLevel: 8,
        visualStyle: 'BOLT', color: 0xffffff,
        bulletWidth: 0.15, bulletLength: 1.5,
        evolvesInto: 'photon_curtain', evolutionRequires: 'optics_suite',
    },

    // ========================================
    // SET D: GLOBAL
    // ========================================
    signal_hijacker: {
        id: 'signal_hijacker',
        name: 'SIGNAL HIJACKER',
        description: 'Overrides enemy minds briefly.',
        category: 'global',
        baseDamage: 1, baseCooldown: 3.0, baseProjectiles: 1,
        baseSpeed: 60, baseLifetime: 0.5, basePierce: 3,
        baseArea: 2.0, baseKnockback: 0, baseSpread: 360, explodeRadius: 0,
        levelBonuses: { pierce: 1, cooldown: 0.03, area: 0.1 },
        maxLevel: 8,
        visualStyle: 'ORB', color: 0xff8800,
        bulletWidth: 0.3, bulletLength: 0.3,
        evolvesInto: 'neural_cascade', evolutionRequires: 'signal_booster',
    },

    orbital_kill_ping: {
        id: 'orbital_kill_ping',
        name: 'ORBITAL KILL PING',
        description: 'Delayed strike from above.',
        category: 'global',
        baseDamage: 25, baseCooldown: 2.5, baseProjectiles: 1,
        baseSpeed: 80, baseLifetime: 0.3, basePierce: 1,
        baseArea: 1.5, baseKnockback: 15, baseSpread: 0, explodeRadius: 2.5,
        levelBonuses: { damage: 4, area: 0.1, cooldown: 0.02 },
        projectileMilestones: [5, 8],
        maxLevel: 8,
        visualStyle: 'BOLT', color: 0xff0000,
        bulletWidth: 0.3, bulletLength: 3.0,
        evolvesInto: 'saturation_strike', evolutionRequires: 'targeting_os',
    },

    // ========================================
    // SET E: HIGH-RISK / CURSE SYNERGY
    // ========================================
    overclock_engine: {
        id: 'overclock_engine',
        name: 'OVERCLOCK ENGINE',
        description: 'Unstable surges. Scales with Curse.',
        category: 'aoe',
        baseDamage: 8, baseCooldown: 1.0, baseProjectiles: 3,
        baseSpeed: 20, baseLifetime: 1.5, basePierce: 2,
        baseArea: 1.0, baseKnockback: 5, baseSpread: 45, explodeRadius: 1.5,
        levelBonuses: { damage: 2, area: 0.08, cooldown: 0.02 },
        maxLevel: 8,
        visualStyle: 'SHARD', color: 0xff4400,
        bulletWidth: 0.25, bulletLength: 0.4,
        evolvesInto: 'runaway_singularity', evolutionRequires: 'quantum_regulator',
    },

    memory_leak: {
        id: 'memory_leak',
        name: 'MEMORY LEAK',
        description: 'Delayed burst on enemy death.',
        category: 'global',
        baseDamage: 4, baseCooldown: 1.8, baseProjectiles: 1,
        baseSpeed: 25, baseLifetime: 2.5, basePierce: 5,
        baseArea: 1.2, baseKnockback: 2, baseSpread: 360, explodeRadius: 1.2,
        levelBonuses: { damage: 1, pierce: 1, area: 0.1 },
        projectileMilestones: [4, 7],
        maxLevel: 8,
        visualStyle: 'ORB', color: 0x8800ff,
        bulletWidth: 0.35, bulletLength: 0.35,
        evolvesInto: 'heap_overflow', evolutionRequires: 'debug_suite',
    },

    // ========================================
    // EVOLVED WEAPONS
    // ========================================
    omega_pulse: {
        id: 'omega_pulse',
        name: 'OMEGA PULSE',
        description: 'Fires in all directions continuously.',
        category: 'global', isEvolved: true,
        baseDamage: 15, baseCooldown: 0.18, baseProjectiles: 8,
        baseSpeed: 35, baseLifetime: 1.8, basePierce: 2,
        baseArea: 1.2, baseKnockback: 8, baseSpread: 360, explodeRadius: 0,
        levelBonuses: {}, maxLevel: 1,
        visualStyle: 'BOLT', color: 0x00ffff,
        bulletWidth: 0.2, bulletLength: 1.0,
    },

    nanofiber_guillotine: {
        id: 'nanofiber_guillotine',
        name: 'NANOFIBER GUILLOTINE',
        description: 'Filaments return after max range.',
        category: 'directional', isEvolved: true,
        baseDamage: 18, baseCooldown: 0.5, baseProjectiles: 3,
        baseSpeed: 45, baseLifetime: 0.8, basePierce: 999,
        baseArea: 1.5, baseKnockback: 5, baseSpread: 25, explodeRadius: 0,
        levelBonuses: {}, maxLevel: 1,
        visualStyle: 'BOLT', color: 0xff00ff,
        bulletWidth: 0.1, bulletLength: 2.5,
    },

    magnetic_railstorm: {
        id: 'magnetic_railstorm',
        name: 'MAGNETIC RAILSTORM',
        description: 'Needles arc toward enemies.',
        category: 'global', isEvolved: true,
        baseDamage: 12, baseCooldown: 0.15, baseProjectiles: 5,
        baseSpeed: 50, baseLifetime: 1.5, basePierce: 2,
        baseArea: 1.0, baseKnockback: 6, baseSpread: 40, explodeRadius: 0,
        levelBonuses: {}, maxLevel: 1,
        visualStyle: 'SHARD', color: 0x00ff88,
        bulletWidth: 0.12, bulletLength: 0.8,
    },

    blackout_field: {
        id: 'blackout_field',
        name: 'BLACKOUT FIELD',
        description: 'Constant suppression aura.',
        category: 'aoe', isEvolved: true,
        baseDamage: 8, baseCooldown: 0.8, baseProjectiles: 1,
        baseSpeed: 0, baseLifetime: 0.5, basePierce: 999,
        baseArea: 4.0, baseKnockback: 1, baseSpread: 360, explodeRadius: 4.0,
        levelBonuses: {}, maxLevel: 1,
        visualStyle: 'ORB', color: 0x4444ff,
        bulletWidth: 1.2, bulletLength: 1.2,
    },

    thermal_collapse: {
        id: 'thermal_collapse',
        name: 'THERMAL COLLAPSE GRID',
        description: 'Frozen enemies explode on death.',
        category: 'aoe', isEvolved: true,
        baseDamage: 10, baseCooldown: 1.2, baseProjectiles: 3,
        baseSpeed: 12, baseLifetime: 4.0, basePierce: 999,
        baseArea: 2.5, baseKnockback: 0, baseSpread: 360, explodeRadius: 3.0,
        levelBonuses: {}, maxLevel: 1,
        visualStyle: 'ORB', color: 0x88ddff,
        bulletWidth: 0.8, bulletLength: 0.8,
    },

    swarm_intelligence: {
        id: 'swarm_intelligence',
        name: 'SWARM INTELLIGENCE',
        description: 'Drones seek densest enemy zones.',
        category: 'orbit', isEvolved: true,
        baseDamage: 15, baseCooldown: 0.3, baseProjectiles: 6,
        baseSpeed: 12, baseLifetime: 999, basePierce: 999,
        baseArea: 1.3, baseKnockback: 5, baseSpread: 360, explodeRadius: 0,
        levelBonuses: {}, maxLevel: 1,
        visualStyle: 'ORB', color: 0xffff00,
        bulletWidth: 0.5, bulletLength: 0.5,
    },

    photon_curtain: {
        id: 'photon_curtain',
        name: 'PHOTON CURTAIN',
        description: 'Continuous wall with no gaps.',
        category: 'orbit', isEvolved: true,
        baseDamage: 18, baseCooldown: 0.4, baseProjectiles: 4,
        baseSpeed: 12, baseLifetime: 999, basePierce: 999,
        baseArea: 2.0, baseKnockback: 8, baseSpread: 360, explodeRadius: 0,
        levelBonuses: {}, maxLevel: 1,
        visualStyle: 'BOLT', color: 0xffffff,
        bulletWidth: 0.2, bulletLength: 2.0,
    },

    neural_cascade: {
        id: 'neural_cascade',
        name: 'NEURAL CASCADE',
        description: 'Chain hijacks spread on kill.',
        category: 'global', isEvolved: true,
        baseDamage: 5, baseCooldown: 2.0, baseProjectiles: 3,
        baseSpeed: 70, baseLifetime: 0.8, basePierce: 10,
        baseArea: 3.0, baseKnockback: 0, baseSpread: 360, explodeRadius: 2.0,
        levelBonuses: {}, maxLevel: 1,
        visualStyle: 'ORB', color: 0xff8800,
        bulletWidth: 0.4, bulletLength: 0.4,
    },

    saturation_strike: {
        id: 'saturation_strike',
        name: 'SATURATION STRIKE',
        description: 'Marks entire screen for bombardment.',
        category: 'global', isEvolved: true,
        baseDamage: 40, baseCooldown: 4.0, baseProjectiles: 5,
        baseSpeed: 100, baseLifetime: 0.4, basePierce: 1,
        baseArea: 2.0, baseKnockback: 20, baseSpread: 360, explodeRadius: 3.5,
        levelBonuses: {}, maxLevel: 1,
        visualStyle: 'BOLT', color: 0xff0000,
        bulletWidth: 0.4, bulletLength: 4.0,
    },

    runaway_singularity: {
        id: 'runaway_singularity',
        name: 'RUNAWAY SINGULARITY',
        description: 'Damage scales with enemy count.',
        category: 'aoe', isEvolved: true,
        baseDamage: 20, baseCooldown: 0.6, baseProjectiles: 5,
        baseSpeed: 25, baseLifetime: 2.0, basePierce: 4,
        baseArea: 1.5, baseKnockback: 8, baseSpread: 60, explodeRadius: 2.5,
        levelBonuses: {}, maxLevel: 1,
        visualStyle: 'SHARD', color: 0xff4400,
        bulletWidth: 0.3, bulletLength: 0.5,
    },

    heap_overflow: {
        id: 'heap_overflow',
        name: 'HEAP OVERFLOW',
        description: 'Burst damage stacks indefinitely.',
        category: 'global', isEvolved: true,
        baseDamage: 12, baseCooldown: 1.0, baseProjectiles: 4,
        baseSpeed: 30, baseLifetime: 3.0, basePierce: 10,
        baseArea: 1.8, baseKnockback: 3, baseSpread: 360, explodeRadius: 2.0,
        levelBonuses: {}, maxLevel: 1,
        visualStyle: 'ORB', color: 0x8800ff,
        bulletWidth: 0.45, bulletLength: 0.45,
    },
};

// --- HELPER FUNCTIONS ---

export function getWeaponStatsAtLevel(weaponId: string, level: number): {
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
    const cooldown = def.baseCooldown * (1 - cooldownReduction);

    let projectiles = def.baseProjectiles;
    if (def.projectileMilestones) {
        for (const milestone of def.projectileMilestones) {
            if (clampedLevel >= milestone) projectiles++;
        }
    }

    const pierce = def.basePierce + (def.levelBonuses.pierce || 0) * levelsGained;
    const areaBonus = (def.levelBonuses.area || 0) * levelsGained;
    const area = def.baseArea * (1 + areaBonus);

    return { damage, cooldown, projectiles, pierce, area };
}

export function canLevelUp(weaponId: string, currentLevel: number): boolean {
    const def = WEAPONS[weaponId];
    if (!def) return false;
    return currentLevel < def.maxLevel;
}

export function getBaseWeapons(): WeaponDef[] {
    return Object.values(WEAPONS).filter(w => !w.isEvolved);
}

export function isEvolvedWeapon(weaponId: string): boolean {
    const def = WEAPONS[weaponId];
    return def?.isEvolved === true;
}
