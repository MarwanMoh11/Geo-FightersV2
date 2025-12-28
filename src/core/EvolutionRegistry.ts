/**
 * EvolutionRegistry - Evolution requirements and resolution
 *
 * Evolutions require:
 * 1. Weapon at max level (8)
 * 2. Required passive owned (any level)
 * 3. Game time >= 300s (5 minutes)
 * 4. Opened via chest
 */

import { WEAPONS } from './WeaponRegistry';
import type { WeaponSlot, PassiveSlot } from './world';

// --- CONSTANTS ---
export const EVOLUTION_TIME_THRESHOLD = 300; // 5 minutes

// --- EVOLUTION DEFINITION ---
export interface EvolutionDef {
    weaponId: string;
    passiveId: string;
    evolvedWeaponId: string;
}

// --- BUILD EVOLUTION TABLE FROM WEAPON REGISTRY ---
function buildEvolutionTable(): EvolutionDef[] {
    const evolutions: EvolutionDef[] = [];

    for (const weapon of Object.values(WEAPONS)) {
        if (weapon.evolvesInto && weapon.evolutionRequires) {
            evolutions.push({
                weaponId: weapon.id,
                passiveId: weapon.evolutionRequires,
                evolvedWeaponId: weapon.evolvesInto,
            });
        }
    }

    return evolutions;
}

export const EVOLUTIONS = buildEvolutionTable();

// --- EVOLUTION SCAN ---
export interface EvolutionCandidate {
    evolution: EvolutionDef;
    weaponSlotIndex: number;
}

/**
 * Scan for valid evolutions
 * Returns list of weapons that can evolve
 */
export function scanForEvolutions(
    weaponSlots: WeaponSlot[],
    passiveSlots: PassiveSlot[],
    gameTime: number
): EvolutionCandidate[] {
    // Time gate check
    if (gameTime < EVOLUTION_TIME_THRESHOLD) {
        return [];
    }

    const ownedPassiveIds = new Set(passiveSlots.map(p => p.passiveId));
    const candidates: EvolutionCandidate[] = [];

    for (let i = 0; i < weaponSlots.length; i++) {
        const slot = weaponSlots[i];
        const weaponDef = WEAPONS[slot.weaponId];

        if (!weaponDef) continue;

        // Check if weapon is at max level
        if (slot.level < weaponDef.maxLevel) continue;

        // Check if evolution exists
        const evolution = EVOLUTIONS.find(e => e.weaponId === slot.weaponId);
        if (!evolution) continue;

        // Check if required passive is owned
        if (!ownedPassiveIds.has(evolution.passiveId)) continue;

        // Check if not already evolved
        if (weaponDef.isEvolved) continue;

        candidates.push({
            evolution,
            weaponSlotIndex: i,
        });
    }

    return candidates;
}

/**
 * Select evolution with preferences:
 * 1. Earlier-acquired weapons (lower index)
 * 2. First valid evolution
 */
export function selectEvolution(candidates: EvolutionCandidate[]): EvolutionCandidate | null {
    if (candidates.length === 0) return null;

    // Sort by weapon slot index (earlier weapons first)
    candidates.sort((a, b) => a.weaponSlotIndex - b.weaponSlotIndex);

    return candidates[0];
}
