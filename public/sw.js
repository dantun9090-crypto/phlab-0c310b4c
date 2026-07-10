// PH Labs — self-unregistering service worker (kill switch).
//
// Previous versions of this SW ran an aggressive activate handler that
// called clients.claim() and then navigated every open tab. On slow
// networks / first install that produced a visible "nothing works" state
// even in incognito. This version does nothing but unregister itself and
// wipe any cache buckets it may have created in the past, so returning
// visitors converge on a clean, SW-free state.

const SW_VERSION = 'phlabs-killswitch-2026-07-10b';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((k) => caches.delete(k)));
    } catch (_) { /* ignore */ }
    try {
      await self.registration.unregister();
    } catch (_) { /* ignore */ }
  })());
});

// No fetch handler on purpose. Without a fetch handler the browser goes
// straight to the network for every request — no SW interception, no
// stale cache, no forced navigation.

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: SW_VERSION });
  }
});
