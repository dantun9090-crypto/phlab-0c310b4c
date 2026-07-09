// PH Labs — legacy service worker kill switch.
//
// Old visitors may still have /service-worker.js registered from a previous
// build. This version does ONE thing safely: clears any old caches and
// unregisters itself. It MUST NOT call client.navigate() or claim clients,
// because doing so forces every open tab to reload on activation — that is
// exactly what caused the "site keeps refreshing after every publish" loop.

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE_AND_RELOAD') {
    event.waitUntil((async () => {
      try {
        const keys = await caches.keys();
        await Promise.allSettled(keys.filter(isAppShellCache).map((key) => caches.delete(key)));
      } catch (_) { /* ignore */ }
    })());
  }
});

function isAppShellCache(name) {
  return /^(phlabs-offline-|workbox-|precache-|runtime-)/i.test(name) || /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/i.test(name);
}

self.addEventListener('install', (event) => {
  // Take over the waiting slot immediately so we can unregister on next load.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.allSettled(keys.filter(isAppShellCache).map((key) => caches.delete(key)));
    } catch (_) { /* ignore */ }
    // DO NOT call self.clients.claim() and DO NOT navigate clients here.
    // Either one forces every open tab to reload, which produces an
    // infinite refresh loop after each publish.
    try {
      await self.registration.unregister();
    } catch (_) { /* ignore */ }
  })());
});

// Pure pass-through. Never call event.respondWith().
self.addEventListener('fetch', () => {
  // no-op
});
