import { world } from '../core/world';

// 1. Track Raw Key States
const keys = {
  up: false,
  down: false,
  left: false,
  right: false,
  shoot: false,
};

// 2. Listen to the Browser
window.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'KeyW':
      keys.up = true;
      break;
    case 'KeyS':
      keys.down = true;
      break;
    case 'KeyA':
      keys.left = true;
      break;
    case 'KeyD':
      keys.right = true;
      break;
    case 'Space':
      keys.shoot = true;
      break;
  }
});

window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW':
      keys.up = false;
      break;
    case 'KeyS':
      keys.down = false;
      break;
    case 'KeyA':
      keys.left = false;
      break;
    case 'KeyD':
      keys.right = false;
      break;
    case 'Space':
      keys.shoot = false;
      break;
  }
});

// 3. The System Function
export function InputSystem() {
  // Find every entity that HAS an input component (The Player)
  // "with" is a Miniplex filter
  for (const entity of world.with('input')) {
    // Reset Intent
    let dx = 0;
    let dy = 0;

    if (keys.up) dy -= 1;
    if (keys.down) dy += 1;
    if (keys.left) dx -= 1;
    if (keys.right) dx += 1;

    // Update the Entity's "Brain"
    entity.input.x = dx;
    entity.input.y = dy;
    entity.input.isShooting = keys.shoot;
  }
}
