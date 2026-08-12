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
  /** Decorative skyline geometry in the level (atmosphere, not gameplay) */
  neonLights: boolean;
  /**
   * How many of the arena's five point lights stay lit (core first, then the
   * four vault corners).
   *
   * This is a per-FRAGMENT cost, not a per-object one. The arena floor is a
   * full-map plane in MeshStandardMaterial, so it covers most of the screen
   * and every one of its pixels runs the full PBR BRDF once per light. Five
   * point lights plus the directional is six evaluations on ~790k pixels a
   * frame at the mobile pixel-ratio cap — the single largest sustained GPU
   * load in the game, and sustained GPU load is what heats a phone.
   *
   * The corner lights are the ones worth cutting: they sit at (+-52, 14, +-52)
   * with a 65-unit range, while the camera follows the player through a 35deg
   * FOV from 40 units up. For most of a run they light geometry that is not on
   * screen, yet they are still shaded into every visible fragment. The core
   * light sits at the arena centre where the fight actually happens, so it
   * survives on every tier that has lighting at all.
   */
  arenaLightCount: number;
  /** Seconds between minimap canvas redraws */
  minimapInterval: number;
  /** Adaptive resolution scaling to hold frame rate */
  dynamicResolution: boolean;
  /**
   * Threshold bloom over emissive materials. This is not a garnish — the game
   * is untextured primitives, so the glow IS the art direction. Without it the
   * same geometry reads as an unfinished grey blockout rather than neon.
   * That makes bloom the last thing to cut, not the first.
   */
  bloom: boolean;
  /**
   * Render scale for the bloom pass alone (1 = full res). Bloom is a blur, so
   * resolving it at half res is nearly invisible while quartering the fill cost
   * of its mip chain — the standard way to afford this effect on a phone.
   */
  bloomScale: number;
  /** Bloom strength / radius / luminance threshold, fed to UnrealBloomPass. */
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
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
    arenaLightCount: 0,
    minimapInterval: 0.25,
    dynamicResolution: true, // can still drop further on truly ancient hardware
    // The only tier without bloom. LOW means 2GB RAM or a dual-core — a device
    // already leaning on the adaptive scaler to hold frame rate.
    bloom: false,
    bloomScale: 0,
    bloomStrength: 0,
    bloomRadius: 0,
    bloomThreshold: 1,
  },
  medium: {
    tier: 'medium',
    // 1.25 rather than 1.5 on a phone. Fill rate is the dominant thermal cost
    // and it scales with the square of this number: on a 402x874 screen 1.5
    // renders 603x1311 (~790k pixels) every frame while 1.25 renders 503x1093
    // (~549k), a 30% cut in everything that is paid per pixel — the PBR floor,
    // the bloom mip chain, all of it. The image is softer, but it is a 6.3in
    // display being blurred by a bloom pass, which hides most of the
    // difference. Desktops on MEDIUM are plugged in and fan-cooled, so they
    // keep 1.5; someone who explicitly picks HIGH on a phone has asked for the
    // sharper image and still gets it.
    pixelRatioCap: isMobile ? 1.25 : 1.5,
    baseRenderScale: 1.0,
    antialias: !isMobile,
    shadows: !isMobile,
    shadowMapSize: 512,
    particleScale: 0.7,
    neonLights: true,
    // Every phone lands on this tier (detectTier sends all mobile here), so
    // this line is the one that decides the thermal load on the iOS build.
    // Desktops on MEDIUM are plugged in and fan-cooled; they keep all five.
    arenaLightCount: isMobile ? 1 : 5,
    minimapInterval: 0.12,
    dynamicResolution: false,
    // Where every phone lands (detectTier sends all mobile here), so this is
    // the config most players actually see. Half-res pass, and a slightly
    // higher threshold so only the true neon sources feed the mip chain
    // instead of every mid-bright surface.
    bloom: true,
    bloomScale: 0.5,
    bloomStrength: 0.5,
    bloomRadius: 0.5,
    bloomThreshold: 0.9,
  },
  high: {
    tier: 'high',
    pixelRatioCap: 1.5,
    baseRenderScale: 1.0,
    antialias: true,
    shadows: !isMobile,
    shadowMapSize: 512,
    particleScale: 1.0,
    neonLights: true,
    arenaLightCount: 5,
    minimapInterval: 0.08,
    dynamicResolution: false,
    bloom: true,
    bloomScale: 1.0,
    bloomStrength: 0.5,
    bloomRadius: 0.4,
    bloomThreshold: 0.85,
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
  // `?max` — stress-test everything at the highest possible settings, ignoring
  // the user's quality tier. Overrides pixel ratio, shadow resolution, particle
  // count, adaptive scaling, and render distance/thresholds (RenderSystem reads
  // window.__MAX_MODE to disable culling and force all detail layers).
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('max')) {
    (window as any).__MAX_MODE = true;
    return {
      tier: 'high',
      pixelRatioCap: 2.0,
      baseRenderScale: 1.0,
      antialias: true,
      shadows: true,
      shadowMapSize: 2048,
      particleScale: 2.0,
      neonLights: true,
      arenaLightCount: 5,
      minimapInterval: 0.04,
      dynamicResolution: false,
      bloom: true,
      bloomScale: 1.0,
      bloomStrength: 0.6,
      bloomRadius: 0.4,
      bloomThreshold: 0.8,
    };
  }

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
// Thresholds are ratios of the frame budget, not fixed milliseconds. They used
// to be 22ms and 14ms, which silently assumed a 60fps target — the moment the
// thermal governor below caps the game at 45fps, every frame legitimately takes
// 22ms and a fixed threshold reads that as the GPU drowning, so the scaler
// would shred the resolution chasing a frame rate it was itself capped at.
// Expressed against the live budget, the same ratios mean the same thing at
// any cap: 1.32x budget is genuinely behind, 0.84x is genuinely ahead.
const SLOW_FRAME_RATIO = 1.32;
const FAST_FRAME_RATIO = 0.84;
const ADJUST_COOLDOWN_S = 1.0;

