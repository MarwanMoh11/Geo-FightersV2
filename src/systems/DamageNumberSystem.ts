/**
 * Floating damage numbers (Vampire Survivors style).
 *
 * A pool of absolutely-positioned DOM elements is projected from world
 * space to screen space each frame. DOM is fine here: at most a few
 * dozen labels are alive at once, and it gets crisp text, sub-pixel
 * positioning, and CSS styling for free on both desktop and mobile.
 */
import * as THREE from 'three';
import { shouldShowDamageNumbers } from '../core/SettingsManager';

const POOL_SIZE = 40;
const LIFETIME = 0.75;
const RISE_WORLD_UNITS = 1.6;

type DamageVariant = 'enemy' | 'player' | 'aoe';

interface DamageLabel {
  el: HTMLDivElement;
  active: boolean;
  life: number;
  world: THREE.Vector3;
  jitterX: number;
}

let layer: HTMLDivElement | null = null;
const pool: DamageLabel[] = [];
const _projected = new THREE.Vector3();

/**
 * Create the damage number DOM layer and pre-allocate the label pool.
 */
export function initDamageNumbers() {
  if (layer) return;
  layer = document.createElement('div');
  layer.id = 'damage-number-layer';
  document.body.appendChild(layer);

  for (let i = 0; i < POOL_SIZE; i++) {
    const el = document.createElement('div');
    el.className = 'damage-number';
    el.style.display = 'none';
    layer.appendChild(el);
    pool.push({ el, active: false, life: 0, world: new THREE.Vector3(), jitterX: 0 });
  }
}

/**
 * Spawn a floating damage number at a world position.
 *
 * @param {THREE.Vector3} position - world position to display the number at
 * @param {number} amount - damage value to display
 * @param {DamageVariant} [variant='enemy'] - visual variant (enemy, player, or aoe)
 * @param {boolean} [isCrit=false] - whether to show the CRIT label
 */
export function spawnDamageNumber(
  position: THREE.Vector3,
  amount: number,
  variant: DamageVariant = 'enemy',
  isCrit: boolean = false,
) {
  if (!layer || !shouldShowDamageNumbers()) return;

  // Reuse a free slot, or steal the oldest active one under burst load
  let label = pool.find((l) => !l.active);
  if (!label) {
    label = pool.reduce((oldest, l) => (l.life > oldest.life ? l : oldest), pool[0]);
  }

  label.active = true;
  label.life = 0;
  label.world.copy(position);
  label.world.y += 1.2; // start above the sprite, not at its feet
  label.jitterX = (Math.random() - 0.5) * 36;

  const rounded = Math.max(1, Math.round(amount));

  if (isCrit) {
    label.el.textContent = `${rounded}! CRIT`;
    label.el.className = `damage-number crit`;
  } else {
    label.el.textContent = variant === 'player' ? `-${rounded}` : String(rounded);
    label.el.className = `damage-number ${variant}${rounded >= 25 ? ' big' : ''}`;
  }

  label.el.style.display = 'block';
}

/** Hide everything immediately (used on restart). */
export function clearDamageNumbers() {
  for (const label of pool) {
    label.active = false;
    label.el.style.display = 'none';
  }
}

/**
 * Per-frame damage number tick: project each active label from world space to
 * screen space and animate its rise, scale, and fade.
 *
 * @param {number} dt - delta time since last frame in seconds
 * @param {THREE.Camera} camera - the camera used for world-to-screen projection
 */
export function DamageNumberSystem(dt: number, camera: THREE.Camera) {
  if (!layer) return;

  const halfW = window.innerWidth / 2;
  const halfH = window.innerHeight / 2;

  for (const label of pool) {
    if (!label.active) continue;

    label.life += dt;
    const t = label.life / LIFETIME;
    if (t >= 1) {
      label.active = false;
      label.el.style.display = 'none';
      continue;
    }

    // Ease-out rise in world space, then project to the screen
    const rise = RISE_WORLD_UNITS * (1 - Math.pow(1 - t, 3));
    _projected.copy(label.world);
    _projected.y += rise;
    _projected.project(camera);

    if (_projected.z > 1) {
      // Behind the camera — never visible from the top-down rig, but be safe
      label.el.style.display = 'none';
      label.active = false;
      continue;
    }

    const x = _projected.x * halfW + halfW + label.jitterX;
    const y = -_projected.y * halfH + halfH;

    // Quick pop-in, then shrink-fade on the way out
    const scale = t < 0.12 ? 0.6 + (t / 0.12) * 0.55 : 1.15 - (t - 0.12) * 0.35;
    const opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;

    label.el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})`;
    label.el.style.opacity = String(opacity);
  }
}
