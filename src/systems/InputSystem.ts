import { world } from '../core/world';

// --- STATE ---
const inputState = {
  x: 0,
  y: 0,
  isShooting: false,
};

// --- KEYBOARD SETUP ---
const keys = { w: 0, a: 0, s: 0, d: 0, space: false };

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

// --- TOUCH SETUP (Virtual Joystick) ---
const joystickZone = document.getElementById('joystick-zone');
const joystickVisuals = document.getElementById('joystick-visuals');
const joystickKnob = document.getElementById('joystick-knob');

let touchId: number | null = null;
let joyCenterX = 0;
let joyCenterY = 0;
const MAX_RADIUS = 40;

if (joystickZone && joystickKnob && joystickVisuals) {
  // Hide initially
  joystickVisuals.classList.remove('active');

  // 1. Touch Start
  joystickZone.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      // Only handle first touch if not already active
      if (touchId !== null) return;

      const touch = e.changedTouches[0];
      touchId = touch.identifier;

      joyCenterX = touch.clientX;
      joyCenterY = touch.clientY;

      // Position Visuals at touch point
      joystickVisuals.style.transform = `translate(${joyCenterX}px, ${joyCenterY}px)`;
      joystickVisuals.classList.add('active');

      // Reset knob processing immediately (at center)
      updateJoystick(touch.clientX, touch.clientY);
    },
    { passive: false },
  );

  // 2. Touch Move
  joystickZone.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchId) {
          updateJoystick(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
          break;
        }
      }
    },
    { passive: false },
  );

  // 3. Touch End
  const endTouch = (e: TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId) {
        touchId = null;
        resetJoystick();
        break;
      }
    }
  };
  joystickZone.addEventListener('touchend', endTouch);
  joystickZone.addEventListener('touchcancel', endTouch);
}

function updateJoystick(x: number, y: number) {
  const dx = x - joyCenterX;
  const dy = y - joyCenterY;

  const distance = Math.min(Math.sqrt(dx * dx + dy * dy), MAX_RADIUS);
  const angle = Math.atan2(dy, dx);

  // Move Knob Visual (relative to center 0,0)
  const knobX = Math.cos(angle) * distance;
  const knobY = Math.sin(angle) * distance;

  if (joystickKnob) {
    joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;
  }

  // Set Game Input (Normalized)
  inputState.x = knobX / MAX_RADIUS;
  inputState.y = knobY / MAX_RADIUS;
}

function resetJoystick() {
  if (joystickVisuals) {
    joystickVisuals.classList.remove('active');
  }
  if (joystickKnob) {
    joystickKnob.style.transform = `translate(0px, 0px)`;
  }
  inputState.x = 0;
  inputState.y = 0;
}

// --- MAIN SYSTEM LOOP ---
export function InputSystem() {
  for (const entity of world.with('input')) {
    if (!entity.input) continue;

    if (touchId !== null) {
      entity.input.x = inputState.x;
      entity.input.y = inputState.y;
    } else {
      let dx = keys.d - keys.a;
      let dy = keys.s - keys.w;
      if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        dx /= len;
        dy /= len;
      }
      entity.input.x = dx;
      entity.input.y = dy;
    }

    entity.input.isShooting = keys.space;
  }
}
