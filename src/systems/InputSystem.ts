import { world } from '../core/world';
import { uiState } from '../core/UIState.svelte.ts';
import { playOverloadTrigger } from '../core/audio';

// Ultimate duration per character (seconds). GHOST's phase-walk is short and
// total — anything longer would trivialize the horde.
const OVERLOAD_DURATION: Record<string, number> = {
  ghost: 4.0,
};
const DEFAULT_OVERLOAD_DURATION = 7.0;

/**
 * Activate the overload ultimate if the charge bar is full and the game is playing.
 */
export function triggerOverload() {
  if (uiState.overloadCharge >= 100 && !uiState.overloadActive && uiState.gameState === 'PLAYING') {
    uiState.overloadActive = true;
    uiState.overloadTimer =
      OVERLOAD_DURATION[uiState.selectedCharacter] ?? DEFAULT_OVERLOAD_DURATION;
    uiState.overloadCharge = 0;
    playOverloadTrigger();
  }
}

// --- STATE ---
export const inputState = {
  x: 0,
  y: 0,
  isShooting: false,
};

// --- KEYBOARD SETUP ---
const keys = { w: 0, a: 0, s: 0, d: 0, space: false };

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'KeyW':
        keys.w = 1;
        break;
      case 'KeyS':
        keys.s = 1;
        break;
      case 'KeyA':
        keys.a = 1;
        break;
      case 'KeyD':
        keys.d = 1;
        break;
      case 'Space':
        keys.space = true;
        if (uiState.gameState === 'PLAYING' && !uiState.isPaused && !uiState.showUpgrade) {
          triggerOverload();
        }
        break;
    }
  });

  window.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyW':
        keys.w = 0;
        break;
      case 'KeyS':
        keys.s = 0;
        break;
      case 'KeyA':
        keys.a = 0;
        break;
      case 'KeyD':
        keys.d = 0;
        break;
      case 'Space':
        keys.space = false;
        break;
    }
  });
}

// --- VIRTUAL JOYSTICK API ---
// A planted thumb never holds perfectly still — the touch point trembles a few
// pixels every frame, so the raw normalized vector wobbles continuously. On
// desktop the keyboard yields clean unit vectors and this can't happen; on
// mobile that tremor drives a constantly-jittering velocity → the player drifts
// and vibrates and the followed camera shakes with it. A small radial deadzone
// discards sub-threshold throw, then rescales what's left so the full analog
// range (and precise slow movement) is preserved above the deadzone. Unlike
// low-passing the input, a deadzone adds no latency.
const STICK_DEADZONE = 0.12;
/**
 * Update the virtual joystick position from a mobile touch input, applying a
 * radial deadzone to prevent jitter drift.
 *
 * @param {number} x - horizontal axis value (-1 to 1)
 * @param {number} y - vertical axis value (-1 to 1)
 * @param {boolean} isShooting - whether the fire button is held
 */
export function updateVirtualJoystick(x: number, y: number, isShooting = false) {
  const mag = Math.sqrt(x * x + y * y);
  if (mag <= STICK_DEADZONE) {
    inputState.x = 0;
    inputState.y = 0;
  } else {
    // Remap [deadzone, 1] → [0, 1] along the same direction so there's no speed
    // step at the deadzone edge and full-throw still reads as full speed.
    const rescaled = Math.min(1, (mag - STICK_DEADZONE) / (1 - STICK_DEADZONE)) / mag;
    inputState.x = x * rescaled;
    inputState.y = y * rescaled;
  }
  inputState.isShooting = isShooting;
}

/**
 * Reset the virtual joystick to center with no shooting input.
 */
export function resetVirtualJoystick() {
  inputState.x = 0;
  inputState.y = 0;
  inputState.isShooting = false;
}

// --- MAIN SYSTEM LOOP ---
/**
 * Per-frame input tick: read keyboard and virtual joystick state and write
 * the normalized movement vector into each local player's input component.
 */
export function InputSystem() {
  const isLocalPausedOrUpgrading = uiState.gameState === 'PAUSED' || uiState.showUpgrade;

  for (const entity of world.with('input', 'isLocalPlayer')) {
    if (!entity.input) continue;

    const isDead = entity.health && entity.health.current <= 0;

    if (isLocalPausedOrUpgrading || isDead) {
      entity.input.x = 0;
      entity.input.y = 0;
      entity.input.isShooting = false;
      continue;
    }

    // Direct assignment from inputState (updated by keyboard or joystick)
    // Priority: If virtual joystick is being moved (non-zero), use that.
    // Otherwise use keyboard inputs.

    let dx = keys.d - keys.a;
    let dy = keys.s - keys.w;

    if (inputState.x !== 0 || inputState.y !== 0) {
      entity.input.x = inputState.x;
      entity.input.y = inputState.y;
    } else {
      if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        dx /= len;
        dy /= len;
      }
      entity.input.x = dx;
      entity.input.y = dy;
    }

    entity.input.isShooting = keys.space || inputState.isShooting;
  }
}
