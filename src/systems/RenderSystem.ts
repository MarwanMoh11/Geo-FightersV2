import { world } from '../core/world';
import * as THREE from 'three';
import { uiState } from '../core/UIState.svelte.ts';
import {
  EnemyType,
  cachedEnemyGeometries,
  getEnemySolidMaterial,
  getEnemyGlowMaterial,
  getEnemyWireMaterial,
  pregenerateAllEnemyGeometries,
} from '../core/factories';

const hitFlashMaterial = new THREE.MeshBasicMaterial({
  color: 0xff4444,
});

let time = 0;

// Instanced meshes for enemies & shadows to optimize draw calls
const enemySolidInstances = new Map<string, THREE.InstancedMesh>();
const enemyGlowInstances = new Map<string, THREE.InstancedMesh>();
const enemyWireInstances = new Map<string, THREE.InstancedMesh>();
let shadowInstances: THREE.InstancedMesh | null = null;

// Ground aura ring under elites/minibosses: one instanced mesh total,
// tinted per type via instance color. Reads "dangerous" at a glance.
let eliteAuraInstances: THREE.InstancedMesh | null = null;
const MAX_ELITE_AURAS = 120;
const ELITE_AURA_COLORS: Partial<Record<EnemyType, number>> = {
  [EnemyType.ENFORCER]: 0x00ffcc,
  [EnemyType.COLOSSUS]: 0xffaa00,
  [EnemyType.WARDEN]: 0xff00cc,
  [EnemyType.HYDRA]: 0xff2244,
  [EnemyType.OVERSEER]: 0xaa44ff,
};

// Per-type instanced-mesh capacity. Was 500; raised alongside the +50%
// horde scaling (TimelineSpawner MAX_ENEMIES 400->600) so a wave-pool that
// weights heavily toward one type can't silently stop rendering enemies
// past this count while they're still alive and counted (see the count <
// MAX_ENEMY_INSTANCES guard below).
const MAX_ENEMY_INSTANCES = 3000;

const _white = new THREE.Color(0xffffff);

// Per-frame enemy list (materialized once for the instanced loop)
const _renderEnemies: any[] = [];

// Dynamic detail thresholds: wire overlay and blob shadows are the first
// things to go when the horde gets huge (matrix writes scale with count).
const WIRE_DETAIL_MAX = 700;
const SHADOW_DETAIL_MAX = 900;

/**
 * Create the solid/glow/wire InstancedMeshes for one enemy type (once) and add
 * them to the scene. Extracted so the render loop and the load-time pre-warm
 * share one code path.
 *
 * Phase 1.99: the first time a type's InstancedMesh is drawn, WebGL compiles
 * its (heavy, instanced, shadow-casting MeshStandardMaterial) shader program
 * synchronously on the main thread — a 10-40ms stall. Doing this lazily meant
 * a hitch every time a NEW enemy type first appeared mid-run (first FIREWALL
 * at 3:00, each elite on its schedule). prewarmEnemyMeshes() runs this for all
 * types at load so the compile happens on the loading screen instead.
 */
