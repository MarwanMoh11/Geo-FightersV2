import { world } from '../core/world';
import * as THREE from 'three';

let time = 0;

export function RenderSystem(dt: number) {
  time += dt;

  for (const entity of world.with('position', 'transform')) {
    // 1. Sync Logic Position -> Visual Group Position
    entity.transform.position.copy(entity.position);

    // 2. UNIFIED FLIPPING (Texture Method)
    const sprite = entity.transform.children.find((c) => c.type === 'Sprite') as THREE.Sprite;

    if (sprite && sprite.material.map) {
      const map = sprite.material.map;
      let directionX = 0;

      // A. PLAYER: Use Input
      if (entity.isPlayer && entity.input) {
        directionX = entity.input.x;
      }
      // B. ENEMY: Use Velocity
      else if (entity.isEnemy && entity.velocity) {
        // FIX: We added a negative sign (-) here to invert the direction
        // This forces the "Face Left" logic to run when moving Right, and vice versa.
        directionX = -entity.velocity.x;

        if (Math.abs(directionX) < 0.1) directionX = 0;
      }

      // Apply Flip
      if (directionX < 0) {
        // Logic A
        if (map.repeat.x !== -1) {
          map.repeat.x = -1;
          map.offset.x = 1;
        }
      } else if (directionX > 0) {
        // Logic B
        if (map.repeat.x !== 1) {
          map.repeat.x = 1;
          map.offset.x = 0;
        }
      }
    }

    // 3. Shadow Grounding
    const shadow = entity.transform.children.find((c) => c.type === 'Mesh');
    if (shadow) {
      shadow.position.y = -entity.position.y + 0.02;
    }

    // 4. Gentle Hover
    if (sprite && !entity.isProjectile) {
      const hoverFreq = 3;
      const hoverAmp = 0.05;
      const hoverOffset = Math.sin(time * hoverFreq) * hoverAmp;

      const baseHeight = Math.abs(sprite.scale.y) / 2;
      sprite.position.y = baseHeight + hoverOffset;
    }
  }
}
