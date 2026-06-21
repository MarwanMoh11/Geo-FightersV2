import * as THREE from 'three';
import { world } from './world';

// --- GEOMETRY CACHE ---
const sphereGeo = new THREE.SphereGeometry(0.3, 8, 8);
const boxGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
const ringGeo = new THREE.RingGeometry(0.2, 0.3, 16);
const coneGeo = new THREE.ConeGeometry(0.2, 0.6, 6);
const cylinderGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.8, 6);
cylinderGeo.rotateX(Math.PI / 2); // align along Z-axis

// Custom shapes
const crescentGeo = new THREE.TorusGeometry(0.6, 0.12, 6, 24, Math.PI); // Half circle blade
crescentGeo.rotateX(Math.PI / 2); // lie flat

const hexGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 6);
hexGeo.rotateX(Math.PI / 2); // lie flat



// --- MATERIAL CACHES ---
const glowMaterials = new Map<number, THREE.MeshStandardMaterial>();
const wireframeMaterials = new Map<number, THREE.MeshBasicMaterial>();

export function getGlowMaterial(color: number): THREE.MeshStandardMaterial {
  let mat = glowMaterials.get(color);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 2.5,
      roughness: 0.1,
      metalness: 0.1,
    });
    glowMaterials.set(color, mat);
  }
  return mat;
}

export function getWireframeMaterial(color: number): THREE.MeshBasicMaterial {
  let mat = wireframeMaterials.get(color);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      color: color,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
    });
    wireframeMaterials.set(color, mat);
  }
  return mat;
}

const blackMaterial = new THREE.MeshStandardMaterial({
  color: 0x020202,
  roughness: 0.9,
  metalness: 0.1,
});

/**
 * Creates a highly customized, theme-appropriate 3D mesh for each weapon type.
 */
