// PH Labs — offline fallback service worker
// Strategy: network-first for navigations; on failure, serve /offline.html
// from the cache. Static assets are NOT precached here — Cloudflare + the
// browser's HTTP cache handle that already.

importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

const CACHE = 'phlabs-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop old PH Labs offline caches from prior versions
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('phlabs-offline-') && k !== CACHE).map((k) => caches.delete(k))
    );
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate') return;

  event.respondWith((async () => {
    try {
      const preload = await event.preloadResponse;
      if (preload) return preload;
      return await fetch(req);
    } catch (_err) {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(OFFLINE_URL);
      return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
