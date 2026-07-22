import type * as THREE from 'three';

// DestructibleSystem — removed. Scrap crates, pickups, and coin props are gone;
// credits are now instant wallet increments via spawnCredit().
export function DestructibleSystem(_dt: number, _scene: THREE.Scene): void {}
export function resetDestructibles(): void {}
