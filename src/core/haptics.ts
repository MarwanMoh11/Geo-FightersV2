/**
 * Haptic feedback for mobile (no-op where the Vibration API is missing,
 * e.g. desktop browsers and iOS Safari).
 */

function buzz(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Some browsers throw if called before a user gesture — ignore
    }
  }
}

export const haptics = {
  /** Player took damage */
  hit: () => buzz(45),
  /** Level-up modal opened */
  levelUp: () => buzz([30, 40, 60]),
  /** Chest opened / reward */
  reward: () => buzz([20, 30, 20]),
  /** Menu / card selection */
  select: () => buzz(15),
};
