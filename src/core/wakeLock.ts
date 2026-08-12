/**
 * Keeps the display on while a run is in progress.
 *
 * A run is mostly a held drag with long stretches of no new touches, which is
 * exactly the input pattern iOS reads as "idle" — the screen dims and then
 * locks mid-wave, killing the run. Held only while PLAYING so menus and pause
 * still let the phone sleep normally and the battery is not hostage to a
 * forgotten tab.
 *
 * Screen Wake Lock landed in WebKit in iOS 16.4; on anything older every call
 * here is a harmless no-op and the pre-existing behaviour stands.
 */
import { getGameState, onStateChange } from './GameState';

type Sentinel = { released: boolean; release: () => Promise<void> };

let sentinel: Sentinel | null = null;

function supported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

async function acquire(): Promise<void> {
  if (!supported() || sentinel) return;
  try {
    sentinel = (await (
      navigator as unknown as { wakeLock: { request: (t: string) => Promise<Sentinel> } }
    ).wakeLock.request('screen')) as Sentinel;
  } catch {
    // Rejects when the tab is backgrounded or the battery saver forbids it.
    // Nothing to do: the visibilitychange handler retries on the way back.
    sentinel = null;
  }
}

async function release(): Promise<void> {
  const held = sentinel;
  sentinel = null;
  if (!held || held.released) return;
  try {
    await held.release();
  } catch {
    /* already gone */
  }
}

export function initWakeLock(): void {
  if (!supported()) return;

  onStateChange((next) => {
    if (next === 'PLAYING') void acquire();
    else void release();
  });

  // The browser drops the lock whenever the page is hidden — a notification
  // shade, a call, an app switch — and does NOT restore it on return. Without
  // this the guarantee silently expires the first time the player looks away.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && getGameState() === 'PLAYING') {
      void acquire();
    }
  });
}