export function createCustomProjectileMesh(
  weaponId: string,
  color: number,
  width: number,
  length: number,
  dir: THREE.Vector3 = new THREE.Vector3(0, 0, 1),
): THREE.Object3D {
  const group = new THREE.Group();
  group.name = `proj_${weaponId}`;

  const glowMat = getGlowMaterial(color);
  const wireMat = getWireframeMaterial(color);

  switch (weaponId) {
    // ----------------------------------------------------
    // DIRECTIONAL WEAPONS
    // ----------------------------------------------------
    case 'pulse_repeater': {
      // Sleek energy bolt: capsule cylinder with glowing spheres on tips
      const main = new THREE.Mesh(cylinderGeo, glowMat);
      main.scale.set(width * 2, width * 2, length * 1.2);
      group.add(main);

      const tip = new THREE.Mesh(sphereGeo, glowMat);
      tip.position.set(0, 0, length * 0.6);
      tip.scale.setScalar(width * 2.2);
      group.add(tip);
      break;
    }

    case 'omega_pulse': {
      // Radial fire spikes: glowing diamond prism
      const main = new THREE.Mesh(cylinderGeo, glowMat);
      main.scale.set(width * 2.5, width * 2.5, length * 1.5);
      group.add(main);

      // Inner electric core
      const core = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      core.scale.setScalar(width * 1.5);
      group.add(core);
      break;
    }

    case 'monowire_lash': {
      // Wavy energy filaments
      const filamentGroup = new THREE.Group();
      filamentGroup.name = 'filament_root';
      const segmentCount = 4;
      for (let i = 0; i < segmentCount; i++) {
        const seg = new THREE.Mesh(cylinderGeo, glowMat);
        // Thin filament segments
        seg.scale.set(width * 0.8, width * 0.8, (length / segmentCount) * 1.3);
        // stagger them forward
        seg.position.set(Math.sin(i * 1.5) * 0.15, 0, -length * 0.5 + (i * length) / segmentCount);
        filamentGroup.add(seg);
      }
      group.add(filamentGroup);
      break;
    }

    case 'nanofiber_guillotine': {
      // Spinning razor blades: cross shape made of 2 intersecting thin boxes
      const blade1 = new THREE.Mesh(boxGeo, glowMat);
      blade1.scale.set(width * 0.5, width * 0.2, length * 1.8);
      blade1.name = 'blade1';
      group.add(blade1);

      const blade2 = new THREE.Mesh(boxGeo, glowMat);
      blade2.scale.set(length * 1.8, width * 0.2, width * 0.5);
      blade2.name = 'blade2';
      group.add(blade2);
      break;
    }

    case 'smart_rail_needles': {
      // Dual-pointed green needles: two cones back-to-back
      const cone1 = new THREE.Mesh(coneGeo, glowMat);
      cone1.rotation.x = Math.PI / 2;
      cone1.position.set(0, 0, length * 0.35);
      cone1.scale.set(width * 0.8, length * 0.7, width * 0.8);
      group.add(cone1);

      const cone2 = new THREE.Mesh(coneGeo, glowMat);
      cone2.rotation.x = -Math.PI / 2;
      cone2.position.set(0, 0, -length * 0.35);
      cone2.scale.set(width * 0.8, length * 0.7, width * 0.8);
      group.add(cone2);
      break;
    }

    case 'magnetic_railstorm': {
      // Green lightning bolt needle: spiky segmented line
      const boltGroup = new THREE.Group();
      boltGroup.name = 'bolt_segments';
      const points = [
        new THREE.Vector3(0, 0, -length * 0.5),
        new THREE.Vector3(0.18, 0, -length * 0.2),
        new THREE.Vector3(-0.18, 0, length * 0.1),
        new THREE.Vector3(0, 0, length * 0.5),
      ];

      for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        const distance = start.distanceTo(end);
        const segment = new THREE.Mesh(cylinderGeo, glowMat);
        segment.scale.set(width * 1.2, width * 1.2, distance);
        segment.position.copy(start).add(end).multiplyScalar(0.5);
        segment.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3().subVectors(end, start).normalize(),
        );
        boltGroup.add(segment);
      }
      group.add(boltGroup);
      break;
    }

    // ----------------------------------------------------
    // AREA DENIAL WEAPONS
    // ----------------------------------------------------
    case 'emp_pulse_node':
    case 'blackout_field': {
      // Electromagnetic cage: solid sphere core and outer wireframe shell
      const core = new THREE.Mesh(sphereGeo, glowMat);
      core.scale.setScalar(width * 1.2);
      group.add(core);

      const shell = new THREE.Mesh(sphereGeo, wireMat);
      shell.scale.setScalar(width * 1.9);
      shell.name = 'rotating_shell';
      group.add(shell);
      break;
    }

    case 'cryo_foam_disperser': {
      // Clustered frost foam bubbles
      const bubbleGroup = new THREE.Group();
      bubbleGroup.name = 'bubbles';
      const positions = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(width * 0.4, 0.1, width * 0.3),
        new THREE.Vector3(-width * 0.5, -0.1, width * 0.2),
        new THREE.Vector3(0, 0.2, -width * 0.4),
      ];
      positions.forEach((pos, idx) => {
        const bub = new THREE.Mesh(sphereGeo, glowMat);
        bub.position.copy(pos);
        bub.scale.setScalar(width * (0.8 - idx * 0.08));
        bubbleGroup.add(bub);
      });
      group.add(bubbleGroup);
      break;
    }

    case 'thermal_collapse': {
      // Ice-crystal/snowflake: 3 intersecting spiky cylinders
      const crystalGroup = new THREE.Group();
      crystalGroup.name = 'crystals';

      const c1 = new THREE.Mesh(cylinderGeo, glowMat);
      c1.scale.set(width * 0.4, width * 0.4, length * 1.5);
      crystalGroup.add(c1);

      const c2 = new THREE.Mesh(cylinderGeo, glowMat);
      c2.rotation.y = Math.PI / 2;
      c2.scale.set(width * 0.4, width * 0.4, length * 1.5);
      crystalGroup.add(c2);

      const c3 = new THREE.Mesh(cylinderGeo, glowMat);
      c3.rotation.x = Math.PI / 2;
      c3.scale.set(width * 0.4, width * 0.4, length * 1.5);
      crystalGroup.add(c3);

      group.add(crystalGroup);
      break;
    }

    // ----------------------------------------------------
    // ORBITAL WEAPONS
    // ----------------------------------------------------
    case 'drone_halo': {
      // Orbiting robotic drone: central sphere + golden ring rotating around it
      const core = new THREE.Mesh(sphereGeo, glowMat);
      core.scale.setScalar(width * 1.1);
      group.add(core);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(width * 1.6, width * 0.2, 4, 16),
        wireMat,
      );
      ring.name = 'drone_ring';
      group.add(ring);
      break;
    }

    case 'swarm_intelligence': {
      // Autonomous Quadcopter drone: central frame, 4 rotors, camera eye
      const body = new THREE.Mesh(boxGeo, blackMaterial);
      body.scale.set(width * 1.2, width * 0.4, width * 1.2);
      group.add(body);

      // Cyan camera lens/eye
      const eye = new THREE.Mesh(sphereGeo, glowMat);
      eye.position.set(0, 0, width * 0.65);
      eye.scale.setScalar(width * 0.45);
      group.add(eye);

      // Rotors
      const rotorGroup = new THREE.Group();
      rotorGroup.name = 'rotors';
      const offset = width * 0.8;
      const positions = [
        new THREE.Vector3(offset, 0.2, offset),
        new THREE.Vector3(-offset, 0.2, offset),
        new THREE.Vector3(offset, 0.2, -offset),
        new THREE.Vector3(-offset, 0.2, -offset),
      ];
      positions.forEach((pos, idx) => {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(width * 0.4, width * 0.08, 4, 12),
          wireMat,
        );
        ring.position.copy(pos);
        ring.rotation.x = Math.PI / 2;
        ring.name = `rotor_${idx}`;
        rotorGroup.add(ring);
      });
      group.add(rotorGroup);
      break;
    }

    case 'photon_blades': {
      // Rotating hard-light arcs
      const blade = new THREE.Mesh(crescentGeo, glowMat);
      blade.scale.set(width * 1.6, width * 0.5, length * 1.0);
      blade.name = 'hard_light_arc';
      group.add(blade);
      break;
    }

    case 'photon_curtain': {
      // Interlocking hexagonal light shields
      const shield = new THREE.Mesh(hexGeo, glowMat);
      shield.scale.set(width * 2.2, width * 2.2, width * 0.2);
      shield.name = 'shield_tile';
      group.add(shield);

      const outline = new THREE.Mesh(hexGeo, wireMat);
      outline.scale.set(width * 2.4, width * 2.4, width * 0.25);
      group.add(outline);
      break;
    }

    // ----------------------------------------------------
    // GLOBAL WEAPONS
    // ----------------------------------------------------
    case 'signal_hijacker': {
      // Wave transmission tower: conical pyramid with radiating signal waves
      const baseTower = new THREE.Mesh(coneGeo, blackMaterial);
      baseTower.scale.set(width * 1.2, length * 1.0, width * 1.2);
      baseTower.rotation.x = Math.PI / 2; // Point up/away
      group.add(baseTower);

      const emitter = new THREE.Mesh(sphereGeo, glowMat);
      emitter.position.set(0, 0, length * 0.5);
      emitter.scale.setScalar(width * 0.6);
      group.add(emitter);

      const ripple = new THREE.Mesh(
        new THREE.TorusGeometry(width * 1.4, width * 0.1, 4, 16),
        wireMat,
      );
      ripple.name = 'ripple_ring';
      ripple.position.set(0, 0, length * 0.5);
      group.add(ripple);
      break;
    }

    case 'neural_cascade': {
      // Virus node: orange core with multiple spike nodes
      const core = new THREE.Mesh(sphereGeo, glowMat);
      core.scale.setScalar(width * 1.5);
      group.add(core);

      const spikeCount = 6;
      for (let i = 0; i < spikeCount; i++) {
        const spike = new THREE.Mesh(coneGeo, glowMat);
        const theta = (i / spikeCount) * Math.PI * 2;
        spike.position.set(Math.cos(theta) * width * 1.1, 0, Math.sin(theta) * width * 1.1);
        spike.rotation.z = theta - Math.PI / 2;
        spike.scale.set(width * 0.4, width * 0.8, width * 0.4);
        group.add(spike);
      }
      break;
    }

    case 'orbital_kill_ping': {
      // Flashing targeting laser / reticle + beam
      // A flat targeting ring
      const ring = new THREE.Mesh(ringGeo, glowMat);
      ring.rotation.x = -Math.PI / 2;
      ring.scale.setScalar(width * 3.5);
      group.add(ring);

      // Huge vertical sky laser beam
      const beam = new THREE.Mesh(cylinderGeo, wireMat);
      beam.rotation.x = 0; // vertical
      beam.position.y = 8.0; // center it high up
      beam.scale.set(width * 2.0, 16.0, width * 2.0);
      beam.name = 'kill_beam';
      group.add(beam);
      break;
    }

    case 'saturation_strike': {
      // Dive-bombing missile
      const body = new THREE.Mesh(cylinderGeo, blackMaterial);
      body.scale.set(width * 1.5, width * 1.5, length * 1.2);
      group.add(body);

      // Glowing crimson warhead cone
      const warhead = new THREE.Mesh(coneGeo, glowMat);
      warhead.position.set(0, 0, length * 0.6);
      warhead.rotation.x = Math.PI / 2;
      warhead.scale.set(width * 1.5, length * 0.5, width * 1.5);
      group.add(warhead);

      // Back engine exhaust glow
      const exhaust = new THREE.Mesh(sphereGeo, glowMat);
      exhaust.position.set(0, 0, -length * 0.6);
      exhaust.scale.setScalar(width * 1.1);
      group.add(exhaust);
      break;
    }

    // ----------------------------------------------------
    // HIGH-RISK WEAPONS
    // ----------------------------------------------------
    case 'overclock_engine': {
      // Unstable plasma flame: central core + jagged orbiting spark shards
      const core = new THREE.Mesh(sphereGeo, glowMat);
      core.scale.setScalar(width * 1.3);
      group.add(core);

      const shard1 = new THREE.Mesh(coneGeo, wireMat);
      shard1.name = 'shard1';
      shard1.scale.set(width * 0.6, length * 0.6, width * 0.6);
      shard1.position.set(width * 0.8, width * 0.3, 0);
      group.add(shard1);

      const shard2 = new THREE.Mesh(coneGeo, wireMat);
      shard2.name = 'shard2';
      shard2.scale.set(width * 0.5, length * 0.7, width * 0.5);
      shard2.position.set(-width * 0.8, -width * 0.3, 0);
      group.add(shard2);
      break;
    }

    case 'runaway_singularity': {
      // Mini black hole: pitch black core sphere surrounded by high emissive orange torus
      const eventHorizon = new THREE.Mesh(sphereGeo, blackMaterial);
      eventHorizon.scale.setScalar(width * 1.2);
      group.add(eventHorizon);

      const accretionDisk = new THREE.Mesh(
        new THREE.TorusGeometry(width * 1.7, width * 0.35, 6, 24),
        glowMat,
      );
      accretionDisk.rotation.x = Math.PI / 2; // lie flat
      accretionDisk.name = 'accretion_disk';
      group.add(accretionDisk);
      break;
    }

    case 'memory_leak': {
      // Fragmented data cube
      const coreCube = new THREE.Mesh(boxGeo, glowMat);
      coreCube.scale.setScalar(width * 1.2);
      group.add(coreCube);

      // Smaller detached orbit voxel
      const subCube = new THREE.Mesh(boxGeo, wireMat);
      subCube.name = 'leak_voxel';
      subCube.position.set(width * 0.95, width * 0.45, -width * 0.2);
      subCube.scale.setScalar(width * 0.5);
      group.add(subCube);
      break;
    }

    case 'heap_overflow': {
      // Stack overflow columns: stack of 3 cubes stacked vertically
      const stackGroup = new THREE.Group();
      stackGroup.name = 'heap_stack';
      for (let i = 0; i < 3; i++) {
        const seg = new THREE.Mesh(boxGeo, i % 2 === 0 ? glowMat : wireMat);
        seg.position.y = (i - 1) * width * 1.0;
        seg.scale.set(width * 1.4, width * 0.8, width * 1.4);
        seg.name = `layer_${i}`;
        stackGroup.add(seg);
      }
      group.add(stackGroup);
      break;
    }

    default: {
      // Fallback sleeker bolt
      const mesh = new THREE.Mesh(cylinderGeo, glowMat);
      mesh.scale.set(width * 1.2, width * 1.2, length * 1.1);
      group.add(mesh);
      break;
    }
  }

  // Orient towards movement direction
  if (dir.lengthSq() > 0) {
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  }

  return group;
}

