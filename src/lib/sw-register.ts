// PH Labs service-worker cleanup.
//
// Returning customers were repeatedly stranded on stale HTML / old hashed JS
// after deploys. The safest fix is to stop registering any Service Worker at
// all and to clean up every old PH Labs SW/cache bucket on each boot. The
// exported function name is kept for compatibility with existing imports.

async function unregisterServiceWorkersAndCaches() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs.filter((r) => /\/(?:sw|service-worker)\.js(?:$|[?#])/i.test(r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || '')).map(async (r) => {
        try { console.info('SW unregistered:', r.scope); } catch (_) {}
        try { await r.unregister(); } catch (_) {}
      })
    );
  } catch (_) {}

  try {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => /^(phlabs-offline-|workbox-|precache-|runtime-)/i.test(name) || /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/i.test(name)).map(async (name) => {
          try { await caches.delete(name); } catch (_) {}
        })
      );
    }
  } catch (_) {}
}

export function registerOfflineSW() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  if (document.readyState === 'complete') {
    setTimeout(() => { void unregisterServiceWorkersAndCaches(); }, 0);
  } else {
    window.addEventListener('load', () => setTimeout(() => { void unregisterServiceWorkersAndCaches(); }, 0), { once: true });
  }
}

registerOfflineSW();
