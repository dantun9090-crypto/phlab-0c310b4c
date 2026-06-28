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
    try {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((key) => caches.delete(key)));
    } catch (_) {
      /* ignore */
    }
    try {
      await self.clients.claim();
    } catch (_) {
      /* ignore */
    }
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
