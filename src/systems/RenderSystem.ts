import { world } from '../core/world';
import type * as THREE from 'three';
import { uiState } from '../core/UIState.svelte.ts';

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
        if (entity.hitFlashTimer > 0) {
          entity.hitFlashTimer -= dt;
          entity.spriteRight.material.color.setHex(0xff4444);
          entity.spriteLeft.material.color.setHex(0xff4444);
        } else if (entity.hitFlashTimer !== 0) {
          const baseColor = entity.baseColor ?? 0xffffff;
          entity.spriteRight.material.color.setHex(baseColor);
          entity.spriteLeft.material.color.setHex(baseColor);
          entity.hitFlashTimer = 0;
        }
      }

      // 3b. INVULNERABILITY BLINK & UPGRADE GLOW & DEATH (player i-frames / menus / deactivated look)
      if (entity.isPlayer) {
        const isDead = entity.health && entity.health.current <= 0;
        const isUpgrading =
          entity.isUpgrading ||
          (entity.isLocalPlayer && (uiState.showUpgrade || uiState.gameState === 'PAUSED'));
        const invulnerable = (entity.invulnTimer ?? 0) > 0 || isUpgrading || isDead;

        let blinkOpacity = 1.0;
        if (isDead) {
          // Deactivated/spectator look (dark grey and semi-transparent)
          blinkOpacity = 0.35;
          entity.spriteRight.material.color.setHex(0x555555);
          entity.spriteLeft.material.color.setHex(0x555555);
        } else if (isUpgrading) {
          // Slow pulsing cyan glow
          const pulse = 0.5 + 0.3 * Math.sin(time * 6);
          blinkOpacity = pulse;
          entity.spriteRight.material.color.setHex(0x00e5ff);
          entity.spriteLeft.material.color.setHex(0x00e5ff);
        } else if (invulnerable) {
          blinkOpacity = Math.sin(time * 30) > 0 ? 0.35 : 0.9;
          entity.spriteRight.material.color.setHex(0xffffff);
          entity.spriteLeft.material.color.setHex(0xffffff);
        } else if (entity.hitFlashTimer === undefined || entity.hitFlashTimer <= 0) {
          // Reset to default white (if not hit flashing)
          entity.spriteRight.material.color.setHex(0xffffff);
          entity.spriteLeft.material.color.setHex(0xffffff);
        }

        entity.spriteRight.material.opacity = blinkOpacity;
        entity.spriteLeft.material.opacity = blinkOpacity;
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
