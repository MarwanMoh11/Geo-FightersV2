// --- GAME STATE MANAGEMENT ---
export type GameStateType = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

// State Listeners
type StateListener = (newState: GameStateType, oldState: GameStateType) => void;
const listeners: StateListener[] = [];

// Current State
let currentState: GameStateType = 'MENU';

/**
 * Get the current game state
 */
export function getGameState(): GameStateType {
    return currentState;
}

/**
 * Set the game state and notify all listeners
 */
export function setGameState(newState: GameStateType): void {
    if (newState === currentState) return;

    const oldState = currentState;
    currentState = newState;

    // Notify all listeners
    for (const listener of listeners) {
        listener(newState, oldState);
    }
}

/**
 * Subscribe to state changes
 */
export function onStateChange(listener: StateListener): () => void {
    listeners.push(listener);

    // Return unsubscribe function
    return () => {
        const index = listeners.indexOf(listener);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    };
}

/**
 * Check if game is currently playable (not paused or in menu)
 */
export function isPlaying(): boolean {
    return currentState === 'PLAYING';
}

/**
 * Check if game should render but not update logic
 */
export function isPaused(): boolean {
    return currentState === 'PAUSED' || currentState === 'MENU';
}
