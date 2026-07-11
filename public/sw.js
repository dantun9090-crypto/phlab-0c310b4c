// PH Labs — Service Worker kill switch.
//
// This project no longer uses a runtime Service Worker. Old visitors may still
// have /sw.js installed, so this file activates immediately, clears PH Labs /
// Workbox cache buckets, unregisters itself, and deliberately does NOT handle
// fetch events or call clients.claim().

const SW_VERSION = 'phlabs-kill-switch-v2';

function isAppShellCache(name) {
  return /^(phlabs-offline-|workbox-|precache-|runtime-)/i.test(name) || /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/i.test(name);
}

// Defensive purge: scan every Cache Storage bucket for any entry whose body
// contains the "PH Labs is refreshing" fallback marker and delete it. Belt-
// and-braces safety net — this SW never writes HTML, but other origins/tools
// (Workbox leftovers, extensions) might have, and we must never serve the
// fallback from cache to a returning visitor.
async function purgeFallbackEntries() {
  const removed = [];
  try {
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      let cache;
      try { cache = await caches.open(name); } catch { continue; }
      let requests = [];
      try { requests = await cache.keys(); } catch { continue; }
      for (const req of requests) {
        try {
          const res = await cache.match(req);
          if (!res) continue;
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          if (!ct.includes('text/html') && !ct.includes('text/plain') && ct !== '') continue;
          const body = await res.clone().text();
          if (body.includes('PH Labs is refreshing')) {
            await cache.delete(req);
            removed.push(name + ' :: ' + req.url);
          }
        } catch { /* skip entry */ }
      }
    }
  } catch { /* ignore */ }
  return removed;
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && (event.data.type === 'CLEAR_CACHE_AND_RELOAD' || event.data.type === 'PHL_NUKE_ALL_CACHES')) {
    event.waitUntil((async () => {
      try {
        const keys = await caches.keys();
        // Nuke ALL caches — the client explicitly asked. Fallback-page recovery
        // path must not leave any stale HTML behind, and this SW owns no
        // long-lived cache of its own.
        await Promise.allSettled(keys.map((key) => caches.delete(key)));
      } catch (_) { /* ignore */ }
      try {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clients) {
          client.postMessage({ type: 'PHL_CACHE_CLEARED', version: SW_VERSION, ts: Date.now() });
        }
      } catch (_) { /* ignore */ }
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
    // Defensive: scan remaining caches and evict any cached fallback HTML.
    const removedFallback = await purgeFallbackEntries();
    // Broadcast activation for diagnostics only. Do not claim or navigate
    // clients: either can create refresh loops for returning visitors.
    try {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const c of clients) {
        c.postMessage({ type: 'sw-debug', event: 'activate', version: SW_VERSION, purgedCaches: purged, removedFallback, ts: Date.now() });
      }
    } catch (_) { /* ignore */ }
    try { await self.registration.unregister(); } catch (_) { /* ignore */ }
  })());
});

// Expose version for diagnostics via postMessage.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: SW_VERSION });
  }
});
