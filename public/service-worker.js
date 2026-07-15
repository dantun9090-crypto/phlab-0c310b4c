// PH Labs — legacy service worker kill switch.
//
// Old visitors may still have /service-worker.js registered from a previous
// build. This version does ONE thing safely: clears any old caches and
// unregisters itself. This file is a same-path replacement for old visitors;
// after activation it refreshes controlled windows once and then disappears.

const BUILD_ID = 'phlabs-legacy-kill-switch-v4';

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
  return /^(phlabs-|php_|workbox-|precache-|runtime-)/i.test(name) || /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/i.test(name);
}

function isStaleAppShellCache(name) {
  return isAppShellCache(name) && !name.includes(BUILD_ID);
}

self.addEventListener('install', (event) => {
  // Take over the waiting slot immediately so we can unregister on next load.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.allSettled(keys.filter(isStaleAppShellCache).map((key) => caches.delete(key)));
    } catch (_) { /* ignore */ }
    try {
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await Promise.allSettled(clients.map((client) => client.navigate(client.url)));
    } catch (_) { /* ignore */ }
    try {
      await self.registration.unregister();
    } catch (_) { /* ignore */ }
  })());
});

// Pure pass-through. Never call event.respondWith().
self.addEventListener('fetch', () => {
  // no-op
});
