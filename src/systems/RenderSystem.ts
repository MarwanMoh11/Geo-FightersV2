import { world } from '../core/world';
import * as THREE from 'three';
import { uiState } from '../core/UIState.svelte.ts';
import {
  EnemyType,
  cachedEnemyGeometries,
  getEnemySolidMaterial,
  getEnemyWireMaterial,
} from '../core/factories';

const hitFlashMaterial = new THREE.MeshBasicMaterial({
  color: 0xff4444,
});

let time = 0;

// Instanced meshes for enemies & shadows to optimize draw calls
const enemySolidInstances = new Map<string, THREE.InstancedMesh>();
const enemyWireInstances = new Map<string, THREE.InstancedMesh>();
let shadowInstances: THREE.InstancedMesh | null = null;

const MAX_ENEMY_INSTANCES = 500;

// Reusable math objects to prevent per-frame allocations during rendering
const _tempPos = new THREE.Vector3();
const _tempScale = new THREE.Vector3();
const _tempRot = new THREE.Euler();
const _tempQuat = new THREE.Quaternion();
const _tempMat = new THREE.Matrix4();
const _tempColor = new THREE.Color();

export function RenderSystem(dt: number, scene: THREE.Scene) {
  time += dt;

  // 1. Process individual scene graph transforms (players, boss, non-instanced objects)
  for (const entity of world.with('position', 'transform')) {
    if (!entity.transform) continue;

    // Lazy-initialize submesh reference cache on the transform
    if (!entity.transform.userData.cache) {
      const cache: Record<string, THREE.Object3D> = {};
      entity.transform.traverse((child) => {
        if (child.name) {
          cache[child.name] = child;
        }
      });
      entity.transform.userData.cache = cache;
    }
    const cache = entity.transform.userData.cache;

    // Sync Logic Position -> Visual Group Position (only if not an instanced enemy)
    // Instanced enemies sync their position inside the InstancedMesh matrices below.
    if (!entity.isEnemy || entity.isBoss) {
      entity.transform.position.copy(entity.position);
    } else {
      // For instanced enemies, sync logic coordinates to transform group locally (used for rotation angle calc)
      entity.transform.position.x = entity.position.x;
      entity.transform.position.z = entity.position.z;
    }

    // FACE MOVEMENT DIRECTION (3D Y-axis rotation)
    if (
      (entity.isPlayer || entity.isEnemy) &&
      entity.velocity &&
      entity.velocity.lengthSq() > 0.01
    ) {
      const targetAngle = Math.atan2(entity.velocity.x, entity.velocity.z);
      entity.transform.rotation.y = targetAngle;
    }

    // GENERIC MESH TRAVERSAL HIT FLASH (Only for players & boss; regular enemies use instanceColor)
    if (entity.hitFlashTimer !== undefined && (!entity.isEnemy || entity.isBoss)) {
      const container = cache['mesh_container'];
      if (container) {
        if (entity.hitFlashTimer > 0) {
          entity.hitFlashTimer -= dt;
          container.traverse((child: THREE.Object3D) => {
            if (child instanceof THREE.Mesh && child.material && !Array.isArray(child.material)) {
              if (child.userData.originalMaterial === undefined) {
                child.userData.originalMaterial = child.material;
              }
              child.material = hitFlashMaterial;
            }
          });
        } else if (entity.hitFlashTimer !== 0) {
          container.traverse((child: THREE.Object3D) => {
            if (child instanceof THREE.Mesh && child.userData.originalMaterial !== undefined) {
              child.material = child.userData.originalMaterial;
            }
          });
          entity.hitFlashTimer = 0;
        }
      }
    }

    // PLAYER INVULNERABILITY BLINK & UPGRADE GLOW & DEATH
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

      const container = cache['mesh_container'];
      if (container) {
        container.traverse((child: THREE.Object3D) => {
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

    // Gentle Hover (apply to mesh container for non-instanced entities)
    if (
      !entity.isProjectile &&
      !entity.isParticle &&
      !entity.isXP &&
      !entity.isChest &&
      !entity.isBoss &&
      !entity.isEnemy // Instanced enemies calculate hover locally inside the instanced matrix composition
    ) {
      const container = cache['mesh_container'];
      if (container) {
        if (container.userData.baseY === undefined) {
          container.userData.baseY = container.position.y;
        }
        const hoverFreq = 3;
        const hoverAmp = 0.05;
        container.position.y = container.userData.baseY + Math.sin(time * hoverFreq) * hoverAmp;
      }
    }

    // Sub-mesh animations for players and boss (Steam game tier polish)
    if (entity.transform) {
      const container = cache['mesh_container'];
      if (container) {
        if (entity.isPlayer) {
          // Rotate horizontal and vertical gyro stabilizer rings
          const gyroHRing = cache['gyroHRing'];
          const gyroVRing = cache['gyroVRing'];
          if (gyroHRing) gyroHRing.rotation.y += dt * 2.5;
          if (gyroVRing) gyroVRing.rotation.x += dt * 3.5;

          // Bob wings gently, and tilt back depending on velocity speed
          const leftWing = cache['leftWing'];
          const rightWing = cache['rightWing'];
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
          const leftThruster = cache['leftThruster'];
          const rightThruster = cache['rightThruster'];
          if (leftThruster && rightThruster) {
            const leftInner = cache['leftFireInner'];
            const leftOuter = cache['leftFireOuter'];
            const rightInner = cache['rightFireInner'];
            const rightOuter = cache['rightFireOuter'];

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
          const leftBarrel = cache['leftBarrel'];
          const rightBarrel = cache['rightBarrel'];
          if (leftBarrel && rightBarrel) {
            leftBarrel.position.z = 0.08 + Math.sin(time * 12) * 0.02;
            rightBarrel.position.z = 0.08 - Math.sin(time * 12) * 0.02;
          }

          // Orbit shield shards in a protective ring
          const shieldGroup = cache['shieldGroup'];
          if (shieldGroup) {
            shieldGroup.rotation.y = time * 2.0;
            for (let i = 0; i < 3; i++) {
              const shard = cache[`shieldShard_${i}`];
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
        } else if (entity.isBoss) {
          // Orbit giant spikes around the final boss
          const spikeGroup = cache['spikeGroup'];
          if (spikeGroup) {
            spikeGroup.rotation.y = time * 1.0;
            for (let i = 0; i < 6; i++) {
              const spike = cache[`spike_${i}`];
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
          const platesGroup = cache['platesGroup'];
          if (platesGroup) {
            const isCharging = (entity.chargeTimer ?? 0) > 0;
            const targetDist = isCharging ? 9 * 0.33 : 9 * 0.22;
            for (let i = 0; i < 8; i++) {
              const pivot = cache[`pivot_${i}`];
              if (pivot) {
                const plateMesh = cache[`plateMesh_${i}`];
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

    // Shadow Grounding (for non-instanced entities like players/boss)
    if (!entity.isEnemy || entity.isBoss) {
      const shadow = cache['shadow'];
      if (shadow) {
        shadow.position.y = -entity.position.y + 0.02;
      }
    }
  }

  // Scene change check: clear cached InstancedMeshes if scene changes
  if (shadowInstances && shadowInstances.parent !== scene) {
    enemySolidInstances.clear();
    enemyWireInstances.clear();
    shadowInstances = null;
  }

  // 2. Render all regular enemies using InstancedMesh (bypasses scene graph)
  const counts = new Map<string, number>();
  for (const type of Object.values(EnemyType)) {
    counts.set(type, 0);
  }
  let shadowCount = 0;

  // Initialize shadow instances if needed
  if (!shadowInstances) {
    const shadowGeo = new THREE.CircleGeometry(0.4, 16);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 });
    shadowInstances = new THREE.InstancedMesh(shadowGeo, shadowMat, MAX_ENEMY_INSTANCES * 4);
    shadowInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    shadowInstances.frustumCulled = false; // Disable frustum culling to prevent culling outside the origin
    scene.add(shadowInstances);
  }

  for (const entity of world.with('isEnemy', 'position', 'transform')) {
    if (entity.isBoss) continue; // Skip boss - handled in normal scene graph

    const type = entity.enemyType as EnemyType;
    const count = counts.get(type) ?? 0;

    if (count < MAX_ENEMY_INSTANCES) {
      // Lazy-initialize solid instanced mesh per enemy type
      let solidMesh = enemySolidInstances.get(type);
      if (!solidMesh) {
        const geomData = cachedEnemyGeometries.get(type);
        if (geomData) {
          const mat = getEnemySolidMaterial(type);
          solidMesh = new THREE.InstancedMesh(geomData.solid, mat, MAX_ENEMY_INSTANCES);
          solidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          solidMesh.castShadow = true;
          solidMesh.receiveShadow = false; // Disable shadow receiving to prevent solid black shadow maps on enemies
          solidMesh.frustumCulled = false; // Disable frustum culling
          
          const white = new THREE.Color(0xffffff);
          for (let j = 0; j < MAX_ENEMY_INSTANCES; j++) {
            solidMesh.setColorAt(j, white);
          }
          
          scene.add(solidMesh);
          enemySolidInstances.set(type, solidMesh);
        }
      }

      // Lazy-initialize wireframe instanced mesh per enemy type (if wire geometry exists)
      let wireMesh = enemyWireInstances.get(type);
      if (!wireMesh) {
        const geomData = cachedEnemyGeometries.get(type);
        if (geomData && geomData.wire) {
          const mat = getEnemyWireMaterial(type);
          wireMesh = new THREE.InstancedMesh(geomData.wire, mat, MAX_ENEMY_INSTANCES);
          wireMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          wireMesh.frustumCulled = false; // Disable frustum culling
          
          const white = new THREE.Color(0xffffff);
          for (let j = 0; j < MAX_ENEMY_INSTANCES; j++) {
            wireMesh.setColorAt(j, white);
          }
          
          scene.add(wireMesh);
          enemyWireInstances.set(type, wireMesh);
        }
      }

      // Compose instance matrix
      const size = entity.size ?? entity.transform!.scale.x ?? 1.0;
      _tempPos.copy(entity.position);
      
      // Gentle floating hover
      const hoverFreq = 3;
      const hoverAmp = 0.05;
      _tempPos.y = size * 0.35 + Math.sin(time * hoverFreq) * hoverAmp;

      _tempScale.setScalar(size);
      _tempRot.set(0, entity.transform!.rotation.y, 0);
      _tempQuat.setFromEuler(_tempRot);
      _tempMat.compose(_tempPos, _tempQuat, _tempScale);

      // Set matrices and flash colors
      if (solidMesh) {
        solidMesh.setMatrixAt(count, _tempMat);
        if (entity.hitFlashTimer && entity.hitFlashTimer > 0) {
          _tempColor.setHex(0xff4444);
        } else {
          _tempColor.setHex(0xffffff);
        }
        solidMesh.setColorAt(count, _tempColor);
      }

      if (wireMesh) {
        wireMesh.setMatrixAt(count, _tempMat);
        if (entity.hitFlashTimer && entity.hitFlashTimer > 0) {
          _tempColor.setHex(0xff4444);
        } else {
          _tempColor.setHex(0xffffff);
        }
        wireMesh.setColorAt(count, _tempColor);
      }

      counts.set(type, count + 1);
    }

    // Shadow Instancing
    if (shadowInstances && shadowCount < MAX_ENEMY_INSTANCES * 4) {
      const size = entity.size ?? entity.transform!.scale.x ?? 1.0;
      _tempPos.copy(entity.position);
      _tempPos.y = 0.02;

      _tempScale.set(size / 2, size / 2, size / 2);
      _tempRot.set(-Math.PI / 2, 0, 0);
      _tempQuat.setFromEuler(_tempRot);
      _tempMat.compose(_tempPos, _tempQuat, _tempScale);

      shadowInstances.setMatrixAt(shadowCount, _tempMat);
      shadowCount++;
    }
  }

  // 3. Mark instanced buffers for GPU update
  for (const type of Object.values(EnemyType)) {
    const count = counts.get(type) ?? 0;
    
    const solidMesh = enemySolidInstances.get(type);
    if (solidMesh) {
      solidMesh.count = count;
      solidMesh.instanceMatrix.needsUpdate = true;
      if (solidMesh.instanceColor) {
        solidMesh.instanceColor.needsUpdate = true;
      }
      solidMesh.visible = count > 0;
    }

    const wireMesh = enemyWireInstances.get(type);
    if (wireMesh) {
      wireMesh.count = count;
      wireMesh.instanceMatrix.needsUpdate = true;
      if (wireMesh.instanceColor) {
        wireMesh.instanceColor.needsUpdate = true;
      }
      wireMesh.visible = count > 0;
    }
  }

  if (shadowInstances) {
    shadowInstances.count = shadowCount;
    shadowInstances.instanceMatrix.needsUpdate = true;
    shadowInstances.visible = shadowCount > 0;
  }
}
