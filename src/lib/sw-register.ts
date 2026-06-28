// Guarded service-worker registration for PH Labs.
//
// We register a minimal **install-only** SW (`/sw.js`) on real PH Labs
// production origins so Chromium fires `beforeinstallprompt` and the in-page
// Install button on /install actually works. The SW never caches or
// intercepts responses (see public/sw.js), so it cannot cause stale-chunk
// blank pages.
//
// Anywhere we should NOT register (Lovable preview, iframe, dev, `?sw=off`)
// we proactively unregister any prior SW + clear Cache Storage so users
// can't get stranded on a stale registration.

import { isMarketingRoute } from '@/lib/is-marketing-route';

const SW_URL = '/sw.js';

const PHLABS_HOSTS = new Set<string>([
  'phlabs.co.uk',
  'www.phlabs.co.uk',
  'prohealthpeptides.co.uk', // check-domains-allow-line: legacy host SW cleanup
  'www.prohealthpeptides.co.uk', // check-domains-allow-line: legacy host SW cleanup
]);

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

function shouldRegister(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  try {
    if (window.top !== window.self) return false; // iframe
  } catch {
    return false;
  }
  const url = new URL(window.location.href);
  if (url.searchParams.get('sw') === 'off') return false;
  const host = url.hostname;
  if (isLovablePreviewHost(host)) return false;
  if (!PHLABS_HOSTS.has(host)) return false;
  return true;
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
          try { await caches.delete(name); } catch (_) {}
        })
      );
    }
  } catch (_) {}
}

export function registerOfflineSW() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  // Marketing landings skip all SW work to protect LCP. The decision is
  // re-evaluated on the user's next navigation into the main app.
  if (isMarketingRoute()) return;

  if (!shouldRegister()) {
    void unregisterServiceWorkersAndCaches();
    return;
  }

  // Defer past load so it never competes with LCP.
  const register = () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: '/' })
      .then((reg) => {
        try { console.info('SW registered (install-only):', reg.scope); } catch (_) {}
      })
      .catch((err) => {
        try { console.warn('SW registration failed:', err); } catch (_) {}
      });
  };

  if (document.readyState === 'complete') {
    setTimeout(register, 0);
  } else {
    window.addEventListener('load', () => setTimeout(register, 0), { once: true });
  }
}

registerOfflineSW();
