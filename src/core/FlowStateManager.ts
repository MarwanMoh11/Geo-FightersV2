/**
 * FlowStateManager - The Brain of Adaptive Difficulty
 *
 * Tracks player performance metrics in real-time and calculates a "pressure" value
 * that the swarm system uses to adjust difficulty. Keeps players in the "sweet spot"
 * where challenge meets skill - the addictive zone.
 */

// --- CONFIGURATION ---
const CONFIG = {
    // The target pressure level (0.65 = 65% challenge) - the "sweet spot"
    targetPressure: 0.65,

    // How fast pressure adjusts (higher = more responsive, lower = smoother)
    pressureSmoothing: 2.0,

    // Rolling window duration for metrics (seconds)
    metricWindow: 8.0,

    // Weights for different metrics in pressure calculation
    weights: {
        damageTaken: 0.4, // High weight - taking damage is significant
        killRate: 0.3, // Moderate weight - kills indicate skill
        nearMisses: 0.2, // Near-misses create tension without punishment
        survivalStreak: 0.1, // Bonus for staying alive
    },

    // Thresholds for events
    nearMissDistance: 1.5, // Distance to count as "close call"
    comebackHealthThreshold: 0.3, // Below 30% HP triggers comeback mode
    dominationKillStreak: 8, // Kills in window to be "dominating"
};

// --- STATE ---
interface PerformanceSnapshot {
    timestamp: number;
    value: number;
}

// Rolling windows for metrics
let damageHistory: PerformanceSnapshot[] = [];
let killHistory: PerformanceSnapshot[] = [];
let nearMissHistory: PerformanceSnapshot[] = [];

// Core state
let pressure = 0.5; // Current pressure (0.0 - 1.0)
let flowMomentum = 0; // Positive = rising pressure, negative = falling
let timeSinceLastHit = 0; // Invincibility streak timer
let inComebackMode = false; // Player is in low-health recovery
let comebackTimer = 0; // Brief breathing room after entering comeback


// --- PUBLIC API ---

/**
 * Get the current pressure level (0.0 - 1.0)
 * Used by the swarm system to determine spawn intensity
 */
export function getPressure(): number {
    return pressure;
}

/**
 * Get the flow momentum (-1 to 1)
 * Positive = player was struggling, now recovering (ease off)
 * Negative = player was dominating, challenge incoming
 */
export function getFlowMomentum(): number {
    return flowMomentum;
}

/**
 * Check if player is in comeback mode (low health recovery)
 */
export function isInComebackMode(): boolean {
    return inComebackMode;
}

/**
 * Report that the player took damage
 */
export function reportDamageTaken(amount: number): void {
    damageHistory.push({ timestamp: performance.now(), value: amount });
    timeSinceLastHit = 0;

    // Check for comeback mode entry
    // (actual health check happens in update)
}

/**
 * Report that an enemy was killed
 */
export function reportKill(): void {
    killHistory.push({ timestamp: performance.now(), value: 1 });
}

/**
 * Report a near-miss (enemy got close but didn't hit)
 */
export function reportNearMiss(distance: number): void {
    // Closer = more intense near-miss
    const intensity = 1 - distance / CONFIG.nearMissDistance;
    nearMissHistory.push({ timestamp: performance.now(), value: intensity });
}

/**
 * Main update - call every frame
 */
export function updateFlowState(dt: number, playerHealthPercent: number): void {
    const now = performance.now();
    const windowMs = CONFIG.metricWindow * 1000;

    // 1. Prune old entries from rolling windows
    damageHistory = damageHistory.filter((e) => now - e.timestamp < windowMs);
    killHistory = killHistory.filter((e) => now - e.timestamp < windowMs);
    nearMissHistory = nearMissHistory.filter((e) => now - e.timestamp < windowMs);

    // 2. Calculate metric scores (normalized 0-1)
    const totalDamage = damageHistory.reduce((sum, e) => sum + e.value, 0);
    const killCount = killHistory.length;
    const nearMissIntensity = nearMissHistory.reduce((sum, e) => sum + e.value, 0);

    // Normalize (based on expected ranges)
    const damageScore = Math.min(1, totalDamage / 50); // 50 damage in window = max
    const killScore = Math.min(1, killCount / CONFIG.dominationKillStreak);
    const nearMissScore = Math.min(1, nearMissIntensity / 5); // 5 intense near-misses = max

    // 3. Update survival streak
    timeSinceLastHit += dt;
    const survivalScore = Math.min(1, timeSinceLastHit / 10); // 10 sec no damage = max

    // 4. Calculate target pressure
    // High damage + low kills = lower pressure (player struggling)
    // Low damage + high kills = higher pressure (player dominating)
    const struggleSignal = damageScore * CONFIG.weights.damageTaken;
    const dominanceSignal =
        killScore * CONFIG.weights.killRate + survivalScore * CONFIG.weights.survivalStreak;
    const tensionSignal = nearMissScore * CONFIG.weights.nearMisses;

    // Raw performance score: high = dominating, low = struggling
    const performanceScore = dominanceSignal - struggleSignal + tensionSignal * 0.5;

    // Map to target pressure: if dominating, increase pressure; if struggling, decrease
    let targetPressure = CONFIG.targetPressure + performanceScore * 0.35;
    targetPressure = Math.max(0.2, Math.min(1.0, targetPressure));

    // 5. Comeback mode handling
    if (playerHealthPercent < CONFIG.comebackHealthThreshold && !inComebackMode) {
        // Enter comeback mode
        inComebackMode = true;
        comebackTimer = 3.0; // 3 seconds of breathing room
    }

    if (inComebackMode) {
        comebackTimer -= dt;

        if (comebackTimer > 0) {
            // Breathing room: force low pressure
            targetPressure = 0.25;
        } else if (playerHealthPercent > CONFIG.comebackHealthThreshold + 0.2) {
            // Recovery complete, exit comeback mode
            inComebackMode = false;
        } else {
            // Still low health but breathing room over - moderate pressure
            targetPressure = Math.min(targetPressure, 0.5);
        }
    }

    // 6. Smooth pressure adjustment
    const previousPressure = pressure;
    pressure += (targetPressure - pressure) * CONFIG.pressureSmoothing * dt;
    pressure = Math.max(0, Math.min(1, pressure));

    // 7. Calculate momentum (trend direction)
    flowMomentum = pressure - previousPressure;
}

/**
 * Reset all flow state (on game restart)
 */
export function resetFlowState(): void {
    damageHistory = [];
    killHistory = [];
    nearMissHistory = [];
    pressure = 0.5;
    flowMomentum = 0;
    timeSinceLastHit = 0;
    inComebackMode = false;
    comebackTimer = 0;
}

/**
 * Get debug info (for development)
 */
export function getFlowDebugInfo(): {
    pressure: number;
    momentum: number;
    killsInWindow: number;
    damageInWindow: number;
    nearMissesInWindow: number;
    comebackMode: boolean;
} {
    return {
        pressure,
        momentum: flowMomentum,
        killsInWindow: killHistory.length,
        damageInWindow: damageHistory.reduce((sum, e) => sum + e.value, 0),
        nearMissesInWindow: nearMissHistory.length,
        comebackMode: inComebackMode,
    };
}
