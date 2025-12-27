import { world } from '../core/world';
import * as THREE from 'three';

let time = 0;

export function RenderSystem(dt: number) {
  time += dt;

  for (const entity of world.with('position', 'transform')) {
    // FIX: Ensure transform exists
    if (!entity.transform) continue;

    // 1. Sync Logic Position -> Visual Group Position
    entity.transform.position.copy(entity.position);

    // 2. UNIFIED FLIPPING
    const sprite = entity.transform.children.find((c) => c.type === 'Sprite') as THREE.Sprite;

    if (sprite && sprite.material.map) {
      const map = sprite.material.map;
      let directionX = 0;

      if (entity.isPlayer && entity.input) {
        directionX = entity.input.x;
      } else if (entity.isEnemy && entity.velocity) {
        directionX = -entity.velocity.x; // Inverted for Enemy
        if (Math.abs(directionX) < 0.1) directionX = 0;
      }

      if (directionX < 0) {
        if (map.repeat.x !== -1) {
          map.repeat.x = -1;
          map.offset.x = 1;
        }
      } else if (directionX > 0) {
        if (map.repeat.x !== 1) {
          map.repeat.x = 1;
          map.offset.x = 0;
        }
      }

      // 3. --- JUICE: HIT FLASH ---
      if (entity.hitFlashTimer !== undefined) {
        if (entity.hitFlashTimer > 0) {
          entity.hitFlashTimer -= dt;
          sprite.material.color.setHex(0xff0000);
        } else {
          sprite.material.color.setHex(0xffffff);
          entity.hitFlashTimer = 0;
        }
      }
    }

    // 4. Shadow Grounding
    const shadow = entity.transform.children.find((c) => c.type === 'Mesh');
    if (shadow) {
      shadow.position.y = -entity.position.y + 0.02;
    }

    // 5. Gentle Hover
    if (sprite && !entity.isProjectile) {
      const hoverFreq = 3;
      const hoverAmp = 0.05;
      const hoverOffset = Math.sin(time * hoverFreq) * hoverAmp;
      const baseHeight = Math.abs(sprite.scale.y) / 2;
      sprite.position.y = baseHeight + hoverOffset;
    }
  }
}
