// --- WAYFINDING SYSTEM (Phase 1.95) ---
// Collects every touchable point of interest for the minimap overlay.
// Runs its math at 10 Hz — minimap waypoints don't need frame-rate precision.

import * as THREE from 'three';
import { world } from '../core/world';
import { getStashPoi } from './ShrineSystem';
import { getEventPois } from './MapEventSystem';
import { getBreachPois } from './BreachSystem';

export interface Poi {
  x: number;
  z: number;
  icon: string;
  color: string;
  /** Arrows only appear within this range (minimap shows them regardless) */
  maxDist: number;
}

export interface PoiArrow {
  id: number;
  icon: string;
  color: string;
  leftPct: number;
  topPct: number;
  angleDeg: number;
  dist: number;
}

const PICKUP_ICONS: Record<string, { icon: string; color: string }> = {
  medkit: { icon: '💊', color: '#4dff88' },
  magnet: { icon: '🧲', color: '#36e6ff' },
  bomb: { icon: '💣', color: '#ff3d77' },
  key: { icon: '🗝️', color: '#ffd75e' },
};

/** Every live POI on the map right now (shared with the minimap). */
/**
 * Collect every live point of interest on the map for the minimap and wayfinding arrows.
 *
 * @returns {Poi[]} list of current POIs across the arena
 */
export function collectPois(): Poi[] {
  const pois: Poi[] = [];

  // Breach doors (ready ones) + black-market stash + scheduled-event sites
  pois.push(...getBreachPois());
  const stash = getStashPoi();
  if (stash) pois.push(stash);
  pois.push(...getEventPois());

  // Chests (includes supply-drop chests)
  for (const chest of world.with('isChest', 'position')) {
    pois.push({
      x: chest.position.x,
      z: chest.position.z,
      icon: '🎁',
      color: '#ffaa33',
      maxDist: 150,
    });
  }

  // Data vaults (gold loot piñata)
  for (const enemy of world.with('isEnemy', 'position')) {
    if (enemy.isVault) {
      pois.push({
        x: enemy.position.x,
        z: enemy.position.z,
        icon: '💰',
        color: '#ffcc33',
        maxDist: 999,
      });
    }
  }

  // Floor consumables
  for (const pickup of world.with('isPickup', 'position')) {
    const style = PICKUP_ICONS[pickup.pickupType ?? ''] ?? PICKUP_ICONS.medkit;
    pois.push({
      x: pickup.position.x,
      z: pickup.position.z,
      icon: style.icon,
      color: style.color,
      maxDist: 90,
    });
  }

  return pois;
}

const _proj = new THREE.Vector3();
let accumulator = 0;

/**
 * Per-frame wayfinding tick (throttled to 10 Hz): project off-screen POIs into
 * HUD edge-arrows and publish them to uiState.
 *
 * @param {number} dt - delta time since last frame in seconds
 * @param {THREE.Camera} camera - the camera used for world-to-screen projection
 * @returns {void}
 */
export function WayfindingSystem(dt: number, camera: THREE.Camera): void {
  accumulator += dt;
  if (accumulator < 0.1) return; // 10 Hz is plenty for guidance arrows
  accumulator = 0;

  const player = world.with('isLocalPlayer', 'position').first;
  if (!player) return;

  const arrows: PoiArrow[] = [];
  const pois = collectPois();
  for (let i = 0; i < pois.length; i++) {
    const poi = pois[i];
    const dx = poi.x - player.position.x;
    const dz = poi.z - player.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > poi.maxDist) continue;

    // World → normalized device coords; on-screen POIs need no arrow
    _proj.set(poi.x, 1, poi.z).project(camera);
    if (Math.abs(_proj.x) < 0.92 && Math.abs(_proj.y) < 0.88) continue;

    const cx = THREE.MathUtils.clamp(_proj.x, -0.88, 0.88);
    const cy = THREE.MathUtils.clamp(_proj.y, -0.8, 0.8);
    arrows.push({
      id: i,
      icon: poi.icon,
      color: poi.color,
      leftPct: (cx * 0.5 + 0.5) * 100,
      topPct: (-cy * 0.5 + 0.5) * 100,
      // Chevron points from screen center toward the POI
      angleDeg: (Math.atan2(-_proj.y, _proj.x) * 180) / Math.PI,
      dist: Math.round(dist),
    });
  }

  arrows.sort((a, b) => a.dist - b.dist);
}
