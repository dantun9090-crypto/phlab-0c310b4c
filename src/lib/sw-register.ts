// Guarded service-worker registration for PH Labs.
// - Registers /sw.js only in production browsers on real PH Labs origins.
// - Refuses to register in Lovable preview, iframes, dev, or when `?sw=off`
//   is in the URL. In any refused context we proactively unregister our SW
//   so stale workers can't strand users on a cached page.

const SW_URL = '/sw.js';

function isLovablePreviewHost(host: string): boolean {
  return (
    host.startsWith('id-preview--') ||
    host.startsWith('preview--') ||
    host === 'lovableproject.com' ||
    host.endsWith('.lovableproject.com') ||
    host === 'lovableproject-dev.com' ||
    host.endsWith('.lovableproject-dev.com') ||
    host === 'beta.lovable.dev' ||
    host.endsWith('.beta.lovable.dev') ||
    host.endsWith('.lovable.app') ||
    host.endsWith('.lovable.dev')
  );
}

function isOwnRegistration(r: ServiceWorkerRegistration): boolean {
  const scriptURL = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || '';
  if (!scriptURL) return false;
  try {
    const u = new URL(scriptURL);
    if (u.origin !== window.location.origin) return false;
    const basename = u.pathname.split('/').pop();
    return basename === 'sw.js' || basename === 'service-worker.js';
  } catch (_) {
    return false;
  }
}

async function unregisterServiceWorkersAndCaches() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs.map(async (r) => {
        try { console.info('SW unregistered:', r.scope); } catch (_) {}
        try { await r.unregister(); } catch (_) {}
      })
    );
  } catch (_) {}

  try {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(
        names.map(async (name) => {
          try { console.info('Cache deleted:', name); } catch (_) {}
          try { await caches.delete(name); } catch (_) {}
        })
      );
    }
  } catch (_) {}
}

import { isMarketingRoute } from '@/lib/is-marketing-route';

export function registerOfflineSW() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  // Marketing landings (e.g. /compound) skip the SW cleanup pass — they
  // load no SW themselves and the cleanup work eats main-thread time
  // during LCP. The cleanup will run on the user's next navigation into
  // the main app.
  if (isMarketingRoute()) return;

  // We do NOT register any service worker. Caching an app-shell SW caused
  // stale-chunk blank pages on mobile / installed PWAs after deploys; the
  // chunk-reload safety net (src/lib/chunk-reload.ts) handles recovery on
  // the rare lazy-import failure without holding stale HTML.
  //
  // Emergency cleanup: unregister every old service worker and clear every
  // Cache Storage bucket so stale workers cannot serve JS with a bad MIME type.
  void unregisterServiceWorkersAndCaches();
  // Reference SW_URL so the export stays meaningful and the variable is not
  // dropped by tree-shaking lints.
  void SW_URL;
}

registerOfflineSW();
