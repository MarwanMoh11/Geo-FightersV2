import { world } from '../core/world';
import { uiState } from '../core/UIState.svelte.ts';
import { playOverloadTrigger } from '../core/audio';

// Ultimate duration per character (seconds). GHOST's phase-walk is short and
// total — anything longer would trivialize the horde.
const OVERLOAD_DURATION: Record<string, number> = {
  ghost: 4.0,
};
const DEFAULT_OVERLOAD_DURATION = 7.0;

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
export function updateVirtualJoystick(x: number, y: number, isShooting = false) {
  inputState.x = x;
  inputState.y = y;
  inputState.isShooting = isShooting;
}

export function resetVirtualJoystick() {
  inputState.x = 0;
  inputState.y = 0;
  inputState.isShooting = false;
}

// --- MAIN SYSTEM LOOP ---
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