// Spark velocities cached to avoid memory allocations
const _sparkVel = new THREE.Vector3();

/**
 * Handles custom animations (rotations, pulses) and spawns particle trails for bullets.
 */
export function updateProjectileVisual(projectile: any, dt: number, scene: THREE.Scene) {
  const mesh = projectile.transform;
  if (!mesh) return;

  const weaponId = projectile.weaponId || '';
  const color = mesh.children[0]?.material?.color?.getHex() ?? 0x00ffff;

  // Initialize submesh reference cache on the mesh if not present
  if (!mesh.userData.cache) {
    const cache: Record<string, THREE.Object3D> = {};
    mesh.traverse((child: any) => {
      if (child.name) {
        cache[child.name] = child;
      }
    });
    mesh.userData.cache = cache;
  }
  const cache = mesh.userData.cache;

  // 1. UPDATE SUBMESH ROTATION ANIMATIONS
  switch (weaponId) {
    case 'nanofiber_guillotine': {
      const b1 = cache['blade1'];
      const b2 = cache['blade2'];
      if (b1 && b2) {
        b1.rotation.y += 18 * dt;
        b2.rotation.y += 18 * dt;
      }
      break;
    }

    case 'emp_pulse_node':
    case 'blackout_field': {
      const shell = cache['rotating_shell'];
      if (shell) {
        shell.rotation.x += 1.5 * dt;
        shell.rotation.y += 2.5 * dt;
      }
      break;
    }

    case 'thermal_collapse': {
      const crystals = cache['crystals'];
      if (crystals) {
        crystals.rotation.x += 2.0 * dt;
        crystals.rotation.z += 2.0 * dt;
      }
      break;
    }

    case 'drone_halo': {
      const ring = cache['drone_ring'];
      if (ring) {
        ring.rotation.x += 4.5 * dt;
        ring.rotation.y += 2.0 * dt;
      }
      break;
    }

    case 'swarm_intelligence': {
      const rotors = cache['rotors'];
      if (rotors) {
        rotors.children.forEach((rotor: any, idx: number) => {
          rotor.rotation.z += (idx % 2 === 0 ? 30 : -30) * dt;
        });
      }
      break;
    }

    case 'photon_blades': {
      const arc = cache['hard_light_arc'];
      if (arc) {
        arc.rotation.y += 15 * dt;
      }
      break;
    }

    case 'signal_hijacker': {
      const ripple = cache['ripple_ring'];
      if (ripple) {
        // Expand ripple and reset
        let scale = ripple.scale.x + 4.0 * dt;
        if (scale > 3.0) scale = 0.5;
        ripple.scale.setScalar(scale);
      }
      break;
    }

    case 'orbital_kill_ping': {
      const beam = cache['kill_beam'];
      if (beam) {
        // Pulse laser width
        const width = projectile.weapon?.bulletWidth || 0.4;
        const pulse = 1.0 + Math.sin(Date.now() * 0.05) * 0.25;
        beam.scale.x = width * 2.0 * pulse;
        beam.scale.z = width * 2.0 * pulse;
      }
      break;
    }

    case 'overclock_engine': {
      const s1 = cache['shard1'];
      const s2 = cache['shard2'];
      if (s1 && s2) {
        s1.rotation.x += 8 * dt;
        s1.rotation.y += 5 * dt;
        s2.rotation.y -= 7 * dt;
        s2.rotation.z += 9 * dt;
      }
      break;
    }

    case 'runaway_singularity': {
      const accretion = cache['accretion_disk'];
      if (accretion) {
        accretion.rotation.z += 12 * dt;
      }
      break;
    }

    case 'memory_leak': {
      const leak = cache['leak_voxel'];
      if (leak) {
        leak.rotation.x += 4 * dt;
        leak.rotation.z += 6 * dt;
      }
      break;
    }

    case 'heap_overflow': {
      const heap = cache['heap_stack'];
      if (heap) {
        heap.children.forEach((layer: any, idx: number) => {
          layer.rotation.y += (idx % 2 === 0 ? 3.0 : -4.5) * dt;
        });
      }
      break;
    }
  }

  // 2. SPAWN LIGHTWEIGHT PARTICLE TRAILS
  // Throttle trail spawn slightly to conserve performance (approx. 50% spawn chance per frame)
  if (Math.random() > 0.45) {
    spawnTrailParticle(projectile.position, color, weaponId, scene);
  }
}

