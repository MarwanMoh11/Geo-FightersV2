/**
 * Debug mode gate. Enable with `?debug` in the URL.
 * All developer-only logging, keybinds, and overlays must check this flag
 * so production builds stay clean.
 */
export const DEBUG =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

export const TEST_MODE =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test');

/** Log only when debug mode is active. */
export function dlog(...args: unknown[]) {
  if (DEBUG) console.log(...args);
}

/** Warn only when debug mode is active. */
export function dwarn(...args: unknown[]) {
  if (DEBUG) console.warn(...args);
}
