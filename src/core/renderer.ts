import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';

export async function initRenderer() {
  // 1. The Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222); // Dark Grey (easier on eyes than black)

  // Replace the camera line in src/core/renderer.ts
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);

  // "Hades" style is high up and angled significantly
  // We move it further away (40, 40) because the narrow FOV zooms us in.
  camera.position.set(0, 40, 40);
  camera.lookAt(0, 0, 0);

  // 3. The Renderer - WebGPU
  const renderer = new WebGPURenderer({ antialias: true });

  // Initialize WebGPU (required, returns a promise)
  await renderer.init();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Append to #app container (not body) to prevent layout issues
  const appContainer = document.getElementById('app');
  if (appContainer) {
    appContainer.appendChild(renderer.domElement);
  } else {
    document.body.appendChild(renderer.domElement);
  }

  // 4. Improved Lighting for visibility
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Boosted from 0.4
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5); // Boosted from 1.0
  dirLight.position.set(10, 30, 10);
  dirLight.castShadow = true;
  scene.add(dirLight);

  // 5. The Floor is now created by LevelSystem
  // (Replaced GridHelper with textured ground plane in LevelSystem.ts)

  // 6. Responsive Window
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer };
}
