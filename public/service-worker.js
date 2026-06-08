// PH Labs — legacy service worker kill switch
// Mirrors /sw.js so old registrations on either path clear the app-shell cache
// and unregister themselves instead of serving stale offline content.

const CACHE_PREFIXES = ['phlabs-offline-', 'phlabs-', 'workbox-', 'precache-', 'runtime-'];

function isAppShellCache(name) {
  if (name.startsWith('phlabs-lkg-')) return false;
  return CACHE_PREFIXES.some((prefix) => name.startsWith(prefix)) ||
    /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(name);
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.allSettled(
        keys
          .filter(isAppShellCache)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: 'window' });
      await Promise.allSettled(clients.map((client) => client.navigate(client.url)));
    } finally {
      await self.registration.unregister();
    }
  })());
});

self.addEventListener('fetch', (event) => {
  return;
});