/**
 * PassiveRegistry - Cyberpunk passive items with evolution pairings
 *
 * 12 passives that:
 * - Modify global stats
 * - Enable specific weapon evolutions
 * - Follow VS multiplicative scaling philosophy
 */

import type { PlayerStats } from './PlayerStats';

// --- PASSIVE DEFINITION ---
export interface PassiveDef {
    id: string;
    name: string;
    description: string;
    statBonuses: Partial<Record<keyof PlayerStats, number>>;
    maxLevel: number;
    evolvesWeapon?: string;
}

// --- PASSIVE REGISTRY ---
export const PASSIVES: Record<string, PassiveDef> = {
    // ========================================
    // OFFENSIVE PASSIVES
    // ========================================
    power_cell: {
        id: 'power_cell',
        name: 'POWER CELL',
        description: '+10% Output Wattage (Might)',
        statBonuses: { might: 0.10 },
        maxLevel: 5,
        evolvesWeapon: 'pulse_repeater', // → omega_pulse
    },

    accelerator_chip: {
        id: 'accelerator_chip',
        name: 'ACCELERATOR CHIP',
        description: '+8% Packet Velocity (Speed)',
        statBonuses: { projectileSpeed: 0.08 },
        maxLevel: 5,
        evolvesWeapon: 'smart_rail_needles', // → magnetic_railstorm
    },

    capacitor: {
        id: 'capacitor',
        name: 'CAPACITOR',
        description: '+10% Signal Radius (Area)',
        statBonuses: { area: 0.10 },
        maxLevel: 5,
        evolvesWeapon: 'emp_pulse_node', // → blackout_field
    },

    // ========================================
    // UTILITY PASSIVES
    // ========================================
    cooling_system: {
        id: 'cooling_system',
        name: 'COOLING SYSTEM',
        description: '+10% Process Lifetime (Duration)',
        statBonuses: { duration: 0.10 },
        maxLevel: 5,
        evolvesWeapon: 'cryo_foam_disperser', // → thermal_collapse
    },

    clock_skipper: {
        id: 'clock_skipper',
        name: 'CLOCK SKIPPER',
        description: '+5% Clock Speed (Cooldown)',
        statBonuses: { cooldown: 0.05 },
        maxLevel: 5,
    },

    magnet_loader: {
        id: 'magnet_loader',
        name: 'MAGNET LOADER',
        description: '+25% Pickup Radius',
        statBonuses: { magnet: 0.25 },
        maxLevel: 5,
    },

    // ========================================
    // DEFENSIVE PASSIVES
    // ========================================
    shield_matrix: {
        id: 'shield_matrix',
        name: 'SHIELD MATRIX',
        description: '+1 Armor per level',
        statBonuses: { armor: 1 },
        maxLevel: 5,
    },

    regen_module: {
        id: 'regen_module',
        name: 'REGEN MODULE',
        description: '+0.2 HP/sec Recovery',
        statBonuses: { recovery: 0.2 },
        maxLevel: 5,
    },

    speed_boosters: {
        id: 'speed_boosters',
        name: 'SPEED BOOSTERS',
        description: '+10% Movement Speed',
        statBonuses: { moveSpeed: 0.10 },
        maxLevel: 5,
    },

    // ========================================
    // EVOLUTION-ENABLING PASSIVES
    // ========================================
    ai_core: {
        id: 'ai_core',
        name: 'AI CORE',
        description: '+1 Extra Projectile (Amount)',
        statBonuses: { amount: 0.5 }, // +0.5 per level, rounded
        maxLevel: 5,
        evolvesWeapon: 'drone_halo', // → swarm_intelligence
    },

    optics_suite: {
        id: 'optics_suite',
        name: 'OPTICS SUITE',
        description: '+8% Duration',
        statBonuses: { duration: 0.08 },
        maxLevel: 5,
        evolvesWeapon: 'photon_blades', // → photon_curtain
    },

    signal_booster: {
        id: 'signal_booster',
        name: 'SIGNAL BOOSTER',
        description: '+10% Luck',
        statBonuses: { luck: 0.10 },
        maxLevel: 5,
        evolvesWeapon: 'signal_hijacker', // → neural_cascade
    },

    targeting_os: {
        id: 'targeting_os',
        name: 'TARGETING OS',
        description: '+8% Area',
        statBonuses: { area: 0.08 },
        maxLevel: 5,
        evolvesWeapon: 'orbital_kill_ping', // → saturation_strike
    },

    quantum_regulator: {
        id: 'quantum_regulator',
        name: 'QUANTUM REGULATOR',
        description: '+10% Curse (Enemy scaling)',
        statBonuses: { curse: 0.10 },
        maxLevel: 5,
        evolvesWeapon: 'overclock_engine', // → runaway_singularity
    },

    debug_suite: {
        id: 'debug_suite',
        name: 'DEBUG SUITE',
        description: '+8% Area, +5% Cooldown',
        statBonuses: { area: 0.08, cooldown: 0.05 },
        maxLevel: 5,
        evolvesWeapon: 'memory_leak', // → heap_overflow
    },
};

// --- HELPER FUNCTIONS ---

export function getPassiveBonusesAtLevel(passiveId: string, level: number): Partial<PlayerStats> {
    const def = PASSIVES[passiveId];
    if (!def) return {};

    const clampedLevel = Math.min(level, def.maxLevel);
    const bonuses: Partial<PlayerStats> = {};

    for (const [stat, bonusPerLevel] of Object.entries(def.statBonuses)) {
        (bonuses as any)[stat] = bonusPerLevel * clampedLevel;
    }

    return bonuses;
}

export function canLevelUpPassive(passiveId: string, currentLevel: number): boolean {
    const def = PASSIVES[passiveId];
    if (!def) return false;
    return currentLevel < def.maxLevel;
}

export function getAllPassives(): PassiveDef[] {
    return Object.values(PASSIVES);
}

export function getEvolutionPassive(weaponId: string): PassiveDef | null {
    for (const passive of Object.values(PASSIVES)) {
        if (passive.evolvesWeapon === weaponId) {
            return passive;
        }
    }
    return null;
}
