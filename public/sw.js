// PH Labs — install-only service worker.
//
// Purpose: satisfy Chromium's PWA installability heuristic so the
// `beforeinstallprompt` event fires and the in-page Install button on
// /install can prompt the native install dialog on Android Chrome / Edge /
// Brave and desktop Chromium.
//
// Hard rules (do NOT break — see .lovable/memory/ssr-blank-page-fix.md and
// the chunk-reload safety net):
//   * NO precache, NO runtime cache, NO Cache Storage writes.
//   * The `fetch` listener may only handle HTML navigations as network-first
//     with an offline fallback. It must never serve cached HTML.
//   * Activation purges any legacy Workbox / app-shell caches left behind
//     by previous versions so we never serve stale chunks.
//
// Result: the browser sees a controlling SW with a fetch handler (required
// for installability), but navigations are always network-first and never
// served from HTML cache, so stale-cache blank pages are avoided.

const SW_VERSION = 'phlabs-install-only-v1';

function isAppShellCache(name) {
  return /^(phlabs-offline-|workbox-|precache-|runtime-)/i.test(name) || /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/i.test(name);
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE_AND_RELOAD') {
    event.waitUntil((async () => {
      try {
        const keys = await caches.keys();
        await Promise.allSettled(keys.filter(isAppShellCache).map((key) => caches.delete(key)));
      } catch (_) {
        /* ignore */
      }
      try {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clients) {
          client.postMessage({ type: 'PHL_CACHE_CLEARED', version: SW_VERSION, ts: Date.now() });
        }
      } catch (_) {
        /* ignore */
      }
    })());
  }
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const purged = [];
    try {
      const keys = await caches.keys();
      const toPurge = keys.filter(isAppShellCache);
      await Promise.allSettled(toPurge.map((key) => caches.delete(key)));
      purged.push(...toPurge);
    } catch (_) {
      /* ignore */
    }
    // Broadcast activation for [SW-DEBUG] client logger.
    try {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const c of clients) {
        c.postMessage({ type: 'sw-debug', event: 'activate', version: SW_VERSION, purgedCaches: purged, ts: Date.now() });
      }
    } catch (_) { /* ignore */ }
    await self.clients.claim();
  })());
});

// Network-first for HTML navigations only. We do not cache HTML here; the
// browser either receives the live network response or the static offline page.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request || request.method !== 'GET') return;
  const accept = request.headers.get('accept') || '';
  const isHtmlNavigation = request.mode === 'navigate' || accept.includes('text/html');
  if (!isHtmlNavigation) return;

  event.respondWith(
    fetch(request, { cache: 'no-store' }).catch(async () => {
      const cachedOffline = await caches.match('/offline.html');
      if (cachedOffline) return cachedOffline;
      return fetch('/offline.html', { cache: 'no-store' }).catch(() => new Response('Offline', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }));
    }),
  );
});

// Expose version for diagnostics via postMessage.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: SW_VERSION });
  }
});
