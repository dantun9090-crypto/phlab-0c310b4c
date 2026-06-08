--b07d47c3c2cab63139fa5da53b891b75822356aa3c2f450ce9fdc5ee559a
Content-Disposition: form-data; name="phlabs-prerender-worker.js"

const BOT_UA = /googlebot|bingbot|yandex|baiduspider|duckduckbot|slurp|sogou|exabot|facebot|ia_archiver|facebookexternalhit|twitterbot|rogerbot|linkedinbot|embedly|quora link preview|showyoubot|outbrain|pinterest\/0\.|slackbot|vkshare|w3c_validator|redditbot|applebot|whatsapp|flipboard|tumblr|bitlybot|skypeuripreview|nuzzel|discordbot|qwantify|pinterestbot|telegrambot|chrome-lighthouse|adsbot-google|storebot-google|mediapartners-google|google-inspectiontool|google page speed/i;
const SKIP_EXT = /\.(js|mjs|css|xml|less|png|jpg|jpeg|gif|pdf|doc|txt|ico|rss|zip|mp3|rar|exe|wmv|avi|ppt|mpg|mpeg|tif|wav|mov|psd|ai|xls|mp4|m4a|swf|dat|dmg|iso|flv|m4v|torrent|woff|woff2|ttf|otf|svg|webmanifest|webp|map|json)$/i;
const SERVICE_WORKER_PATHS = new Set(['/sw.js', '/service-worker.js']);

const SERVICE_WORKER_KILL_SWITCH = `// PH Labs service-worker edge kill switch\nself.addEventListener('install', event => event.waitUntil(self.skipWaiting()));\nself.addEventListener('activate', event => event.waitUntil((async () => { try { const names = await caches.keys(); await Promise.allSettled(names.filter(name => /(^|-)precache-v\\d+-|(^|-)runtime-|(^|-)googleAnalytics-|^phlabs-offline-|^workbox-|^precache-|^runtime-/.test(name)).map(name => caches.delete(name))); await self.clients.claim(); const clients = await self.clients.matchAll({ type: 'window' }); await Promise.allSettled(clients.map(client => client.navigate(client.url))); } finally { await self.registration.unregister(); } })()));\nself.addEventListener('fetch', () => {});\n`;

function withServiceWorkerNoStore(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
  headers.set('CDN-Cache-Control', 'no-store');
  headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
  headers.set('Surrogate-Control', 'no-store');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  headers.set('Vary', '*');
  headers.set('Service-Worker-Allowed', '/');
  headers.set('Content-Type', 'text/javascript; charset=utf-8');
  headers.delete('ETag');
  headers.delete('Last-Modified');
  headers.delete('Age');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ua = request.headers.get('user-agent') || '';
    const isBot = BOT_UA.test(ua) || url.searchParams.has('_escaped_fragment_');
    const method = request.method;

    if (SERVICE_WORKER_PATHS.has(url.pathname)) {
      try {
        const res = await fetch(request, { cf: { cacheTtl: 0, cacheEverything: false } });
        return withServiceWorkerNoStore(res);
      } catch (e) {
        return withServiceWorkerNoStore(new Response(SERVICE_WORKER_KILL_SWITCH, { status: 200 }));
      }
    }

    // Pass-through: non-GET/HEAD, API, static assets, sitemap/robots, non-bots
    if (!isBot || (method !== 'GET' && method !== 'HEAD')
        || url.pathname.startsWith('/api/')
        || url.pathname === '/sitemap.xml'
        || url.pathname === '/robots.txt'
        || url.pathname === '/google-merchant-feed.xml'
        || SKIP_EXT.test(url.pathname)) {
      return fetch(request);
    }

    // Bot: proxy to Prerender.io
    try {
      const target = 'https://service.prerender.io/' + url.toString();
      const res = await fetch(target, {
        headers: {
          'X-Prerender-Token': env.PRERENDER_TOKEN,
          'User-Agent': ua,
          'Accept-Encoding': 'gzip',
        },
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      const headers = new Headers(res.headers);
      headers.delete('content-encoding');
      headers.delete('content-length');
      headers.delete('transfer-encoding');
      headers.set('x-prerendered-by', 'phlabs-worker');
      return new Response(res.body, { status: res.status, headers });
    } catch (e) {
      // On any failure, fall through to origin
      return fetch(request);
    }
  }
};

--b07d47c3c2cab63139fa5da53b891b75822356aa3c2f450ce9fdc5ee559a--
