/**
 * Portal SDK glue (CrazyGames SDK v3).
 *
 * Web game portals require SDK hooks so they can track loading, insert ads at
 * natural break points, and celebrate wins. Everything in this module is a
 * safe no-op outside a portal embed, so local/self-hosted builds behave
 * exactly as before.
 *
 * Detection: the SDK is only injected when the game is served from (or framed
 * by) a CrazyGames domain, or when `?portal=crazygames` is passed — the latter
 * makes local QA testing possible.
 */
import { onStateChange } from './GameState';
import { uiState } from './UIState.svelte.ts';
import { muteForBackground, unmuteFromBackground } from './audio';

interface CrazyGamesSDK {
  init: () => Promise<void>;
  game: {
    loadingStart: () => void;
    loadingStop: () => void;
    gameplayStart: () => void;
    gameplayStop: () => void;
    happytime: () => void;
  };
  ad: {
    requestAd: (
      type: 'midgame' | 'rewarded',
      callbacks: {
        adStarted?: () => void;
        adFinished?: () => void;
        adError?: (error: unknown) => void;
      },
    ) => void;
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK: CrazyGamesSDK };
  }
}

let sdk: CrazyGamesSDK | null = null;
let initPromise: Promise<void> | null = null;

function isCrazyGamesEnvironment(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('portal') === 'crazygames') return true;
    const origins = [window.location.hostname, document.referrer];
    const ancestors = window.location.ancestorOrigins;
    if (ancestors) origins.push(...Array.from(ancestors));
    return origins.some((o) => /crazygames|1001juegos/i.test(o || ''));
  } catch {
    return false;
  }
}

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
 * Kick off SDK detection + init. Call as early as possible (before asset
 * preload) so `loadingStart` covers the real loading phase.
 */
export function initPortal(): void {
  if (initPromise || !isCrazyGamesEnvironment()) return;

  initPromise = (async () => {
    await loadSdkScript();
    const candidate = window.CrazyGames?.SDK;
    if (!candidate) throw new Error('CrazyGames SDK missing after script load');
    await candidate.init();
    sdk = candidate;
    sdk.game.loadingStart();
    wireGameplayEvents();
  })().catch((e) => {
    console.warn('[Portal] SDK init failed, continuing without portal features:', e);
    sdk = null;
  });
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

/** Map game state transitions onto the portal's gameplay/ad lifecycle. */
function wireGameplayEvents(): void {
  onStateChange((newState, oldState) => {
    if (!sdk) return;
    try {
      if (newState === 'PLAYING') {
        sdk.game.gameplayStart();
      } else if (oldState === 'PLAYING') {
        sdk.game.gameplayStop();
      }

      // End of a run is the natural break point for a midroll ad. Victories
      // additionally trigger the portal's celebration effect.
      if (newState === 'GAME_OVER') {
        if (uiState.isVictory) sdk.game.happytime();
        requestMidgameAd();
      }
    } catch (e) {
      console.warn('[Portal] gameplay event failed:', e);
    }
  });
}

/** Show a midroll ad, muting the game while it plays. Safe no-op without SDK. */
export function requestMidgameAd(onDone?: () => void): void {
  if (!sdk) {
    onDone?.();
    return;
  }
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
