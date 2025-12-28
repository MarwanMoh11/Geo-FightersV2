/**
 * SpawnTimeline - Data structures and stage definitions for VS-style spawning
 *
 * Each stage is a choreographed "enemy script" that dictates:
 * - What enemies spawn at what time
 * - Their spawn weights (probability)
 * - Formation patterns
 * - Min/Max counts per spawn event
 */

import { EnemyType } from './factories';

// --- DATA STRUCTURES ---

export type FormationType = 'swarm' | 'line' | 'encircle' | 'pincer';

export interface SpawnEntry {
    startTime: number;      // seconds - when this entry becomes active
    endTime: number;        // seconds - when this entry stops being active
    enemyType: EnemyType;
    weight: number;         // spawn weight (higher = more likely in pool)
    countMin: number;       // minimum enemies per spawn event
    countMax: number;       // maximum enemies per spawn event
    formation: FormationType;
}

export interface StageTimeline {
    name: string;
    duration: number;       // total stage duration in seconds (e.g., 1800 for 30 min)
    entries: SpawnEntry[];
}

// --- SPAWN COST (budget consumption per enemy) ---
export const ENEMY_SPAWN_COST: Record<EnemyType, number> = {
    [EnemyType.VIRUS]: 1,     // Fodder - cheapest
    [EnemyType.GLITCH]: 2,    // Standard - moderate cost
    [EnemyType.FIREWALL]: 5,  // Tank - expensive
};

// --- STAGE 1 TIMELINE ---
// A 30-minute escalating challenge

export const STAGE_1_TIMELINE: StageTimeline = {
    name: 'Cyber Wasteland',
    duration: 1800, // 30 minutes

    entries: [
        // === PHASE 1: THE CALM (0-60s) ===
        // Mostly weak VIRUS fodder to let player get bearings
        {
            startTime: 0,
            endTime: 60,
            enemyType: EnemyType.VIRUS,
            weight: 100,
            countMin: 2,
            countMax: 5,
            formation: 'swarm',
        },

        // === PHASE 2: INTRODUCTION (60-180s) ===
        // GLITCH appears, mixed with VIRUS
        {
            startTime: 0,
            endTime: 180,
            enemyType: EnemyType.VIRUS,
            weight: 70,
            countMin: 3,
            countMax: 8,
            formation: 'swarm',
        },
        {
            startTime: 60,
            endTime: 180,
            enemyType: EnemyType.GLITCH,
            weight: 50,
            countMin: 2,
            countMax: 5,
            formation: 'swarm',
        },

        // === PHASE 3: ESCALATION (180-360s) ===
        // Formations get more tactical, FIREWALL appears
        {
            startTime: 180,
            endTime: 360,
            enemyType: EnemyType.VIRUS,
            weight: 60,
            countMin: 5,
            countMax: 12,
            formation: 'line',
        },
        {
            startTime: 180,
            endTime: 360,
            enemyType: EnemyType.GLITCH,
            weight: 70,
            countMin: 4,
            countMax: 10,
            formation: 'encircle',
        },
        {
            startTime: 180,
            endTime: 360,
            enemyType: EnemyType.FIREWALL,
            weight: 15,
            countMin: 1,
            countMax: 2,
            formation: 'pincer',
        },

        // === PHASE 4: PRESSURE (360-600s) ===
        // Heavy enemy presence, mixed formations
        {
            startTime: 360,
            endTime: 600,
            enemyType: EnemyType.VIRUS,
            weight: 50,
            countMin: 8,
            countMax: 15,
            formation: 'encircle',
        },
        {
            startTime: 360,
            endTime: 600,
            enemyType: EnemyType.GLITCH,
            weight: 60,
            countMin: 6,
            countMax: 12,
            formation: 'line',
        },
        {
            startTime: 360,
            endTime: 600,
            enemyType: EnemyType.FIREWALL,
            weight: 25,
            countMin: 1,
            countMax: 3,
            formation: 'pincer',
        },

        // === PHASE 5: OVERWHELMING (600-1200s) ===
        // Maximum enemy density, all formations
        {
            startTime: 600,
            endTime: 1200,
            enemyType: EnemyType.VIRUS,
            weight: 40,
            countMin: 10,
            countMax: 20,
            formation: 'swarm',
        },
        {
            startTime: 600,
            endTime: 1200,
            enemyType: EnemyType.GLITCH,
            weight: 55,
            countMin: 8,
            countMax: 16,
            formation: 'encircle',
        },
        {
            startTime: 600,
            endTime: 1200,
            enemyType: EnemyType.FIREWALL,
            weight: 35,
            countMin: 2,
            countMax: 4,
            formation: 'line',
        },

        // === PHASE 6: ENDGAME (1200-1800s) ===
        // Pure chaos - everything at maximum
        {
            startTime: 1200,
            endTime: 1800,
            enemyType: EnemyType.VIRUS,
            weight: 35,
            countMin: 15,
            countMax: 30,
            formation: 'encircle',
        },
        {
            startTime: 1200,
            endTime: 1800,
            enemyType: EnemyType.GLITCH,
            weight: 50,
            countMin: 12,
            countMax: 24,
            formation: 'swarm',
        },
        {
            startTime: 1200,
            endTime: 1800,
            enemyType: EnemyType.FIREWALL,
            weight: 45,
            countMin: 3,
            countMax: 6,
            formation: 'encircle',
        },
    ],
};

// --- HELPER: Get active entries at a given time ---
export function getActiveEntries(timeline: StageTimeline, elapsedSeconds: number): SpawnEntry[] {
    return timeline.entries.filter(
        entry => elapsedSeconds >= entry.startTime && elapsedSeconds < entry.endTime
    );
}

// --- HELPER: Calculate total weight of active pool ---
export function getTotalWeight(entries: SpawnEntry[]): number {
    return entries.reduce((sum, entry) => sum + entry.weight, 0);
}

// --- HELPER: Select entry by weighted random ---
export function selectEntryByWeight(entries: SpawnEntry[]): SpawnEntry | null {
    if (entries.length === 0) return null;

    const totalWeight = getTotalWeight(entries);
    let roll = Math.random() * totalWeight;

    for (const entry of entries) {
        if (roll < entry.weight) {
            return entry;
        }
        roll -= entry.weight;
    }

    return entries[entries.length - 1]; // Fallback
}
