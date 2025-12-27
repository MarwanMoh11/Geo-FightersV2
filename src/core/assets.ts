import * as THREE from 'three';

const textureLoader = new THREE.TextureLoader();
const textures = new Map<string, THREE.Texture>();

// List of all textures to preload
const TEXTURE_PATHS = ['/sprites/player/player_robot.png', '/sprites/enemies/enemy_glitch.png'];

// Preload all textures and return a promise
export function preloadTextures(): Promise<void> {
  const loadPromises = TEXTURE_PATHS.map((path) => {
    return new Promise<void>((resolve, reject) => {
      textureLoader.load(
        path,
        (texture) => {
          // Pixel Art Settings (Crisp edges)
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          texture.colorSpace = THREE.SRGBColorSpace;
          textures.set(path, texture);
          console.log(`Loaded texture: ${path}`);
          resolve();
        },
        undefined,
        (error) => {
          console.error(`Failed to load texture: ${path}`, error);
          reject(error);
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
