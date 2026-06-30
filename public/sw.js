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
//   * The `fetch` listener MUST NOT call event.respondWith() — every request
//     falls through to the network exactly as if no SW were installed.
//   * Activation purges any legacy Workbox / app-shell caches left behind
//     by previous versions so we never serve stale chunks.
//
// Result: the browser sees a controlling SW with a fetch handler (required
// for installability) but the SW intercepts nothing, so stale-cache blank
// pages are impossible.

const SW_VERSION = 'phlabs-install-only-v1';

function isAppShellCache(name) {
  return /^(phlabs-offline-|workbox-|precache-|runtime-)/i.test(name) || /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/i.test(name);
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
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
    // Intentionally NOT calling self.clients.claim() — claiming open tabs
    // fires `controllerchange` in every browser session right after publish,
    // which combined with any reload-on-controllerchange logic causes an
    // infinite refresh loop. The new SW will take control on the next
    // natural navigation, which is the safe default.
  })());
});

// Required for installability — but deliberately a no-op pass-through.
// Not calling event.respondWith() lets the browser handle the request
// natively, so this SW never serves cached or stale content.
self.addEventListener('fetch', () => {
  // pass-through
});

// Expose version for diagnostics via postMessage.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: SW_VERSION });
  }
});
