import { world } from '../core/world';

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
  for (const entity of world.with('input', 'isLocalPlayer')) {
    if (!entity.input) continue;

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