function ensureEnemyTypeMeshes(type: EnemyType, scene: THREE.Scene): void {
  // If the geometry cache was never populated (e.g. mobile prewarm failed or
  // was skipped), lazily regenerate it here so the game doesn't render empty.
  if (cachedEnemyGeometries.size === 0) {
    pregenerateAllEnemyGeometries();
  }

  const geomData = cachedEnemyGeometries.get(type);
  if (!geomData) return;

  if (!enemySolidInstances.get(type)) {
    const solidMesh = new THREE.InstancedMesh(
      geomData.solid,
      getEnemySolidMaterial(type),
      MAX_ENEMY_INSTANCES,
    );
    solidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // No shadow-map casting for the horde: the instanced blob-shadow layer
    // (shadowInstances) already grounds every enemy, and with frustumCulled
    // off the shadow pass would vertex-process ALL instances every frame.
    solidMesh.castShadow = false;
    solidMesh.receiveShadow = false;
    solidMesh.frustumCulled = false;
    solidMesh.count = 0; // nothing to draw until the render loop fills it
    for (let j = 0; j < MAX_ENEMY_INSTANCES; j++) solidMesh.setColorAt(j, _white);
    scene.add(solidMesh);
    enemySolidInstances.set(type, solidMesh);
  }

  if (!enemyGlowInstances.get(type) && geomData.glow) {
    const glowMesh = new THREE.InstancedMesh(
      geomData.glow,
      getEnemyGlowMaterial(),
      MAX_ENEMY_INSTANCES,
    );
    glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    glowMesh.frustumCulled = false;
    glowMesh.count = 0;
    for (let j = 0; j < MAX_ENEMY_INSTANCES; j++) glowMesh.setColorAt(j, _white);
    scene.add(glowMesh);
    enemyGlowInstances.set(type, glowMesh);
  }

  if (!enemyWireInstances.get(type) && geomData.wire) {
    const wireMesh = new THREE.InstancedMesh(
      geomData.wire,
      getEnemyWireMaterial(type),
      MAX_ENEMY_INSTANCES,
    );
    wireMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    wireMesh.frustumCulled = false;
    wireMesh.count = 0;
    for (let j = 0; j < MAX_ENEMY_INSTANCES; j++) wireMesh.setColorAt(j, _white);
    scene.add(wireMesh);
    enemyWireInstances.set(type, wireMesh);
  }
}

/**
 * Pre-create every enemy type's instanced meshes + shadow/aura layers at load
 * so their shaders compile during the loading screen, not mid-run. Called once
 * from main.ts after the level is built; safe to call again (idempotent).
 * The caller should render one frame afterward to force the compile.
 */
