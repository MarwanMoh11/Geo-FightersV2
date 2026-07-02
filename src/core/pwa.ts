/**
 * PWA glue: registers the service worker and brokers the install prompt so the
 * UI can offer an "Install" button at the right moment.
 */
import { uiState } from './UIState.svelte.ts';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;

/** Are we running as an installed/standalone app? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    // iOS Safari
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/** Trigger the native install prompt (no-op if unavailable). */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const evt = deferredPrompt;
  deferredPrompt = null;
  uiState.canInstall = false;
  await evt.prompt();
  const choice = await evt.userChoice;
  return choice.outcome === 'accepted';
}

/** Tell a waiting service worker to activate, then reload to the new build. */
export function applyUpdate() {
  if (waitingWorker) {
    waitingWorker.postMessage('SKIP_WAITING');
  } else {
    window.location.reload();
  }
}

/** True when the game runs inside an iframe (e.g. embedded on a game portal). */
function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin parent → definitely embedded
  }
}

export function initPWA() {
  if (typeof window === 'undefined') return;

  // Portals embed the game in a cross-origin iframe where install prompts
  // never fire and a service worker would fight the portal's own caching —
  // skip the whole PWA layer there.
  if (isEmbedded()) return;

  uiState.isStandalone = isStandalone();

  window.addEventListener('beforeinstallprompt', (e) => {
    // Stop Chrome's mini-infobar; we surface our own button instead.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    uiState.canInstall = !uiState.isStandalone;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    uiState.canInstall = false;
    uiState.isStandalone = true;
  });

  // Keep standalone flag fresh if the display mode changes at runtime.
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', (e) => {
    uiState.isStandalone = e.matches;
    if (e.matches) uiState.canInstall = false;
  });

  // Register the service worker (production only — avoids caching the dev server).
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`)
        .then((reg) => {
          // A new worker is installing while the page is already controlled → update available.
          reg.addEventListener('updatefound', () => {
            const sw = reg.installing;
            if (!sw) return;
            sw.addEventListener('statechange', () => {
              if (sw.state === 'installed' && navigator.serviceWorker.controller) {
                waitingWorker = reg.waiting;
                uiState.needsRefresh = true;
              }
            });
          });
        })
        .catch(() => {
          /* registration is best-effort */
        });

      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    });
  }
}
