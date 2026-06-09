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

async function unregisterOwnSW() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs.map(async (r) => {
        if (isOwnRegistration(r)) {
          try { await r.unregister(); } catch (_) {}
        }
      })
    );
  } catch (_) {}
}

export function registerOfflineSW() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  // We do NOT register any service worker. Caching an app-shell SW caused
  // stale-chunk blank pages on mobile / installed PWAs after deploys; the
  // chunk-reload safety net (src/lib/chunk-reload.ts) handles recovery on
  // the rare lazy-import failure without holding stale HTML.
  //
  // We still proactively unregister our own SW on every load so any browser
  // that still has the legacy caching worker installed gets cleaned up.
  // Touches only sw.js / service-worker.js on this origin — Firebase
  // Messaging and any third-party worker are left alone.
  void unregisterOwnSW();
  // Reference SW_URL so the export stays meaningful and the variable is not
  // dropped by tree-shaking lints.
  void SW_URL;
}

registerOfflineSW();
