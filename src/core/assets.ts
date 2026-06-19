import * as THREE from 'three';

const textures = new Map<string, THREE.Texture>();

// Helper to create a fallback 2x2 solid white texture
function createDummyTexture(): THREE.Texture {
  if (typeof document === 'undefined') {
    return new THREE.Texture();
  }
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 2, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

// Preload all textures and return a promise
export function preloadTextures(
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  if (onProgress) onProgress(0, 1);
  return Promise.resolve();
}

// Helper to get a cached texture (returns solid fallback for geometry-only style)
export function loadTexture(path: string): THREE.Texture {
  const cached = textures.get(path);
  if (cached) {
    return cached;
  }
  const texture = createDummyTexture();
  textures.set(path, texture);
  return texture;
}
