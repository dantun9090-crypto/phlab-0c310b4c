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
    host.endsWith('.beta.lovable.dev')
  );
}

async function unregisterOwnSW() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs.map(async (r) => {
        const scriptURL = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || '';
        if (scriptURL.endsWith(SW_URL)) {
          try { await r.unregister(); } catch (_) {}
        }
      })
    );
  } catch (_) {}
}

export function registerOfflineSW() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  const inIframe = window.top !== window.self;
  const host = window.location.hostname;
  const killSwitch = new URLSearchParams(window.location.search).get('sw') === 'off';

  const refuse =
    !import.meta.env.PROD ||
    inIframe ||
    killSwitch ||
    isLovablePreviewHost(host);

  if (refuse) {
    void unregisterOwnSW();
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SW_URL, { scope: '/' }).catch(() => {
      /* silent — offline fallback is best-effort */
    });
  });
}

registerOfflineSW();
