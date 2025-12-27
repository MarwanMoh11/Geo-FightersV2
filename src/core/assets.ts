import * as THREE from 'three';

const textureLoader = new THREE.TextureLoader();
const textures = new Map<string, THREE.Texture>();

// Helper to load and cache textures
export function loadTexture(path: string): THREE.Texture {
  if (textures.has(path)) {
    return textures.get(path)!;
  }

  const texture = textureLoader.load(path);
  // Pixel Art Settings (Crisp edges)
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;

  textures.set(path, texture);
  return texture;
}
