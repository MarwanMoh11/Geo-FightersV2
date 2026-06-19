import { world } from '../core/world';
import * as THREE from 'three';
import { uiState } from '../core/UIState.svelte.ts';

const hitFlashMaterial = new THREE.MeshBasicMaterial({
  color: 0xff4444,
});

let time = 0;

export function RenderSystem(dt: number) {
  time += dt;

  for (const entity of world.with('position', 'transform')) {
    // Ensure transform exists
    if (!entity.transform) continue;

    // 1. Sync Logic Position -> Visual Group Position
    entity.transform.position.copy(entity.position);

    // 2. FACE MOVEMENT DIRECTION (3D Y-axis rotation)
    if (
      (entity.isPlayer || entity.isEnemy) &&
      entity.velocity &&
      entity.velocity.lengthSq() > 0.01
    ) {
      const targetAngle = Math.atan2(entity.velocity.x, entity.velocity.z);
      entity.transform.rotation.y = targetAngle;
    }

    // 3. GENERIC MESH TRAVERSAL HIT FLASH
    if (entity.hitFlashTimer !== undefined) {
      const container = entity.transform.getObjectByName('mesh_container');
      if (container) {
        if (entity.hitFlashTimer > 0) {
          entity.hitFlashTimer -= dt;
          container.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material && !Array.isArray(child.material)) {
              if (child.userData.originalMaterial === undefined) {
                child.userData.originalMaterial = child.material;
              }
              child.material = hitFlashMaterial;
            }
          });
        } else if (entity.hitFlashTimer !== 0) {
          container.traverse((child) => {
            if (child instanceof THREE.Mesh && child.userData.originalMaterial !== undefined) {
              child.material = child.userData.originalMaterial;
            }
          });
          entity.hitFlashTimer = 0;
        }
      }
    }

    // 3b. PLAYER INVULNERABILITY BLINK & UPGRADE GLOW & DEATH
    if (entity.isPlayer) {
      const isDead = entity.health && entity.health.current <= 0;
      const isUpgrading =
        entity.isUpgrading ||
        (entity.isLocalPlayer && (uiState.showUpgrade || uiState.gameState === 'PAUSED'));
      const invulnerable = (entity.invulnTimer ?? 0) > 0 || isUpgrading || isDead;

      let blinkOpacity = 1.0;
      let glowColor: number | null = null;

      if (isDead) {
        blinkOpacity = 0.35;
        glowColor = 0x555555;
      } else if (isUpgrading) {
        const pulse = 0.5 + 0.3 * Math.sin(time * 6);
        blinkOpacity = pulse;
        glowColor = 0x00e5ff;
      } else if (invulnerable) {
        blinkOpacity = Math.sin(time * 30) > 0 ? 0.35 : 0.9;
      }

      const container = entity.transform.getObjectByName('mesh_container');
      if (container) {
        container.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material && !Array.isArray(child.material)) {
            child.material.transparent = true;
            child.material.opacity = blinkOpacity;

            if (glowColor !== null) {
              if (child.userData.originalColor === undefined) {
                child.userData.originalColor = child.material.color.getHex();
              }
              child.material.color.setHex(glowColor);
            } else {
              if (child.userData.originalColor !== undefined) {
                child.material.color.setHex(child.userData.originalColor);
              }
            }
          }
        });
      }
    }

    // 4. Gentle Hover (apply to mesh container)
    if (
      !entity.isProjectile &&
      !entity.isParticle &&
      !entity.isXP &&
      !entity.isChest &&
      !entity.isBoss
    ) {
      const container = entity.transform.getObjectByName('mesh_container');
      if (container) {
        if (container.userData.baseY === undefined) {
          container.userData.baseY = container.position.y;
        }
        const hoverFreq = 3;
        const hoverAmp = 0.05;
        container.position.y = container.userData.baseY + Math.sin(time * hoverFreq) * hoverAmp;
      }
    }

    // 4b. Sub-mesh animations for players, enemies, and boss (Steam game tier polish)
    if (entity.transform) {
      const container = entity.transform.getObjectByName('mesh_container');
      if (container) {
        if (entity.isPlayer) {
          // Rotate horizontal and vertical gyro stabilizer rings
          const gyroHRing = container.getObjectByName('gyroHRing');
          const gyroVRing = container.getObjectByName('gyroVRing');
          if (gyroHRing) gyroHRing.rotation.y += dt * 2.5;
          if (gyroVRing) gyroVRing.rotation.x += dt * 3.5;

          // Bob wings gently, and tilt back depending on velocity speed
          const leftWing = container.getObjectByName('leftWing');
          const rightWing = container.getObjectByName('rightWing');
          const speed = entity.velocity ? entity.velocity.length() : 0;
          const maxTilt = Math.min(speed * 0.08, 0.4);
          if (leftWing) {
            leftWing.rotation.z = Math.sin(time * 8) * 0.05;
            leftWing.rotation.y = -Math.PI / 8 - maxTilt;
          }
          if (rightWing) {
            rightWing.rotation.z = -Math.sin(time * 8) * 0.05;
            rightWing.rotation.y = Math.PI / 8 + maxTilt;
          }

          // Flicker and pulse engine thruster flame cones
          const leftThruster = container.getObjectByName('leftThruster');
          const rightThruster = container.getObjectByName('rightThruster');
          if (leftThruster && rightThruster) {
            const leftInner = leftThruster.getObjectByName('leftFireInner');
            const leftOuter = leftThruster.getObjectByName('leftFireOuter');
            const rightInner = rightThruster.getObjectByName('rightFireInner');
            const rightOuter = rightThruster.getObjectByName('rightFireOuter');

            const flicker = 0.85 + Math.sin(time * 25.0) * 0.15;
            const speedScale = 1.0 + Math.min(speed * 0.15, 0.5);
            const scaleX = flicker;
            const scaleY = flicker;
            const scaleZ = flicker * speedScale;

            if (leftInner) leftInner.scale.set(scaleX, scaleY, scaleZ);
            if (leftOuter) leftOuter.scale.set(scaleX, scaleY, scaleZ);
            if (rightInner) rightInner.scale.set(scaleX, scaleY, scaleZ);
            if (rightOuter) rightOuter.scale.set(scaleX, scaleY, scaleZ);
          }

          // Alternate bobbing for weapon barrels
          const leftBarrel = container.getObjectByName('leftBarrel');
          const rightBarrel = container.getObjectByName('rightBarrel');
          if (leftBarrel && rightBarrel) {
            leftBarrel.position.z = 0.08 + Math.sin(time * 12) * 0.02;
            rightBarrel.position.z = 0.08 - Math.sin(time * 12) * 0.02;
          }

          // Orbit shield shards in a protective ring
          const shieldGroup = container.getObjectByName('shieldGroup');
          if (shieldGroup) {
            shieldGroup.rotation.y = time * 2.0;
            for (let i = 0; i < 3; i++) {
              const shard = shieldGroup.getObjectByName(`shieldShard_${i}`);
              if (shard) {
                const angle = (i / 3) * Math.PI * 2;
                const radius = 0.52;
                shard.position.set(
                  Math.cos(angle) * radius,
                  Math.sin(time * 5 + i) * 0.05,
                  Math.sin(angle) * radius,
                );
                shard.rotation.x += dt * 1.5;
                shard.rotation.y += dt * 1.0;
              }
            }
          }
        } else if (entity.isEnemy) {
          const type = entity.enemyType;
          if (type === 'glitch') {
            // Jitter/glitchvoxel positions
            for (let i = 0; i < 5; i++) {
              const voxel = container.getObjectByName(`voxel_${i}`);
              if (voxel) {
                voxel.position.x += (Math.random() - 0.5) * 0.02;
                voxel.position.y += (Math.random() - 0.5) * 0.02;
                voxel.position.z += (Math.random() - 0.5) * 0.02;
                const maxDist = 0.3 * entity.transform.scale.x;
                voxel.position.clampLength(0, maxDist);
              }
            }
            const cage1 = container.getObjectByName('cage1');
            const cage2 = container.getObjectByName('cage2');
            if (cage1) cage1.rotation.x += dt * 1.5;
            if (cage1) cage1.rotation.y += dt * 2.2;
            if (cage2) cage2.rotation.y -= dt * 1.8;
            if (cage2) cage2.rotation.z += dt * 1.2;

            // Slide trailing glitch shards backward
            for (let i = 0; i < 3; i++) {
              const shard = container.getObjectByName(`shard_${i}`);
              if (shard) {
                shard.position.z += dt * 0.5;
                if (shard.position.z > 0.1) {
                  shard.position.z = -0.4 - Math.random() * 0.2;
                }
              }
            }
          } else if (type === 'virus') {
            const outerCapsid = container.getObjectByName('outerCapsid');
            const innerCore = container.getObjectByName('innerCore');
            if (outerCapsid) {
              outerCapsid.rotation.y += dt * 0.6;
              outerCapsid.rotation.x += dt * 0.3;
            }
            if (innerCore) innerCore.rotation.y -= dt * 0.4;

            // Pulse spikes outwards
            const pulseScale = 1.0 + Math.sin(time * 6.0) * 0.08;
            for (let i = 0; i < 12; i++) {
              const spike = container.getObjectByName(`spikeGroup_${i}`);
              if (spike) spike.scale.set(1, pulseScale, 1);
            }

            // Animate double-helix DNA orbiting nodes
            const dnaGroup = container.getObjectByName('dnaGroup');
            if (dnaGroup) {
              dnaGroup.rotation.y = time * 1.5;
              for (let i = 0; i < 8; i++) {
                const node = dnaGroup.getObjectByName(`dnaNode_${i}`);
                if (node) {
                  const angle = (i / 8) * Math.PI * 2;
                  const radius = 0.38 * entity.transform.scale.x;
                  const height = Math.sin(time * 3 + angle * 2) * 0.25;
                  node.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
                }
              }
            }
          } else if (type === 'firewall') {
            // Bob individual shield grid tiles independently
            const shieldGroup = container.getObjectByName('shieldGroup');
            if (shieldGroup) {
              for (let i = 0; i < 6; i++) {
                const tile = shieldGroup.getObjectByName(`tile_${i}`);
                if (tile) {
                  tile.position.z = Math.sin(time * 4.0 + i) * 0.03;
                  const pulse = 0.95 + Math.sin(time * 5.0 + i) * 0.05;
                  tile.scale.setScalar(pulse);
                }
              }
            }
          } else if (type === 'enforcer') {
            // Bob twin heavy laser cannons
            const leftBarrel = container.getObjectByName('leftBarrel');
            const rightBarrel = container.getObjectByName('rightBarrel');
            if (leftBarrel && rightBarrel) {
              leftBarrel.position.z = 0.05 + Math.sin(time * 8.0) * 0.04;
              rightBarrel.position.z = 0.05 - Math.sin(time * 8.0) * 0.04;
            }
            // Flicker repulsor flame
            const flame = container.getObjectByName('flame');
            if (flame) {
              const flicker = 0.85 + Math.sin(time * 24.0) * 0.15;
              flame.scale.set(flicker, flicker * 1.2, flicker);
            }
            // Orbit protective shield plates
            const orbiterGroup = container.getObjectByName('orbiterGroup');
            if (orbiterGroup) {
              orbiterGroup.rotation.y = time * 2.2;
              for (let i = 0; i < 2; i++) {
                const orb = orbiterGroup.getObjectByName(`orb_${i}`);
                if (orb) {
                  const angle = (i / 2) * Math.PI * 2;
                  const radius = 0.45 * entity.transform.scale.x;
                  orb.position.set(
                    Math.cos(angle) * radius,
                    Math.sin(time * 6 + i) * 0.08,
                    Math.sin(angle) * radius,
                  );
                  orb.rotation.y = -time * 2.2;
                }
              }
            }
          } else if (type === 'colossus') {
            // Counter-rotate heavy hexagonal steps
            const midStep = container.getObjectByName('midStep');
            const topStep = container.getObjectByName('topStep');
            if (midStep) midStep.rotation.y += dt * 0.6;
            if (topStep) topStep.rotation.y -= dt * 0.9;

            // Flicker and scale exhaust column fire
            for (let i = 0; i < 2; i++) {
              const pipe = container.getObjectByName('exhaustGroup')?.getObjectByName(`pipe_${i}`);
              const smoke = pipe?.getObjectByName(`smoke_${i}`);
              if (smoke) {
                const smokeFlicker = 0.8 + Math.sin(time * 20.0 + i) * 0.2;
                smoke.scale.set(smokeFlicker, smokeFlicker * 1.4, smokeFlicker);
              }
            }
          } else if (type === 'warden') {
            const core = container.getObjectByName('core');
            const ring1 = container.getObjectByName('ring1');
            const ring2 = container.getObjectByName('ring2');
            const ring3 = container.getObjectByName('ring3');
            if (core) {
              core.rotation.y += dt * 0.8;
              core.rotation.x += dt * 0.4;
            }
            if (ring1) ring1.rotation.y += dt * 1.5;
            if (ring2) ring2.rotation.x -= dt * 1.8;
            if (ring3) ring3.rotation.z += dt * 1.2;

            // Orbit diamond crystal satellites
            const orbiterGroup = container.getObjectByName('orbiterGroup');
            if (orbiterGroup) {
              orbiterGroup.rotation.y = time * 1.8;
              for (let i = 0; i < 4; i++) {
                const crystal = orbiterGroup.getObjectByName(`crystal_${i}`);
                if (crystal) {
                  const angle = (i / 4) * Math.PI * 2;
                  const radius = 0.52 * entity.transform.scale.x;
                  crystal.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
                  crystal.rotation.x += dt * 2.0;
                }
              }
            }
          } else if (type === 'hydra') {
            // Bob nodes with offset phases
            const node1 = container.getObjectByName('node1');
            const node2 = container.getObjectByName('node2');
            const node3 = container.getObjectByName('node3');
            if (node1) {
              node1.position.y = Math.sin(time * 5 + 1.0) * 0.08;
              const r1 = node1.getObjectByName('ring1');
              if (r1) r1.rotation.y += dt * 1.8;
            }
            if (node2) {
              node2.position.y = Math.sin(time * 5) * 0.1;
              const r2 = node2.getObjectByName('ring2');
              if (r2) r2.rotation.x += dt * 1.5;
            }
            if (node3) {
              node3.position.y = Math.sin(time * 5 + 2.0) * 0.08;
              const r3 = node3.getObjectByName('ring3');
              if (r3) r3.rotation.y -= dt * 1.8;
            }

            // Reposition, stretch, and align connecting plasma beam cylinders dynamically
            const leftBeam = container.getObjectByName('leftBeam');
            const rightBeam = container.getObjectByName('rightBeam');
            if (node1 && node2 && leftBeam) {
              leftBeam.position.copy(node1.position).add(node2.position).multiplyScalar(0.5);
              const dist = node1.position.distanceTo(node2.position);
              leftBeam.scale.set(1, dist, 1);
              const dir = new THREE.Vector3()
                .subVectors(node2.position, node1.position)
                .normalize();
              leftBeam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
            }
            if (node2 && node3 && rightBeam) {
              rightBeam.position.copy(node2.position).add(node3.position).multiplyScalar(0.5);
              const dist = node2.position.distanceTo(node3.position);
              rightBeam.scale.set(1, dist, 1);
              const dir = new THREE.Vector3()
                .subVectors(node3.position, node2.position)
                .normalize();
              rightBeam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
            }
          } else if (type === 'overseer') {
            const core = container.getObjectByName('core');
            const ring1 = container.getObjectByName('ring1');
            const ring2 = container.getObjectByName('ring2');
            const ring3 = container.getObjectByName('ring3');
            if (core) core.rotation.y += dt * 0.5;
            if (ring1) {
              ring1.rotation.x += dt * 1.0;
              ring1.rotation.y += dt * 0.8;
            }
            if (ring2) {
              ring2.rotation.y -= dt * 1.2;
              ring2.rotation.z += dt * 0.6;
            }
            if (ring3) {
              ring3.rotation.z += dt * 0.8;
              ring3.rotation.x -= dt * 1.0;
            }

            // Orbit satellite pods
            const satellites = container.getObjectByName('satellites');
            if (satellites) {
              satellites.rotation.y = time * 1.2;
              for (let i = 0; i < 4; i++) {
                const sat = satellites.getObjectByName(`sat_${i}`);
                if (sat) {
                  const angle = (i / 4) * Math.PI * 2;
                  const radius = 0.65 * entity.transform.scale.x;
                  sat.position.set(
                    Math.cos(angle) * radius,
                    Math.sin(time * 4.0 + i) * 0.08,
                    Math.sin(angle) * radius,
                  );
                  sat.rotation.y = -time * 1.2;
                }
              }
            }
          }
        } else if (entity.isBoss) {
          // Orbit giant spikes around the final boss
          const spikeGroup = container.getObjectByName('spikeGroup');
          if (spikeGroup) {
            spikeGroup.rotation.y = time * 1.0;
            for (let i = 0; i < 6; i++) {
              const spike = spikeGroup.getObjectByName(`spike_${i}`);
              if (spike) {
                const angle = (i / 6) * Math.PI * 2;
                const radius = 5.8;
                spike.position.set(
                  Math.cos(angle) * radius,
                  Math.sin(time * 3 + i) * 0.35,
                  Math.sin(angle) * radius,
                );
                spike.rotation.x = time * 0.6;
                spike.rotation.z = time * 0.9;
              }
            }
          }

          // Volcanic plate expansion/contraction (explodes outward during charging)
          const platesGroup = container.getObjectByName('platesGroup');
          if (platesGroup) {
            const isCharging = (entity.chargeTimer ?? 0) > 0;
            const targetDist = isCharging ? 9 * 0.33 : 9 * 0.22;
            for (let i = 0; i < 8; i++) {
              const pivot = platesGroup.getObjectByName(`pivot_${i}`);
              if (pivot) {
                const plateMesh = pivot.getObjectByName(`plateMesh_${i}`);
                if (plateMesh) {
                  const currentDist = plateMesh.position.z;
                  plateMesh.position.z = THREE.MathUtils.lerp(currentDist, targetDist, dt * 8.0);
                }
              }
            }
          }
        }
      }
    }

    // 5. Shadow Grounding
    const shadow = entity.transform.children.find((c: THREE.Object3D) => c.name === 'shadow');
    if (shadow) {
      shadow.position.y = -entity.position.y + 0.02;
    }
  }
}
