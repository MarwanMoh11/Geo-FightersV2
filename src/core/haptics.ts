/**
 * Haptic feedback.
 *
 * Two backends, because the web one does not exist on the platform that cares
 * most. `navigator.vibrate` is unimplemented in Safari and in the WKWebView
 * the native shell runs in, so on iPhone — a device with a Taptic Engine and
 * players who expect to feel the game — every call here used to do nothing at
 * all. Native builds now go through Capacitor's Haptics plugin and web builds
 * keep the Vibration API for Android Chrome.
 *
 * Everything is fire-and-forget: the plugin calls are async, and a run loop
 * must never await a buzz.
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { getSettings } from './SettingsManager';

const native = Capacitor.isNativePlatform();

/**
 * Minimum spacing per channel, in ms.
 *
 * `hit` is the one that genuinely needs this: damage lands many times a second
 * in a heavy wave, and one impact per hit turns the phone into a continuous
 * rattle that reads as a fault rather than feedback. The others are gated by
 * how fast a human can tap or how often a chest opens, and are throttled only
 * to swallow double-fires.
 */
const MIN_GAP: Record<string, number> = {
  hit: 110,
  select: 40,
  levelUp: 300,
  reward: 150,
};

const lastFired: Record<string, number> = {};

function allowed(channel: string): boolean {
  if (!getSettings().haptics) return false;
  const now = performance.now();
  const gap = MIN_GAP[channel] ?? 50;
  if (now - (lastFired[channel] ?? -Infinity) < gap) return false;
  lastFired[channel] = now;
  return true;
}

/** Web fallback: Android Chrome and friends. */
function buzz(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Some browsers throw if called before a user gesture — ignore
    }
  }
}

function impact(style: ImpactStyle, webPattern: number | number[]) {
  if (native) {
    void Haptics.impact({ style }).catch(() => {
      /* haptics are decoration; never let one break a frame */
    });
  } else {
    buzz(webPattern);
  }
}

function notify(type: NotificationType, webPattern: number | number[]) {
  if (native) {
    void Haptics.notification({ type }).catch(() => {
      /* see above */
    });
  } else {
    buzz(webPattern);
  }
}

export const haptics = {
  /** Player took damage — sharp and frequent, so the tightest throttle. */
  hit: () => allowed('hit') && impact(ImpactStyle.Medium, 45),
  /** Level-up modal opened — the celebratory triple tap. */
  levelUp: () => allowed('levelUp') && notify(NotificationType.Success, [30, 40, 60]),
  /** Chest opened / reward — a single satisfying thunk. */
  reward: () => allowed('reward') && impact(ImpactStyle.Heavy, [20, 30, 20]),
  /** Menu / card selection — the light tick under a fingertip. */
  select: () => allowed('select') && impact(ImpactStyle.Light, 15),
};
