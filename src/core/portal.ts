/**
 * Portal SDK glue (CrazyGames SDK v3) + portal-grade production hardening.
 *
 * Web game portals require SDK hooks so they can track loading, insert ads at
 * natural break points, celebrate wins, and sync saves across devices.
 * Everything in this module is a safe no-op outside a portal embed, so
 * local/self-hosted builds behave exactly as before.
 *
 * Boot contract: index.html loads src/boot.ts, which awaits `bootPortal()`
 * BEFORE importing the app. That ordering matters twice over:
 *   1. SITELOCK — a stolen build on a non-whitelisted host never starts.
 *   2. CLOUD SAVES — the SDK data module is hydrated into localStorage before
 *      any game module does its module-load localStorage reads, so a player
 *      switching devices on the portal resumes their real profile.
 *
 * Detection: the SDK is only injected when the game is served from (or framed
 * by) a CrazyGames domain, or when `?portal=crazygames` is passed — the latter
 * makes local QA testing possible (the SDK runs in its 'local' environment).
 */
import { onStateChange } from './GameState';
import { uiState } from './UIState.svelte.ts';
import { muteForBackground, unmuteFromBackground, setPortalMute } from './audio';

interface AdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}

interface CrazyGamesSDK {
  init: () => Promise<void>;
  game: {
    loadingStart: () => void;
    loadingStop: () => void;
    gameplayStart: () => void;
    gameplayStop: () => void;
    happytime: () => void;
    settings?: { muteAudio?: boolean; disableChat?: boolean };
    addSettingsChangeListener?: (
      cb: (s: { muteAudio?: boolean; disableChat?: boolean }) => void,
    ) => void;
  };
  ad: {
    requestAd: (type: 'midgame' | 'rewarded', callbacks: AdCallbacks) => void;
    hasAdblock?: () => Promise<boolean>;
  };
  data?: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
    clear: () => void;
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK: CrazyGamesSDK };
  }
}

let sdk: CrazyGamesSDK | null = null;
let initPromise: Promise<void> | null = null;
let adblocked = false;

// --- ENVIRONMENT DETECTION ---

function originsInPlay(): string[] {
  const origins = [window.location.hostname, document.referrer];
  try {
    const ancestors = window.location.ancestorOrigins;
    if (ancestors) origins.push(...Array.from(ancestors));
  } catch {
    /* cross-origin access can throw in exotic embeds */
  }
  return origins;
}

function isCrazyGamesEnvironment(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('portal') === 'crazygames') return true;
    return originsInPlay().some((o) => /crazygames|1001juegos/i.test(o || ''));
  } catch {
    return false;
  }
}

/** True when running framed by any portal (or forced) — used to skip PWA/SW. */
export function isPortalEmbed(): boolean {
  try {
    return isCrazyGamesEnvironment() || window.self !== window.top;
  } catch {
    return true; // cross-origin frame access threw → we ARE framed
  }
}

// --- SITELOCK ---
// Portals require it (stops thieves rehosting the build on shady arcades) but
// it must never brick legitimate hosts: local dev, our own deploys, and every
// portal family we submit to. Matching ANY origin in play (own host, referrer,
// or frame ancestors) passes — portal CDNs serve the files from their own
// domains while framed by the portal page.
const SITELOCK_ALLOW =
  /^(localhost|127\.|10\.|192\.168\.|0\.0\.0\.0)|crazygames|1001juegos|jeuxjeuxjeux|speelspelletjes|1001hry|1001pelit|1001spiele|1001giochi|1001jogos|poki(?:-gdn)?\.|gamedistribution|itch\.(io|zone)|hwcdn\.net|netlify\.app|onrender\.com|github\.io|vercel\.app|hf\.space/i;

function sitelockPasses(): boolean {
  try {
    const host = window.location.hostname;
    if (!host || window.location.protocol === 'file:') return true; // local file QA
    return originsInPlay().some((o) => SITELOCK_ALLOW.test(o || ''));
  } catch {
    return true; // never let a detection error brick real players
  }
}