/**
 * Creates and inserts a single lightweight fading trail particle.
 */
function spawnTrailParticle(
  pos: THREE.Vector3,
  color: number,
  weaponId: string,
  _scene: THREE.Scene,
) {
  const life = 0.15 + Math.random() * 0.1;

  // Determine scale based on weapon style
  let sizeScale = 0.6;
  if (weaponId === 'smart_rail_needles' || weaponId === 'magnetic_railstorm') {
    sizeScale = 0.5;
  } else if (weaponId === 'cryo_foam_disperser' || weaponId === 'thermal_collapse') {
    sizeScale = 0.8;
  } else if (weaponId === 'overclock_engine' || weaponId === 'runaway_singularity') {
    sizeScale = 0.8;
  } else if (weaponId === 'memory_leak' || weaponId === 'heap_overflow') {
    sizeScale = 0.5;
  }

  // Compute slight eject velocity for particle realism
  const isElectric = weaponId === 'smart_rail_needles' || weaponId === 'magnetic_railstorm';
  const isFlame = weaponId === 'overclock_engine' || weaponId === 'runaway_singularity';
  const isFrost = weaponId === 'cryo_foam_disperser' || weaponId === 'thermal_collapse';

  _sparkVel.set(
    (Math.random() - 0.5) * (isElectric ? 8 : 1.5),
    isFlame ? Math.random() * 2 + 1 : isFrost ? -0.8 : 0, // rise or sink
    (Math.random() - 0.5) * (isElectric ? 8 : 1.5),
  );

  world.add({
    isParticle: true,
    isInstancedParticle: true,
    position: pos.clone(),
    velocity: _sparkVel.clone(),
    scaleX: sizeScale,
    scaleY: sizeScale,
    scaleZ: sizeScale,
    rotationX: Math.random() * Math.PI,
    rotationZ: Math.random() * Math.PI,
    spinX: (Math.random() - 0.5) * 10,
    spinZ: (Math.random() - 0.5) * 5,
    lifeTimer: 0,
    maxLife: life,
    particleColor: color,
  });
}
