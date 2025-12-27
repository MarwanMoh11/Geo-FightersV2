import { world } from '../core/world';
import type * as THREE from 'three';

let time = 0;

export function RenderSystem(dt: number) {
  time += dt;

  for (const entity of world.with('position', 'transform')) {
    // Ensure transform exists
    if (!entity.transform) continue;

    // 1. Sync Logic Position -> Visual Group Position
    entity.transform.position.copy(entity.position);

    // 2. DUAL-SPRITE FLIPPING SYSTEM
    // Toggle visibility between spriteRight and spriteLeft based on movement direction
    if (entity.spriteRight && entity.spriteLeft) {
      let directionX = 0;

      if (entity.isPlayer && entity.input) {
        directionX = entity.input.x;
      } else if (entity.isEnemy && entity.velocity) {
        directionX = entity.velocity.x;
        if (Math.abs(directionX) < 0.1) directionX = 0;
      }

      // Only change facing if there's significant horizontal movement
      if (directionX !== 0) {
        const shouldFaceRight = directionX > 0;

        if (entity.facingRight !== shouldFaceRight) {
          entity.facingRight = shouldFaceRight;
          entity.spriteRight.visible = shouldFaceRight;
          entity.spriteLeft.visible = !shouldFaceRight;
        }
      }

      // 3. HIT FLASH
      if (entity.hitFlashTimer !== undefined) {
        const activeSprite = entity.facingRight ? entity.spriteRight : entity.spriteLeft;
        const inactiveSprite = entity.facingRight ? entity.spriteLeft : entity.spriteRight;

        if (activeSprite && inactiveSprite) {
          if (entity.hitFlashTimer > 0) {
            entity.hitFlashTimer -= dt;
            activeSprite.material.color.setHex(0xff0000);
            inactiveSprite.material.color.setHex(0xff0000);
          } else {
            activeSprite.material.color.setHex(0xffffff);
            inactiveSprite.material.color.setHex(0xffffff);
            entity.hitFlashTimer = 0;
          }
        }
      }

      // 4. Gentle Hover (apply to both sprites)
      if (!entity.isProjectile) {
        const hoverFreq = 3;
        const hoverAmp = 0.05;
        const hoverOffset = Math.sin(time * hoverFreq) * hoverAmp;
        const baseHeight = Math.abs(entity.spriteRight.scale.y) / 2;
        entity.spriteRight.position.y = baseHeight + hoverOffset;
        entity.spriteLeft.position.y = baseHeight + hoverOffset;
      }
    }

    // 5. Shadow Grounding
    const shadow = entity.transform.children.find((c: THREE.Object3D) => c.type === 'Mesh');
    if (shadow) {
      shadow.position.y = -entity.position.y + 0.02;
    }
  }
}
