import * as THREE from 'three';

const textureLoader = new THREE.TextureLoader();
const textures = new Map<string, THREE.Texture>();

// List of all textures to preload
const TEXTURE_PATHS = [
  // Player & Enemies
  '/sprites/player/player_robot.png',
  '/sprites/enemies/enemy_glitch.png',
  // Environment - Level 1
  '/textures/environments/ground_asphalt.png',
  '/textures/environments/wall_texture.png',
  '/textures/environments/prop_taxi.png',
  '/textures/environments/prop_vending.png',
  '/textures/environments/prop_scrap.png',
  '/textures/environments/prop_container.png',
  '/textures/environments/prop_mech.png',
  '/textures/environments/prop_bench.png',
];

// Preload all textures and return a promise
export function preloadTextures(onProgress?: (loaded: number, total: number) => void): Promise<void> {
  let loadedCount = 0;
  const total = TEXTURE_PATHS.length;

  const loadPromises = TEXTURE_PATHS.map((path) => {
    return new Promise<void>((resolve) => {
      textureLoader.load(
        path,
        (texture) => {
          // Pixel Art Settings (Crisp edges)
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          texture.colorSpace = THREE.SRGBColorSpace;
          textures.set(path, texture);
          loadedCount++;
          if (onProgress) onProgress(loadedCount, total);
          resolve();
        },
        undefined,
        (error) => {
          console.warn(`Failed to load texture: ${path}`, error);
          loadedCount++;
          if (onProgress) onProgress(loadedCount, total);
          resolve(); // Don't reject - continue with missing textures
        },
      );
    });
  });

  return Promise.all(loadPromises).then(() => {
    console.log('All textures loaded!');
  });
}

// Helper to get a cached texture (must be preloaded first)
export function loadTexture(path: string): THREE.Texture {
  const cached = textures.get(path);
  if (cached) {
    return cached;
  }

  // Fallback: load synchronously if not preloaded (not recommended)
  console.warn(`Texture not preloaded: ${path}. Loading now...`);
  const texture = textureLoader.load(path);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  textures.set(path, texture);
  return texture;
}