export function prewarmEnemyMeshes(scene: THREE.Scene): void {
  if (cachedEnemyGeometries.size === 0) pregenerateAllEnemyGeometries();
  if (!shadowInstances) {
    const shadowGeo = new THREE.CircleGeometry(0.4, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.4,
    });
    shadowInstances = new THREE.InstancedMesh(shadowGeo, shadowMat, MAX_ENEMY_INSTANCES * 4);
    shadowInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    shadowInstances.frustumCulled = false;
    shadowInstances.count = 0;
    scene.add(shadowInstances);
  }
  if (!eliteAuraInstances) {
    const auraGeo = new THREE.RingGeometry(0.42, 0.5, 32);
    const auraMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    eliteAuraInstances = new THREE.InstancedMesh(auraGeo, auraMat, MAX_ELITE_AURAS);
    eliteAuraInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    eliteAuraInstances.frustumCulled = false;
    eliteAuraInstances.count = 0;
    scene.add(eliteAuraInstances);
  }
  for (const type of Object.values(EnemyType)) {
    ensureEnemyTypeMeshes(type as EnemyType, scene);
  }
}

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
        // Skip the full material traversal when nothing changed since last
        // frame (the common case: alive, visible, no glow) — traversing the
        // whole player mesh at 60fps is wasted work otherwise.
        const visualKey = `${glowColor ?? 'none'}:${blinkOpacity.toFixed(3)}`;
        if (container.userData.lastVisualKey !== visualKey) {
          container.userData.lastVisualKey = visualKey;
          container.traverse((child: THREE.Object3D) => {
            if (child instanceof THREE.Mesh && child.material && !Array.isArray(child.material)) {
              child.material.transparent = true;
              // baseOpacity lets themed parts (e.g. GHOST's translucent hull)
              // keep their look through the blink/glow states
              child.material.opacity = blinkOpacity * (child.userData.baseOpacity ?? 1);

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
          // --- Animation state (Phase 1.5): theme personality + event timers ---
          const theme = container.userData.theme ?? {};
          const themeFlame = theme.flameScale ?? 1;
          const coreScaleAbs = theme.coreScaleAbs ?? 0.32;
          let gyroSpeed = theme.gyroSpeed ?? 1;

          const isDead = !!(entity.health && entity.health.current <= 0);
          // Death power-down: 0→1 over one second (tumble, sink, engines die)
          const deathT = isDead ? Math.min((container.userData.deathT ?? 0) + dt, 1) : 0;
          container.userData.deathT = deathT;

          // Overload: the whole rig visibly overdrives
          const ultActive = !!(entity.isLocalPlayer && uiState.overloadActive) && !isDead;
          if (ultActive) gyroSpeed *= 2.6;
          gyroSpeed *= 1 - deathT;

          // Fire recoil kick (stamped by WeaponSystem)
          let recoilK = 0;
          if (entity.recoilTimer !== undefined && entity.recoilTimer > 0) {
            entity.recoilTimer -= dt;
            recoilK = Math.max(0, entity.recoilTimer / 0.1);
          }

          // Level-up flourish (stamped by LootSystem): one sine arc of glory
          let lvlPulse = 0;
          if (entity.levelUpFxTimer !== undefined && entity.levelUpFxTimer > 0) {
            entity.levelUpFxTimer -= dt;
            const p = 1 - Math.max(0, entity.levelUpFxTimer) / 1.0;
            lvlPulse = Math.sin(p * Math.PI);
            gyroSpeed += lvlPulse * 6;
          }

          // Banking: roll into turns based on yaw rate (cosmetic, container-local)
          const yaw = entity.transform.rotation.y;
          let dYaw = yaw - (container.userData.lastYaw ?? yaw);
          if (dYaw > Math.PI) dYaw -= Math.PI * 2;
          else if (dYaw < -Math.PI) dYaw += Math.PI * 2;
          container.userData.lastYaw = yaw;
          const targetRoll = dt > 0 ? THREE.MathUtils.clamp((-dYaw / dt) * 0.055, -0.32, 0.32) : 0;
          const roll = THREE.MathUtils.lerp(
            container.userData.roll ?? 0,
            targetRoll * (1 - deathT),
            Math.min(1, dt * 7),
          );
          container.userData.roll = roll;

          // Hit flinch: brief scale punch while the hit flash is live
          const flinch =
            entity.hitFlashTimer && entity.hitFlashTimer > 0
              ? Math.min(1, entity.hitFlashTimer / 0.15)
              : 0;

          // Compose container-level body language
          container.scale.setScalar(1 + flinch * 0.14 + lvlPulse * 0.07);
          container.rotation.x = -0.22 * recoilK;
          container.rotation.z = roll + deathT * 0.55;
          container.position.z = -0.05 * recoilK;
          container.position.y -= deathT * 0.3; // sink below the hover set earlier

          // Core: idle breathing, hard pulse during overload, swell on level-up
          const core = cache['core'];
          if (core) {
            const pulse = ultActive ? 0.12 * Math.sin(time * 12) : 0.04 * Math.sin(time * 3);
            core.scale.setScalar(coreScaleAbs * (1 + pulse + lvlPulse * 0.18));
          }

          // Rotate the gyro stabilizer rings (rigs carry 0–3 of them)
          const gyroHRing = cache['gyroHRing'];
          const gyroVRing = cache['gyroVRing'];
          const gyroTRing = cache['gyroTRing'];
          if (gyroHRing) gyroHRing.rotation.y += dt * 2.5 * gyroSpeed;
          if (gyroVRing) gyroVRing.rotation.x += dt * 3.5 * gyroSpeed;
          if (gyroTRing) gyroTRing.rotation.y += dt * 3.0 * gyroSpeed;

          // Bob wings gently, and sweep back with speed. Each rig bakes its
          // own resting yaw into userData.baseYaw (0 for panels/pylons/fins).
          const leftWing = cache['leftWing'];
          const rightWing = cache['rightWing'];
          const speed = entity.velocity ? entity.velocity.length() : 0;
          const maxTilt = Math.min(speed * 0.08, 0.4);
          if (leftWing) {
            leftWing.rotation.z = Math.sin(time * 8) * 0.05;
            leftWing.rotation.y = (leftWing.userData.baseYaw ?? 0) - maxTilt;
          }
          if (rightWing) {
            rightWing.rotation.z = -Math.sin(time * 8) * 0.05;
            rightWing.rotation.y = (rightWing.userData.baseYaw ?? 0) + maxTilt;
          }

          // Flicker and pulse engine thruster flame cones (rigs may have a
          // single engine — each side is handled independently)
          const leftThruster = cache['leftThruster'];
          const rightThruster = cache['rightThruster'];
          if (leftThruster || rightThruster) {
            const leftInner = cache['leftFireInner'];
            const leftOuter = cache['leftFireOuter'];
            const rightInner = cache['rightFireInner'];
            const rightOuter = cache['rightFireOuter'];

            const flicker = 0.85 + Math.sin(time * 25.0) * 0.15;
            const speedScale = 1.0 + Math.min(speed * 0.15, 0.5);
            // Theme personality × overload flare × death fade
            const flameMult = themeFlame * (ultActive ? 1.5 : 1.0) * (1 - deathT);
            const scaleX = flicker * flameMult;
            const scaleY = flicker * flameMult;
            const scaleZ = flicker * speedScale * flameMult;

            if (leftInner) leftInner.scale.set(scaleX, scaleY, scaleZ);
            if (leftOuter) leftOuter.scale.set(scaleX, scaleY, scaleZ);
            if (rightInner) rightInner.scale.set(scaleX, scaleY, scaleZ);
            if (rightOuter) rightOuter.scale.set(scaleX, scaleY, scaleZ);
          }

          // Alternate bobbing for weapon barrels + recoil slide, around each
          // rig's own resting barrel position
          const leftBarrel = cache['leftBarrel'];
          const rightBarrel = cache['rightBarrel'];
          if (leftBarrel && rightBarrel) {
            if (leftBarrel.userData.baseZ === undefined) {
              leftBarrel.userData.baseZ = leftBarrel.position.z;
              rightBarrel.userData.baseZ = rightBarrel.position.z;
            }
            const slide = 0.06 * recoilK;
            leftBarrel.position.z = leftBarrel.userData.baseZ + Math.sin(time * 12) * 0.02 - slide;
            rightBarrel.position.z =
              rightBarrel.userData.baseZ - Math.sin(time * 12) * 0.02 - slide;
          }

          // Orbit shield shards/drones/dice (count + radius are per-rig;
          // flares out on level-up)
          const shieldGroup = cache['shieldGroup'];
          if (shieldGroup) {
            shieldGroup.rotation.y = time * 2.0;
            const shardCount = theme.shardCount ?? 3;
            const radius = (theme.shardRadius ?? 0.52) * (1 + lvlPulse * 1.1);
            for (let i = 0; i < shardCount; i++) {
              const shard = cache[`shieldShard_${i}`];
              if (shard) {
                const angle = (i / shardCount) * Math.PI * 2;
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
    enemyGlowInstances.clear();
    enemyWireInstances.clear();
    shadowInstances = null;
    eliteAuraInstances = null;
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
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.4,
    });
    shadowInstances = new THREE.InstancedMesh(shadowGeo, shadowMat, MAX_ENEMY_INSTANCES * 4);
    shadowInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    shadowInstances.frustumCulled = false; // Disable frustum culling to prevent culling outside the origin
    scene.add(shadowInstances);
  }

  if (!eliteAuraInstances) {
    const auraGeo = new THREE.RingGeometry(0.42, 0.5, 32);
    const auraMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    eliteAuraInstances = new THREE.InstancedMesh(auraGeo, auraMat, MAX_ELITE_AURAS);
    eliteAuraInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    eliteAuraInstances.frustumCulled = false;
    scene.add(eliteAuraInstances);
  }
  let auraCount = 0;

  // Materialize the horde once (culling off-screen enemies in normal mode,
  // bypassed when ?max is active for stress-testing).
  const localPlayer = world.with('isLocalPlayer', 'position').first;
  const camPos = localPlayer?.position;
  const isMaxMode = !!(window as any).__MAX_MODE;
  const RENDER_DIST_SQ = isMaxMode ? Infinity : 80 * 80;

  _renderEnemies.length = 0;
  for (const e of world.with('isEnemy', 'position')) {
    if (e.isBoss) continue;
    if (camPos && !isMaxMode) {
      const dx = e.position.x - camPos.x;
      const dz = e.position.z - camPos.z;
      if (dx * dx + dz * dz > RENDER_DIST_SQ) continue;
    }
    _renderEnemies.push(e);
  }
  const hordeCount = _renderEnemies.length;

  // Dynamic detail scaling: wire overlay and blob shadows drop at high counts
  // to save GPU time, but ?max mode keeps everything on for stress-testing.
  const drawWire = isMaxMode || hordeCount <= WIRE_DETAIL_MAX;
  const drawShadows = isMaxMode || hordeCount <= SHADOW_DETAIL_MAX;

  for (const entity of _renderEnemies) {
    const type = entity.enemyType as EnemyType;
    const count = counts.get(type) ?? 0;

    if (count < MAX_ENEMY_INSTANCES) {
      ensureEnemyTypeMeshes(type, scene);
      const solidMesh = enemySolidInstances.get(type);
      const glowMesh = enemyGlowInstances.get(type);
      const wireMesh = drawWire ? enemyWireInstances.get(type) : undefined;

      // Tick the hit flash here — instanced enemies have no scene-graph
      // traversal to do it, so without this they flash red forever.
      if (entity.hitFlashTimer !== undefined && entity.hitFlashTimer > 0) {
        entity.hitFlashTimer -= dt;
      }

      const size = entity.size ?? 1.0;
      // Golden-angle phase per entity breaks the hover lockstep that made the
      // whole horde bob as one rigid mass
      const phase = (entity.id ?? 0) * 2.399963;
      _tempPos.copy(entity.position);

      let scaleMult = 1.0;
      let rotX = 0;
      let rotZ = 0;
      let yawExtra = 0;
      let hoverY = Math.sin(time * 3 + phase) * 0.05;

      // Per-type motion signature
      switch (type) {
        case EnemyType.GLITCH: {
          // Corrupted data: twitchy micro-jitter with rotation snaps
          const snap = Math.sin(time * 17 + phase * 7);
          if (snap > 0.86) {
            _tempPos.x += Math.sin(time * 53 + phase) * 0.06;
            yawExtra = snap > 0.93 ? 0.4 : -0.4;
          }
          break;
        }
        case EnemyType.VIRUS:
          // Organic pulsing ball, slowly tumbling
          scaleMult = 1 + 0.09 * Math.sin(time * 4.5 + phase);
          yawExtra = time * 0.9 + phase;
          break;
        case EnemyType.FIREWALL:
          // Heavy gate: stomping march instead of floating
          hoverY = Math.abs(Math.sin(time * 2.4 + phase)) * 0.12 - 0.03;
          rotZ = Math.sin(time * 2.4 + phase) * 0.045;
          break;
        case EnemyType.ENFORCER:
          // Disciplined patrol sway
          rotZ = Math.sin(time * 1.6 + phase) * 0.06;
          break;
        case EnemyType.COLOSSUS:
          // Slow massive heave with a breathing hull
          hoverY = Math.sin(time * 1.3 + phase) * 0.09;
          scaleMult = 1 + 0.04 * Math.sin(time * 1.3 + phase);
          break;
        case EnemyType.WARDEN:
          // Unstable phase-shifter: fast nervous wobble
          rotZ = Math.sin(time * 7 + phase) * 0.13;
          rotX = Math.cos(time * 5.3 + phase) * 0.08;
          break;
        case EnemyType.HYDRA:
          // Multi-node serpent undulation
          rotX = Math.sin(time * 2.2 + phase) * 0.09;
          hoverY = Math.sin(time * 2.2 + phase * 2) * 0.08;
          break;
        case EnemyType.OVERSEER:
          // Menacing slow breathing and drift rotation
          scaleMult = 1 + 0.05 * Math.sin(time * 1.4 + phase);
          yawExtra = time * 0.25;
          break;
      }

      // Spawn-in pop: ease-out-back from 0 over 0.35s (stamped in spawnEnemy)
      if (entity.spawnAnimTimer !== undefined && entity.spawnAnimTimer > 0) {
        entity.spawnAnimTimer -= dt;
        const p = 1 - Math.max(0, entity.spawnAnimTimer) / 0.35;
        const q = p - 1;
        scaleMult *= 1 + 2.7 * q * q * q + 1.7 * q * q;
      }

      // Hit reaction: brief scale punch alongside the red instance-color flash
      if (entity.hitFlashTimer && entity.hitFlashTimer > 0) {
        scaleMult *= 1 + 0.12 * Math.min(1, entity.hitFlashTimer / 0.15);
      }

      _tempPos.y = size * 0.35 + hoverY;
      _tempScale.setScalar(size * scaleMult);
      _tempRot.set(rotX, (entity.rotationY ?? 0) + yawExtra, rotZ);
      _tempQuat.setFromEuler(_tempRot);
      _tempMat.compose(_tempPos, _tempQuat, _tempScale);

      // Set matrices and flash colors
      if (solidMesh) {
        solidMesh.setMatrixAt(count, _tempMat);
        if (entity.hitFlashTimer && entity.hitFlashTimer > 0) {
          _tempColor.setHex(0xff4444);
        } else if (entity.isVault) {
          _tempColor.setHex(0xffcc33); // data vault reads as gold loot, not threat
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

      if (glowMesh) {
        glowMesh.setMatrixAt(count, _tempMat);
        // Additive layer flashes to full white on hit — reads as a spark
        _tempColor.setHex(entity.hitFlashTimer && entity.hitFlashTimer > 0 ? 0xffffff : 0xdddddd);
        glowMesh.setColorAt(count, _tempColor);
      }

      // Elite/miniboss ground aura: flat pulsing ring at the enemy's feet
      const auraColor = entity.isVault ? 0xffcc33 : ELITE_AURA_COLORS[type];
      if (auraColor !== undefined && eliteAuraInstances && auraCount < MAX_ELITE_AURAS) {
        _tempPos.set(entity.position.x, 0.05, entity.position.z);
        const auraScale = size * (0.62 + 0.05 * Math.sin(time * 2.2 + phase));
        _tempScale.setScalar(auraScale);
        _tempRot.set(-Math.PI / 2, 0, 0);
        _tempQuat.setFromEuler(_tempRot);
        _tempMat.compose(_tempPos, _tempQuat, _tempScale);
        eliteAuraInstances.setMatrixAt(auraCount, _tempMat);
        eliteAuraInstances.setColorAt(auraCount, _tempColor.setHex(auraColor));
        auraCount++;
      }

      counts.set(type, count + 1);
    }

    if (drawShadows && shadowInstances && shadowCount < MAX_ENEMY_INSTANCES * 4) {
      const size = entity.size ?? 1.0;
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
      wireMesh.count = drawWire ? count : 0;
      wireMesh.instanceMatrix.needsUpdate = drawWire;
      if (wireMesh.instanceColor) {
        wireMesh.instanceColor.needsUpdate = drawWire;
      }
      wireMesh.visible = drawWire && count > 0;
    }

    const glowMesh = enemyGlowInstances.get(type);
    if (glowMesh) {
      glowMesh.count = count;
      glowMesh.instanceMatrix.needsUpdate = true;
      if (glowMesh.instanceColor) {
        glowMesh.instanceColor.needsUpdate = true;
      }
      glowMesh.visible = count > 0;
    }
  }

  if (eliteAuraInstances) {
    eliteAuraInstances.count = auraCount;
    eliteAuraInstances.instanceMatrix.needsUpdate = true;
    if (eliteAuraInstances.instanceColor) {
      eliteAuraInstances.instanceColor.needsUpdate = true;
    }
    eliteAuraInstances.visible = auraCount > 0;
  }

  if (shadowInstances) {
    shadowInstances.count = shadowCount;
    shadowInstances.instanceMatrix.needsUpdate = drawShadows && shadowCount > 0;
    shadowInstances.visible = drawShadows && shadowCount > 0;
  }
}
