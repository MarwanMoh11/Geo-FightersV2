/* GeoFighters service worker — app-shell + runtime caching for offline play.
 *
 * CACHE_VERSION is stamped by the build (see the stamp-sw plugin in
 * vite.config.ts, which rewrites __BUILD_ID__ in dist/sw.js). It used to be a
 * hand-maintained constant, which meant it never actually changed: the
 * activate handler only deletes caches whose NAME differs, so RUNTIME_CACHE
 * survived every deploy. Two consequences, both real:
 *
 *   1. The runtime cache grew without bound. Each deploy adds a new set of
 *      content-hashed chunks and the superseded ones were never evicted —
 *      megabytes per deploy, accumulating on the player's device until the
 *      browser evicted the whole origin under storage pressure.
 *   2. Stable-URL assets went stale. Hashed JS/CSS is safe (a new build means
 *      a new URL, so a cache miss), but everything served at a fixed path —
 *      /textures/**, /icons/**, manifest — is stale-while-revalidate. Change
 *      one and the next visit still paints the OLD file, updating only the
 *      visit after that. That is a genuinely confusing bug to chase while
 *      iterating, because the code is right and the screen disagrees.
 *
 * A per-build id fixes both: old caches are purged on activate, and the first
 * request for a stable-URL asset after a deploy is a miss that goes to network.
 *
 * The literal below is the DEV fallback — unstamped, it just means the dev
 * server reuses one namespace, which is what you want while iterating.
 */
const CACHE_VERSION = 'geofighters-__BUILD_ID__';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Minimal app shell — hashed JS/CSS are picked up at runtime (stale-while-revalidate).
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/favicon-32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Let the page trigger an immediate update.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Same-origin only. Fonts used to be an exception here, back when they came
// from fonts.googleapis.com / fonts.gstatic.com; they are bundled now, so they
// arrive on our own origin and need no special case.
function isCacheableAsset(url) {
  return url.origin === self.location.origin;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept websocket / socket.io traffic.
  if (url.pathname.startsWith('/socket.io')) return;

  // Navigation requests: network-first, fall back to cached shell (offline).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    );
    return;
  }

  if (!isCacheableAsset(url)) return;

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.open(RUNTIME_CACHE).then((cache) =>
      cache.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response && response.status === 200 && response.type !== 'opaque') {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    ),
  );
});