/** Frame budget the scaler measures against; updated when the cap changes. */
let targetFrameMs = 1000 / 60;

export function setTargetFrameMs(ms: number): void {
  targetFrameMs = ms > 0 ? ms : 1000 / 60;
}

let registeredRenderer: ResizableRenderer | null = null;
let frameTimeEma = 16.7;
let slowAccum = 0;
let fastAccum = 0;
let cooldown = 0;
let resolutionScale = 1.0;

/**
 * Last-resort bloom kill switch, owned by the adaptive scaler.
 *
 * Bloom is the art direction on untextured geometry, so it is the last thing
 * cut and the first thing restored — resolution has to bottom out at MIN_SCALE
 * and frames must STILL be slow before this trips. This is what makes it safe
 * to hand every phone a bloom pass by default: a device that genuinely cannot
 * afford it opts itself out within a couple of seconds instead of chugging.
 */
let bloomSuppressed = false;

export function isBloomSuppressed(): boolean {
  return bloomSuppressed;
}

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
  bloomSuppressed = false;
  frameTimeEma = 16.7;
  applyPixelRatio();

  // Re-apply base ratio (and reset adaptation) when the user changes quality
  onSettingsChange(() => {
    resolutionScale = 1.0;
    bloomSuppressed = false;
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

  const slowFrameMs = targetFrameMs * SLOW_FRAME_RATIO;
  const fastFrameMs = targetFrameMs * FAST_FRAME_RATIO;

  if (frameTimeEma > slowFrameMs) {
    slowAccum += dt;
    fastAccum = 0;
    // Half a second of sustained slowness → step down fast
    if (slowAccum > 0.5 && resolutionScale > MIN_SCALE) {
      resolutionScale = Math.max(MIN_SCALE, resolutionScale - STEP_DOWN);
      applyPixelRatio();
      cooldown = ADJUST_COOLDOWN_S;
      slowAccum = 0;
    } else if (slowAccum > 1.5 && !bloomSuppressed && getQualityProfile().bloom) {
      // Resolution has nothing left to give and we are still missing frames.
      // Longer fuse than a resolution step (1.5s vs 0.5s) so a brief spike
      // never costs the look.
      bloomSuppressed = true;
      cooldown = ADJUST_COOLDOWN_S;
      slowAccum = 0;
    }
  } else if (frameTimeEma < fastFrameMs) {
    fastAccum += dt;
    slowAccum = 0;
    // Three seconds of headroom → give it back. Bloom returns BEFORE
    // resolution: it is worth more per GPU millisecond than a sharper image.
    if (fastAccum > 3.0 && bloomSuppressed) {
      bloomSuppressed = false;
      cooldown = ADJUST_COOLDOWN_S;
      fastAccum = 0;
    } else if (fastAccum > 3.0 && resolutionScale < MAX_SCALE) {
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

// --- THERMAL GOVERNOR ---
//
// The scaler above is a FRAME RATE controller: it only ever reacts to frames
// that have already been missed. That leaves the case this governor exists for
// completely unhandled — a phone comfortably holding 60fps while steadily
// heating up. Nothing above notices, because nothing is going wrong yet, and by
// the time iOS throttles the GPU itself the player gets a cliff instead of a
// slope.
//
// There is no temperature to read. A webview gets no ProcessInfo.thermalState,
// no battery telemetry, nothing — so the honest move is to stop pretending we
// can measure heat and model its cause instead. Heat is the integral of GPU
// work over time, so the governor tracks duty cycle: rendering charges an
// accumulator, idling discharges it several times faster (the menu genuinely
// idles the GPU now that it no longer renders), and each threshold crossed
// drops the frame cap a rung.
//
// Deliberately slow. The first rung is ten minutes of continuous play, so a
// short session never sees it, and dropping 60 -> 45 is a far gentler failure
// than the stutter of an OS-level thermal throttle.
const THERMAL_RUNGS = [60, 45, 30];
/** Seconds of accumulated render time needed to reach each rung. */
const RUNG_THRESHOLDS_S = [0, 600, 1200];
/** Idling sheds load this many times faster than rendering builds it. */
const COOL_RATE = 2.5;
/** Step back up only well below the threshold, so a session hovering at the
 *  boundary does not oscillate between two frame rates. */
const RUNG_HYSTERESIS = 0.8;

let loadSeconds = 0;
let thermalRung = 0;

/**
 * Advance the duty-cycle model.
 *
 * @param dt        Frame delta in seconds.
 * @param rendering Whether this frame actually drew the 3D scene. Menus do not,
 *                  so they count as cooling; a paused run still paints the
 *                  arena behind its overlay, so it counts as load.
 */
export function updateThermalGovernor(dt: number, rendering: boolean): void {
  // Desktops are plugged in and fan-cooled; this is a battery-device problem.
  if (!isMobile) return;
  if (dt > 0.25) return; // tab switch / hitch: not real elapsed load

  const ceiling = RUNG_THRESHOLDS_S[RUNG_THRESHOLDS_S.length - 1] * 1.5;
  loadSeconds = rendering
    ? Math.min(loadSeconds + dt, ceiling)
    : Math.max(0, loadSeconds - dt * COOL_RATE);

  while (
    thermalRung < THERMAL_RUNGS.length - 1 &&
    loadSeconds >= RUNG_THRESHOLDS_S[thermalRung + 1]
  ) {
    thermalRung++;
  }
  while (thermalRung > 0 && loadSeconds < RUNG_THRESHOLDS_S[thermalRung] * RUNG_HYSTERESIS) {
    thermalRung--;
  }
}

/** Frame cap the governor currently wants, or 0 where it does not apply. */
export function getThermalFpsCap(): number {
  return isMobile ? THERMAL_RUNGS[thermalRung] : 0;
}

/**
 * Diagnostics for the on-screen FPS readout.
 *
 * `nextRungAtS` is the load figure that trips the next step down, or null once
 * the governor is on its bottom rung with nothing left to give — which is what
 * lets the overlay draw progress toward the next drop instead of an opaque
 * counter. The thresholds here are estimates until someone plays a long session
 * on a real phone, so being able to watch the accumulator climb is the point.
 */
export function getThermalState(): {
  rung: number;
  cap: number;
  loadSeconds: number;
  nextRungAtS: number | null;
} {
  const atFloor = thermalRung >= THERMAL_RUNGS.length - 1;
  return {
    rung: thermalRung,
    cap: THERMAL_RUNGS[thermalRung],
    loadSeconds: Math.round(loadSeconds),
    nextRungAtS: atFloor ? null : RUNG_THRESHOLDS_S[thermalRung + 1],
  };
}
