import * as THREE from 'three';

// Feature detection: Check if WebGPU is available
function isWebGPUAvailable(): boolean {
  return 'gpu' in navigator;
}

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

  // 3. The Renderer - WebGPU with WebGL fallback
  let renderer: any;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );

  if (isWebGPUAvailable()) {
    try {
      console.log(
        `[Renderer] WebGPU is available. Mobile: ${isMobile}. Attempting to initialize...`,
      );
      const { WebGPURenderer } = await import('three/webgpu');
      // Disable AA on mobile for fill-rate performance gain
      renderer = new WebGPURenderer({ antialias: !isMobile, forceWebGL: false });
      await renderer.init();

      // Check if WebGPU actually initialized or fell back to WebGL
      const backend = (renderer as any).backend || {};
      const isUsingWebGPU = backend.isWebGPUBackend || false;

      if (isUsingWebGPU) {
        console.log('[Renderer] ✅ WebGPU initialized successfully');
      } else {
        console.log('[Renderer] ⚠️ WebGPU context creation failed, using WebGL2 fallback');
      }
    } catch (error) {
      console.warn('[Renderer] WebGPU initialization failed, falling back to WebGL:', error);
      renderer = new THREE.WebGLRenderer({ antialias: !isMobile });
    }
  } else {
    console.log(`[Renderer] WebGPU not available, using WebGL renderer. Mobile: ${isMobile}`);
    renderer = new THREE.WebGLRenderer({ antialias: !isMobile });
  }

  // Disable shadow map completely on mobile; use soft PCF shadows on desktop
  if (isMobile) {
    renderer.shadowMap.enabled = false;
  } else {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2)); // Lower pixel ratio limit on mobile for speed

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
  dirLight.castShadow = !isMobile; // No shadow maps rendered from light on mobile

  if (!isMobile) {
    dirLight.shadow.mapSize.width = 512;
    dirLight.shadow.mapSize.height = 512;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 80;
    dirLight.shadow.camera.left = -25;
    dirLight.shadow.camera.right = 25;
    dirLight.shadow.camera.top = 25;
    dirLight.shadow.camera.bottom = -25;
    dirLight.shadow.bias = -0.0005;
  }
  scene.add(dirLight);

  // 5. The Floor is now created by LevelSystem
  // (Replaced GridHelper with textured ground plane in LevelSystem.ts)

  // 6. Responsive Window
  // iOS (especially installed PWAs) misreports innerHeight at boot and does
  // not always fire `resize` when the browser chrome / home-indicator area
  // settles — so also listen to visualViewport and re-measure shortly after
  // load, or the canvas leaves an unused strip at the bottom of the screen.
  const applySize = () => {
    const w = window.visualViewport?.width ?? window.innerWidth;
    const h = window.visualViewport?.height ?? window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', applySize);
  window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
  window.visualViewport?.addEventListener('resize', applySize);
  setTimeout(applySize, 400); // iOS standalone: first paint often has stale metrics

  return { scene, camera, renderer };
}
