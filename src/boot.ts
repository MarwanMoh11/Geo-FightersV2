/**
 * Boot gate — the real entry point (index.html loads this, not main.ts).
 *
 * Portal builds must settle three things BEFORE any game module evaluates:
 * sitelock (a stolen build never starts), SDK init (loadingStart covers the
 * real loading phase), and cloud-save hydration (game modules read
 * localStorage at import time, so the portal profile has to land first).
 * Outside portals bootPortal resolves immediately and this is a zero-cost
 * indirection. style.css is imported here too so the loading screen is
 * styled while the app chunk downloads.
 */
import './style.css';
import { bootPortal } from './core/portal';

bootPortal().then((allowed) => {
  if (allowed) void import('./main');
});
