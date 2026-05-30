/**
 * Service worker for Receipt Intelligence AI.
 *
 * Cache strategy per Plan §2.4 + kickoff non-negotiable:
 *
 *   - /_next/static/*  → cache-first (Next fingerprints these; safe to keep)
 *   - /icons/*         → cache-first (PWA icons; static per deploy)
 *   - /apple-icon-*    → cache-first (same — Next-generated)
 *   - /icon-*          → cache-first (favicon variants)
 *   - /api/*           → NETWORK-ONLY, never cached. Fresh data matters
 *                        (kickoff non-negotiable). A stale Scan response
 *                        could lie about extraction status; a stale
 *                        comparison could show an old, since-invalidated
 *                        price.
 *   - Everything else  → pass through to network (HTML navigations always
 *                        hit the server so server-rendered auth state is
 *                        correct).
 *
 * Cache version is part of the cache name — bumping CACHE_NAME on a deploy
 * invalidates stale caches automatically via the `activate` cleanup.
 */

const CACHE_NAME = 'receipt-intelligence-shell-v1';

self.addEventListener('install', (event) => {
  // Activate immediately on next page load — don't wait for tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Purge stale shell caches from previous deploys.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('receipt-intelligence-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Don't touch cross-origin requests (fonts.googleapis.com, etc.) — let
  // the browser handle them. Caching them is risky and not needed for
  // installability.
  if (url.origin !== self.location.origin) return;

  // /api/* — NEVER CACHE. Kickoff non-negotiable. Pass straight to network.
  if (url.pathname.startsWith('/api/')) {
    return; // Default browser fetch handling — no caching, no interception.
  }

  // Static-asset routes — cache-first with background revalidation.
  const isStatic =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/icon-') ||
    url.pathname.startsWith('/apple-icon') ||
    url.pathname === '/manifest.webmanifest';

  if (isStatic && event.request.method === 'GET') {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Everything else (HTML navigations, scan-image fetches, etc.) — network
  // pass-through. No caching of authenticated HTML.
});

/**
 * Cache-first: serve cached response if any, else fetch + cache the
 * response for next time. Failures fall through to the browser's normal
 * error path (we don't synthesize an "offline" fallback because the app
 * doesn't have a meaningful offline mode in MVP).
 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      // Clone before storing — Response bodies are single-use.
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Network failed and we don't have a cache hit. Re-throw so the
    // browser surfaces its native error UI.
    throw err;
  }
}
