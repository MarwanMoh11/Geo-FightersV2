// --- DIVE SCENES (chunk2 generic placeholder) ---
// Builds the sub-scene swapped in while a breach dive is active. This chunk
// ships exactly ONE generic theme; Chunk 5 replaces `buildGenericDiveScene`
// with six themed builders (depot/armory/bank/relay/substation/stashden),
// adds ICE visuals + HUD + the BREACHED scar + transition FX.
//
// Build/teardown discipline mirrors LevelSystem.initLevel/disposeLevel: every
// created Object3D is pushed into a tracked array and disposed per-mesh on
// teardown (geometry + material, handling Material arrays minimally).

import * as THREE from 'three';

// TODO(chunk5): 6 themed builders replacing this generic one + ICE visuals.

/**
 * Build a single generic dive scene: a flat neon-grid floor, a few wireframe
 * pillars, a dark background, and a point light. Returns the scene plus the
 * tracked mesh array passed to `disposeDiveScene` on teardown.
 */
export function buildGenericDiveScene(): { scene: THREE.Scene; meshes: THREE.Object3D[] } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060a);
  // Tight fog hides the void edge of the small dive stage.
  scene.fog = new THREE.Fog(0x05060a, 18, 48);

  const meshes: THREE.Object3D[] = [];

  // --- Neon grid floor ---
  const gridHelper = new THREE.GridHelper(80, 40, 0x36e6ff, 0x113244);
  const gridMat = gridHelper.material as THREE.Material | THREE.Material[] | undefined;
  if (gridMat) {
    if (Array.isArray(gridMat)) {
      gridMat.forEach((m) => {
        m.transparent = true;
        m.opacity = 0.55;
      });
    } else {
      gridMat.transparent = true;
      gridMat.opacity = 0.55;
    }
  }
  scene.add(gridHelper);
  meshes.push(gridHelper);

  // Solid disc under the grid for depth-readability
  const floorMat = new THREE.MeshBasicMaterial({ color: 0x070912, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  scene.add(floor);
  meshes.push(floor);

  // --- Wireframe pillars around the perimeter ---
  const pillarGeo = new THREE.BoxGeometry(0.6, 8, 0.6);
  const pillarMat = new THREE.MeshBasicMaterial({
    color: 0x36e6ff,
    wireframe: true,
    transparent: true,
    opacity: 0.7,
  });
  const PILLAR_COUNT = 12;
  for (let i = 0; i < PILLAR_COUNT; i++) {
    const angle = (i / PILLAR_COUNT) * Math.PI * 2;
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(Math.cos(angle) * 14, 4, Math.sin(angle) * 14);
    scene.add(pillar);
    meshes.push(pillar);
  }

  // --- Lighting ---
  const point = new THREE.PointLight(0x66ddff, 80, 50, 2);
  point.position.set(0, 10, 0);
  scene.add(point);
  meshes.push(point);

  const ambient = new THREE.AmbientLight(0x223346, 0.6);
  scene.add(ambient);
  meshes.push(ambient);

  return { scene, meshes };
}

/**
 * Tear down a dive scene: remove every tracked object, dispose its geometry
 * and material (handling Material arrays), and clear the tracking array.
 * Modeled exactly on LevelSystem.disposeLevel.
 */
export function disposeDiveScene(scene: THREE.Scene, meshes: THREE.Object3D[]): void {
  for (const obj of meshes) {
    scene.remove(obj);
    // traverse() visits the root object too, so a single pass covers both
    // top-level meshes and any children. GridHelper is a LineSegments (not a
    // Mesh), so MESH + LineSegments are both disposed here — LevelSystem
    // only handles Mesh because its obstacle list is Mesh-only.
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }
  meshes.length = 0;
}
