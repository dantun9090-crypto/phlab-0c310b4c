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

const SW_VERSION = 'phlabs-install-only-v2-nuke-2026-07-10';

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
    // Broadcast activation for [SW-DEBUG] client logger.
    try {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const c of clients) {
        c.postMessage({ type: 'sw-debug', event: 'activate', version: SW_VERSION, purgedCaches: purged, removedFallback, ts: Date.now() });
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
