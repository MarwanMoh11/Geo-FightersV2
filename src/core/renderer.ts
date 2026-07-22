import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { getQualityProfile, initDynamicResolution, applyPixelRatio, isMobile } from './quality';
import { onSettingsChange } from './SettingsManager';

// Feature detection: Check if WebGPU is available
function isWebGPUAvailable(): boolean {
  return 'gpu' in navigator;
}

export async function initRenderer() {
  // 1. The Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222); // Dark Grey (easier on eyes than black)

  // Depth range is deliberately tight (near 2, far 600): the camera rig never
  // gets closer than ~40 units to anything, and mobile GPUs z-fight the
  // layered ground decals (decks/grid/rails at y 0.01-0.05) when precision is
  // spread across a 0.1-1000 range — that read as "flickering map textures".
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 2, 600);

  // "Hades" style is high up and angled significantly
  // We move it further away (40, 40) because the narrow FOV zooms us in.
  camera.position.set(0, 40, 40);
  camera.lookAt(0, 0, 0);

  // 3. The Renderer - WebGPU with WebGL fallback
  // All quality knobs (AA, shadows, pixel ratio) come from the quality profile
  // resolved from the user's Graphics Quality setting (auto/low/medium/high).
  let renderer: any;
  const quality = getQualityProfile();

  if (isWebGPUAvailable()) {
    try {
      console.log(
        `[Renderer] WebGPU is available. Quality: ${quality.tier}. Attempting to initialize...`,
      );
      const { WebGPURenderer } = await import('three/webgpu');
      renderer = new WebGPURenderer({
        antialias: quality.antialias,
        forceWebGL: false,
        powerPreference: isMobile ? 'low-power' : 'high-performance',
      });
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
      renderer = new THREE.WebGLRenderer({
        antialias: quality.antialias,
        powerPreference: isMobile ? 'low-power' : 'high-performance',
      });
    }
  } else {
    console.log(`[Renderer] WebGPU not available, using WebGL renderer. Quality: ${quality.tier}`);
    renderer = new THREE.WebGLRenderer({
      antialias: quality.antialias,
      powerPreference: isMobile ? 'low-power' : 'high-performance',
    });
  }

  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  renderer.setSize(window.innerWidth, window.innerHeight);

  // --- IMAGE-BASED LIGHTING (Phase 1.8) ---
  // A PMREM'd RoomEnvironment gives every metallic surface (player rigs,
  // enemy armor) real reflections instead of flat grey. One-time generation
  // cost, then effectively free per-frame. Skipped on the low tier.
  // NOTE: most players run THREE.WebGPURenderer with its WebGL2 *backend*
  // (context creation for real WebGPU often fails) — that class needs the
  // backend-agnostic PMREMGenerator from three/webgpu, not THREE.PMREMGenerator.
  const isWebGPUClass = !(renderer instanceof THREE.WebGLRenderer);
  if (quality.tier !== 'low') {
    try {
      let envTexture: THREE.Texture;
      if (isWebGPUClass) {
        const { PMREMGenerator } = await import('three/webgpu');
        const pmrem = new PMREMGenerator(renderer);
        envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
      } else {
        const pmrem = new THREE.PMREMGenerator(renderer);
        envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
      }
      scene.environment = envTexture;
      // Keep it subtle — the game's mood is dark neon, not showroom
      scene.environmentIntensity = 0.5;
      console.log('[Renderer] Environment lighting active');
    } catch (err) {
      console.warn('[Renderer] Environment map skipped:', err);
    }
  }

  // --- BLOOM (Phase 1.8, strictly gated) ---
  // Threshold bloom so emissive parts genuinely glow. HIGH tier, desktop
  // only — every other configuration renders exactly as before with zero
  // added cost. Two implementations: node-based PostProcessing for the
  // WebGPURenderer class (works on both its backends), classic
  // EffectComposer for the plain-WebGL fallback.
  let composer: EffectComposer | null = null;
  let postProcessing: { render: () => void } | null = null;
  let bloomEnabled = false;
  if (quality.tier === 'high' && !isMobile) {
    try {
      if (isWebGPUClass) {
        const { PostProcessing } = await import('three/webgpu');
        const { pass } = await import('three/tsl');
        const { bloom } = await import('three/addons/tsl/display/BloomNode.js');
        const scenePass = pass(scene, camera);
        const bloomPass = bloom(scenePass, 0.35, 0.4, 0.85); // strength, radius, threshold
        const post = new PostProcessing(renderer);
        post.outputNode = scenePass.add(bloomPass);
        postProcessing = post;
      } else {
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        composer.addPass(
          new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.35, // strength: a glow, not a smear
            0.4, // radius
            0.85, // threshold: only genuinely bright emissives bloom
          ),
        );
      }
      bloomEnabled = true;
      console.log('[Renderer] Bloom enabled (high tier)');
    } catch (err) {
      composer = null;
      postProcessing = null;
      console.warn('[Renderer] Bloom skipped:', err);
    }
  }

  // Live quality switches toggle bloom off/on without a reload
  onSettingsChange(() => {
    bloomEnabled =
      (composer !== null || postProcessing !== null) && getQualityProfile().tier === 'high';
  });

  // Shadow map refresh is capped at 30Hz: the arena is static and the only
  // real casters left are the player and boss (the horde uses instanced blob
  // shadows). A 33ms shadow lag is imperceptible; halving the shadow pass is not.
  renderer.shadowMap.autoUpdate = false;
  let shadowRefreshAccum = 0;
  const SHADOW_REFRESH_INTERVAL = 1 / 30;
  let lastFrameTime = performance.now();

  /** Render one frame through the bloom pipeline when it's active. */
  const renderFrame = () => {
    if (renderer.shadowMap.enabled) {
      const now = performance.now();
      shadowRefreshAccum += (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      if (shadowRefreshAccum >= SHADOW_REFRESH_INTERVAL) {
        shadowRefreshAccum = 0;
        renderer.shadowMap.needsUpdate = true;
      }
    }
    if (bloomEnabled && postProcessing) postProcessing.render();
    else if (bloomEnabled && composer) composer.render();
    else renderer.render(scene, camera);
  };

  // Pixel ratio is owned by the quality manager (handles caps + adaptive
  // scaling); the composer must track it or bloom renders at the wrong size.
  initDynamicResolution({
    setPixelRatio: (ratio: number) => {
      renderer.setPixelRatio(ratio);
      composer?.setPixelRatio(ratio);
    },
  });

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
  dirLight.castShadow = quality.shadows;

  if (quality.shadows) {
    dirLight.shadow.mapSize.width = quality.shadowMapSize;
    dirLight.shadow.mapSize.height = quality.shadowMapSize;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 80;
    dirLight.shadow.camera.left = -25;
    dirLight.shadow.camera.right = 25;
    dirLight.shadow.camera.top = 25;
    dirLight.shadow.camera.bottom = -25;
    dirLight.shadow.bias = -0.0005;
  }
  scene.add(dirLight);

  // Live-apply shadow toggles when the user changes quality in Settings
  // (antialiasing needs a reload; everything else applies immediately)
  onSettingsChange(() => {
    const q = getQualityProfile();
    renderer.shadowMap.enabled = q.shadows;
    dirLight.castShadow = q.shadows;
    if (q.shadows && q.shadowMapSize > 0) {
      dirLight.shadow.mapSize.width = q.shadowMapSize;
      dirLight.shadow.mapSize.height = q.shadowMapSize;
      if (dirLight.shadow.map) {
        dirLight.shadow.map.dispose();
        dirLight.shadow.map = null;
      }
    }
  });

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
    composer?.setSize(w, h);
    applyPixelRatio(); // devicePixelRatio can change when moving across monitors
  };
  window.addEventListener('resize', applySize);
  window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
  window.visualViewport?.addEventListener('resize', applySize);
  setTimeout(applySize, 400); // iOS standalone: first paint often has stale metrics

  return { scene, camera, renderer, renderFrame };
}