function showSitelockScreen(): void {
  document.body.innerHTML =
    '<div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;gap:12px;background:#040410;color:#36e6ff;' +
    'font-family:monospace;text-align:center;padding:24px">' +
    '<div style="font-size:1.4rem;font-weight:800;letter-spacing:.1em">GEOFIGHTERS</div>' +
    '<div style="color:#8892b0;font-size:.8rem;max-width:420px">This copy is not authorized ' +
    'to run on this site.<br/>Play GeoFighters for free on <b style="color:#fff">crazygames.com</b></div>' +
    '</div>';
}

// --- CLOUD SAVES (CrazyGames data module) ---
// The whole profile (every `geo_*` localStorage key) is mirrored into ONE
// SDK.data blob. Hydration happens during boot (before any module-load
// localStorage read); mirroring happens at run boundaries + tab-hide. A
// timestamp decides conflicts, so the newest device wins.
const SAVE_BLOB_KEY = 'geofighters_save_v1';
const SAVE_META_KEY = 'geo_save_synced_at';
/** Device-specific keys that must never travel between machines. */
const SYNC_EXCLUDE = new Set(['geo_server_url', SAVE_META_KEY]);

function hydrateSavesFromPortal(): void {
  if (!sdk?.data) return;
  try {
    const raw = sdk.data.getItem(SAVE_BLOB_KEY);
    if (!raw) return;
    const blob = JSON.parse(raw) as { savedAt: number; data: Record<string, string> };
    if (!blob || typeof blob.savedAt !== 'number' || !blob.data) return;
    const localAt = Number(localStorage.getItem(SAVE_META_KEY) || '0');
    if (blob.savedAt <= localAt) return; // local profile is same or newer
    for (const [key, value] of Object.entries(blob.data)) {
      if (key.startsWith('geo_') && !SYNC_EXCLUDE.has(key)) localStorage.setItem(key, value);
    }
    localStorage.setItem(SAVE_META_KEY, String(blob.savedAt));
  } catch {
    /* corrupt blob / storage unavailable — play on with local saves */
  }
}

function mirrorSavesToPortal(): void {
  if (!sdk?.data) return;
  try {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('geo_') || SYNC_EXCLUDE.has(key)) continue;
      const value = localStorage.getItem(key);
      if (value !== null) data[key] = value;
    }
    const savedAt = Date.now();
    sdk.data.setItem(SAVE_BLOB_KEY, JSON.stringify({ savedAt, data }));
    localStorage.setItem(SAVE_META_KEY, String(savedAt));
  } catch {
    /* best-effort */
  }
}

// --- BOOT ---

function loadSdkScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('CrazyGames SDK failed to load'));
    document.head.appendChild(script);
  });
}

/**
 * Portal-aware boot gate. Resolves `true` when the app may start (with the
 * SDK initialized and saves hydrated when on a portal), `false` when the
 * sitelock rejected the host. A hung SDK never blocks the game: init races a
 * timeout and the app starts without portal features.
 */
export function bootPortal(): Promise<boolean> {
  if (!sitelockPasses()) {
    showSitelockScreen();
    return Promise.resolve(false);
  }
  if (!isCrazyGamesEnvironment()) return Promise.resolve(true);

  initPromise = (async () => {
    await loadSdkScript();
    const candidate = window.CrazyGames?.SDK;
    if (!candidate) throw new Error('CrazyGames SDK missing after script load');
    await candidate.init();
    sdk = candidate;
    sdk.game.loadingStart();
    hydrateSavesFromPortal();
    wireGameplayEvents();
    wirePortalSettings();
    void sdk.ad
      .hasAdblock?.()
      .then((blocked) => (adblocked = !!blocked))
      .catch(() => {});
  })().catch((e) => {
    console.warn('[Portal] SDK init failed, continuing without portal features:', e);
    sdk = null;
  });

  // 6s ceiling: a slow portal SDK must never keep players staring at a
  // dead loading screen.
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 6000));
  return Promise.race([initPromise, timeout]).then(() => true);
}

