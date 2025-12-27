import { world } from '../core/world';

// State to track keys
const keys = {
  up: 0,
  down: 0,
  left: 0,
  right: 0,
  shoot: false,
};

// Event Listeners
window.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'KeyW':
      keys.up = 1;
      break;
    case 'KeyS':
      keys.down = 1;
      break;
    case 'KeyA':
      keys.left = 1;
      break;
    case 'KeyD':
      keys.right = 1;
      break;
    case 'Space':
      keys.shoot = true;
      break; // Space to shoot
  }
});

window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW':
      keys.up = 0;
      break;
    case 'KeyS':
      keys.down = 0;
      break;
    case 'KeyA':
      keys.left = 0;
      break;
    case 'KeyD':
      keys.right = 0;
      break;
    case 'Space':
      keys.shoot = false;
      break;
  }
});

export function InputSystem() {
  // We want all entities that CAN receive input
  // The query returns entities, but doesn't guarantee type safety on optional fields
  for (const entity of world.with('input')) {
    // Normalize vector (so diagonal isn't faster)
    let dx = keys.right - keys.left;
    let dy = keys.down - keys.up;

    // Simple normalization for 8-direction movement
    if (dx !== 0 || dy !== 0) {
      const length = Math.sqrt(dx * dx + dy * dy);
      dx /= length;
      dy /= length;
    }

    // FIX: Check if input exists
    if (entity.input) {
      entity.input.x = dx;
      entity.input.y = dy;
      entity.input.isShooting = keys.shoot;
    }
  }
}
