// --- GRAPHICS QUALITY MANAGER ---
// Resolves the user's quality setting (auto/low/medium/high) into a concrete
// profile of renderer knobs, and drives adaptive dynamic-resolution scaling
// so the game holds a smooth frame rate on any device.

import { getSettings, onSettingsChange } from './SettingsManager';

export type QualityTier = 'low' | 'medium' | 'high';

export interface QualityProfile {
  tier: QualityTier;
  /** Upper bound applied to window.devicePixelRatio */
  pixelRatioCap: number;
  /** Base resolution scale multiplied into the pixel ratio (1 = native) */
  baseRenderScale: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  /** Multiplier applied to cosmetic particle spawn counts */
  particleScale: number;
  /** Decorative point lights in the level (expensive on old GPUs) */
  neonLights: boolean;
  /** Seconds between minimap canvas redraws */
  minimapInterval: number;
  /** Adaptive resolution scaling to hold frame rate */
  dynamicResolution: boolean;
}

export const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
  navigator.userAgent,
);

const PROFILES: Record<QualityTier, QualityProfile> = {
  low: {
    tier: 'low',
    pixelRatioCap: 1.0,
    baseRenderScale: 0.8,
    antialias: false,
    shadows: false,
    shadowMapSize: 0,
    particleScale: 0.35,
    neonLights: false,
    minimapInterval: 0.25,
    dynamicResolution: true, // can still drop further on truly ancient hardware
  },
  medium: {
    tier: 'medium',
    pixelRatioCap: 1.5,
    baseRenderScale: 1.0,
    antialias: !isMobile,
    shadows: !isMobile,
    shadowMapSize: 512,
    particleScale: 0.7,
    neonLights: true,
    minimapInterval: 0.12,
    dynamicResolution: false,
  },
  high: {
    tier: 'high',
    pixelRatioCap: 2.0,
    baseRenderScale: 1.0,
    antialias: true,
    shadows: !isMobile,
    shadowMapSize: 1024,
    particleScale: 1.0,
    neonLights: true,
    minimapInterval: 0.08,
    dynamicResolution: false,
  },
};

/**
 * Device heuristic for AUTO mode: pick a starting tier from memory/cores;
 * the dynamic-resolution scaler refines from there at runtime.
 */
function detectTier(): QualityTier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mem = nav.deviceMemory ?? 8; // Chrome-only; assume plenty when unknown
  const cores = navigator.hardwareConcurrency ?? 8;

  if (mem <= 2 || cores <= 2) return 'low';
  if (isMobile || mem <= 4 || cores <= 4) return 'medium';
  return 'high';
}

export function resolveTier(): QualityTier {
  const setting = getSettings().qualityLevel;
  return setting === 'auto' ? detectTier() : setting;
}

export function isAutoQuality(): boolean {
  return getSettings().qualityLevel === 'auto';
}

export function getQualityProfile(): QualityProfile {
  const profile = PROFILES[resolveTier()];
  // AUTO always gets the adaptive scaler as a safety net
  if (isAutoQuality() && !profile.dynamicResolution) {
    return { ...profile, dynamicResolution: true };
  }
  return profile;
}

/** Scale a cosmetic particle count by the current quality tier (min 1). */
export function scaleParticleCount(base: number): number {
  return Math.max(1, Math.round(base * getQualityProfile().particleScale));
}

// --- DYNAMIC RESOLUTION SCALING ---
// Tracks an exponential moving average of the frame time and nudges the
// render resolution down when the device can't keep up (and back up when
// there's headroom). Applied via renderer.setPixelRatio, so UI/text stays
// crisp while only the 3D framebuffer changes size.

interface ResizableRenderer {
  setPixelRatio(ratio: number): void;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 1.0;
const STEP_DOWN = 0.1;
const STEP_UP = 0.05;
const SLOW_FRAME_MS = 22; // sustained worse than ~45fps → drop resolution
const FAST_FRAME_MS = 14; // sustained better than ~70fps → try raising it
const ADJUST_COOLDOWN_S = 1.0;

let registeredRenderer: ResizableRenderer | null = null;
let frameTimeEma = 16.7;
let slowAccum = 0;
let fastAccum = 0;
let cooldown = 0;
let resolutionScale = 1.0;

function currentBasePixelRatio(): number {
  const profile = getQualityProfile();
  return Math.min(window.devicePixelRatio || 1, profile.pixelRatioCap) * profile.baseRenderScale;
}

export function applyPixelRatio(): void {
  registeredRenderer?.setPixelRatio(currentBasePixelRatio() * resolutionScale);
}

/** Hook the renderer up for pixel-ratio management + adaptive scaling. */
export function initDynamicResolution(renderer: ResizableRenderer): void {
  registeredRenderer = renderer;
  resolutionScale = 1.0;
  frameTimeEma = 16.7;
  applyPixelRatio();

  // Re-apply base ratio (and reset adaptation) when the user changes quality
  onSettingsChange(() => {
    resolutionScale = 1.0;
    slowAccum = 0;
    fastAccum = 0;
    applyPixelRatio();
  });
}

/** Call once per frame with the frame delta (seconds). */
export function updateDynamicResolution(dt: number): void {
  if (!registeredRenderer || !getQualityProfile().dynamicResolution) return;

  // Ignore hitch frames (tab switch, GC pause, modal open) — only sustained
  // slowness should lower the resolution
  if (dt > 0.25) return;

  // EMA over ~0.5s of frames
  const frameMs = dt * 1000;
  frameTimeEma += (frameMs - frameTimeEma) * 0.08;

  if (cooldown > 0) {
    cooldown -= dt;
    return;
  }

  if (frameTimeEma > SLOW_FRAME_MS) {
    slowAccum += dt;
    fastAccum = 0;
    // Half a second of sustained slowness → step down fast
    if (slowAccum > 0.5 && resolutionScale > MIN_SCALE) {
      resolutionScale = Math.max(MIN_SCALE, resolutionScale - STEP_DOWN);
      applyPixelRatio();
      cooldown = ADJUST_COOLDOWN_S;
      slowAccum = 0;
    }
  } else if (frameTimeEma < FAST_FRAME_MS) {
    fastAccum += dt;
    slowAccum = 0;
    // Three seconds of headroom → step back up slowly
    if (fastAccum > 3.0 && resolutionScale < MAX_SCALE) {
      resolutionScale = Math.min(MAX_SCALE, resolutionScale + STEP_UP);
      applyPixelRatio();
      cooldown = ADJUST_COOLDOWN_S;
      fastAccum = 0;
    }
  } else {
    slowAccum = 0;
    fastAccum = 0;
  }
}

/** Current adaptive resolution scale (1 = full profile resolution). */
export function getResolutionScale(): number {
  return resolutionScale;
}