/** Signal that loading finished (hides the portal's own loading overlay). */
export async function portalLoadingFinished(): Promise<void> {
  if (!initPromise) return;
  await initPromise;
  try {
    sdk?.game.loadingStop();
  } catch {
    /* best-effort */
  }
}

/** Map game state transitions onto the portal's gameplay/save lifecycle. */
function wireGameplayEvents(): void {
  onStateChange((newState, oldState) => {
    if (!sdk) return;
    try {
      if (newState === 'PLAYING') {
        sdk.game.gameplayStart();
      } else if (oldState === 'PLAYING') {
        sdk.game.gameplayStop();
      }

      if (newState === 'GAME_OVER') {
        // Victories get the portal's celebration effect. NOTE: the midgame ad
        // is NOT requested here — the game-over screen offers a rewarded
        // SECOND CHANCE first; the interstitial runs when the player taps
        // through (see GameOverModal), so the two never collide.
        if (uiState.isVictory) sdk.game.happytime();
        mirrorSavesToPortal();
      } else if (oldState === 'PLAYING') {
        mirrorSavesToPortal(); // pause/menu exits checkpoint the profile too
      }
    } catch (e) {
      console.warn('[Portal] gameplay event failed:', e);
    }
  });

  // Tab hidden = last reliable moment to checkpoint on mobile.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) mirrorSavesToPortal();
  });
}

/** Honor portal-level settings (their mute toggle must beat in-game audio). */
function wirePortalSettings(): void {
  if (!sdk) return;
  const apply = (s?: { muteAudio?: boolean }) => setPortalMute(!!s?.muteAudio);
  try {
    apply(sdk.game.settings);
    sdk.game.addSettingsChangeListener?.(apply);
  } catch {
    /* settings API absent in this SDK build — nothing to honor */
  }
}

// --- ADS ---

// Portal ad guidance (see LAUNCH_PLAN Phase 5): interstitials only between
// runs, frequency-capped >=3 min apart. A player who dies repeatedly in
// quick succession (a rough early run, or just testing) must not get an ad
// on every single reboot tap — that's the "ad, then instantly another ad"
// spam the cap exists to prevent. Rewarded ads are exempt: the player
// explicitly opts in for a reward, so there's nothing to cap.
const MIDGAME_AD_COOLDOWN_MS = 3 * 60 * 1000;
let lastMidgameAdAt = 0;

/** Show a midroll ad, muting the game while it plays. Safe no-op without SDK. */
export function requestMidgameAd(onDone?: () => void): void {
  if (!sdk || Date.now() - lastMidgameAdAt < MIDGAME_AD_COOLDOWN_MS) {
    onDone?.();
    return;
  }
  lastMidgameAdAt = Date.now();
  const finish = () => {
    unmuteFromBackground();
    onDone?.();
  };
  try {
    sdk.ad.requestAd('midgame', {
      adStarted: () => muteForBackground(),
      adFinished: finish,
      adError: finish,
    });
  } catch (e) {
    console.warn('[Portal] midgame ad request failed:', e);
    finish();
  }
}

/**
 * Whether a rewarded ad can plausibly be offered (portal present, no
 * adblock). Used to hide reward buttons instead of showing ones that fail.
 */
export function isRewardedAvailable(): boolean {
  return !!sdk && !adblocked;
}

/**
 * Request a rewarded ad. `onReward` fires ONLY after the ad completed
 * (portal rule: never reward on adError); `onFail` fires on error so the
 * caller can fall back gracefully.
 */
export function requestRewardedAd(onReward: () => void, onFail?: () => void): void {
  if (!sdk) {
    onFail?.();
    return;
  }
  try {
    sdk.ad.requestAd('rewarded', {
      adStarted: () => muteForBackground(),
      adFinished: () => {
        unmuteFromBackground();
        onReward();
      },
      adError: () => {
        unmuteFromBackground();
        onFail?.();
      },
    });
  } catch (e) {
    console.warn('[Portal] rewarded ad request failed:', e);
    onFail?.();
  }
}
