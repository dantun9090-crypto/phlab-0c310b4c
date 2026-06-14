import { createServerFn } from '@tanstack/react-start';
import { requireFirebaseAdmin } from '@/lib/server/firebase-auth-admin';

const MIN_EXPECTED_PRERENDER_TOKEN_LENGTH = 20;

/**
 * Return only the length of PRERENDER_TOKEN and whether it matches the
 * expected Prerender.io token length range. Never returns the token value
 * itself — admin UI only needs to know whether a token is configured and
 * plausibly sized. Live Googlebot simulation verifies the real outcome.
 */
export const checkPrerenderTokenLength = createServerFn({ method: 'POST' })
  .inputValidator((data: { idToken: string }) => {
    if (!data?.idToken || typeof data.idToken !== 'string') throw new Error('idToken required');
    return data;
  })
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const token = process.env.PRERENDER_TOKEN ?? '';
    const length = token.length;
    return {
      configured: length > 0,
      length,
      expected: MIN_EXPECTED_PRERENDER_TOKEN_LENGTH,
      ok: length >= MIN_EXPECTED_PRERENDER_TOKEN_LENGTH,
      checkedAt: new Date().toISOString(),
    } as const;
  });


/**
 * Live Googlebot-UA curl-style check of the homepage. Returns the HTTP
 * status and key Prerender / Cloudflare headers so admins can see at a
 * glance whether bots are getting 200 (prerendered HTML) or 503
 * (`invalid-x-prerender-token-provided` is the usual culprit).
 */
export const checkGooglebotResponse = createServerFn({ method: 'POST' })
  .inputValidator((data: { url?: string; idToken: string }) => {
    if (!data?.idToken || typeof data.idToken !== 'string') throw new Error('idToken required');
    return data;
  })
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const target = data.url && isAllowedUrl(data.url) ? data.url : 'https://phlabs.co.uk/';
    const started = Date.now();
    try {
      const res = await fetch(target, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': GOOGLEBOT_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(15_000),
      });
      const status = res.status;
      const prerendered = res.headers.get('x-prerendered') === 'true';
      const routedVia = res.headers.get('x-phl-via');
      const verdict: 'ok' | 'soft_fail' | 'fail' =
        status === 200 && prerendered ? 'ok' : status >= 500 ? 'fail' : 'soft_fail';
      return {
        url: target,
        status,
        ok: status === 200 && prerendered,
        verdict,
        rejectReason: res.headers.get('x-prerender-reject-reason'),
        prerendered,
        routedVia,
        prerenderCache: res.headers.get('x-prerender-cache'),
        cfCache: res.headers.get('cf-cache-status'),
        cfRay: res.headers.get('cf-ray'),
        server: res.headers.get('server'),
        durationMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      } as const;
    } catch (err) {
      return {
        url: target,
        status: 0,
        ok: false,
        verdict: 'fail' as const,
        rejectReason: null,
        prerendered: false,
        routedVia: null,
        prerenderCache: null,
        cfCache: null,
        cfRay: null,
        server: null,
        durationMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      } as const;
    }
  });




/**
 * Probe a single URL as Googlebot to see what Prerender.io / our edge serves.
 * Returns the HTTP status, whether the HTML response carries a
 * `<meta name="prerender-status-code">` (Prerender.io's signal for soft-404),
 * and a few diagnostic headers.
 */
const GOOGLEBOT_UA =
  'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

// Only allow probing our own production hosts — prevents SSRF against
// cloud metadata endpoints, internal services, or arbitrary third parties.
const ALLOWED_HOST_SUFFIXES = [
  'phlabs.co.uk',
  'phlabs.co.uk',
  // check-domains-allow-next-line
  'prohealthpeptides.co.uk',
  // check-domains-allow-next-line
  'www.prohealthpeptides.co.uk',
];

function isAllowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    return ALLOWED_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith('.' + suffix),
    );
  } catch {
    return false;
  }
}

export interface ProbeResult {
  url: string;
  status: number;
  ok: boolean;
  finalUrl: string;
  redirectedTo: string | null;
  prerendered: boolean;          // x-prerendered: true
  prerenderCache: string | null; // HIT | MISS | PASS | null
  cfCache: string | null;
  metaStatusCode: number | null; // <meta name="prerender-status-code" content="...">
  detectedNotFound: boolean;     // meta says 404, or HTTP 404, or body has obvious "Not Found"
  bodyLooksEmpty: boolean;       // <body></body> or very small SSR
  bytes: number;
  durationMs: number;
  error?: string;
}

async function probeOne(url: string): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': GOOGLEBOT_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15_000),
    });

    const location = res.headers.get('location');
    let body = '';
    let bytes = 0;
    if (res.status < 300 || res.status >= 400) {
      body = await res.text();
      bytes = body.length;
    }

    const metaMatch = body.match(
      /<meta[^>]+name=["']prerender-status-code["'][^>]+content=["'](\d+)["']/i,
    );
    const metaStatusCode = metaMatch ? Number(metaMatch[1]) : null;

    const looksNotFound =
      /not\s*found|page\s*not\s*found|404/i.test(
        body.slice(0, 5000).replace(/<[^>]+>/g, ' '),
      ) && bytes < 80_000;

    const bodyLooksEmpty =
      /<body[^>]*>\s*<\/body>/i.test(body) || (bytes > 0 && bytes < 1500);

    return {
      url,
      status: res.status,
      ok: res.status >= 200 && res.status < 400,
      finalUrl: url,
      redirectedTo: res.status >= 300 && res.status < 400 ? location : null,
      prerendered: res.headers.get('x-prerendered') === 'true',
      prerenderCache: res.headers.get('x-prerender-cache'),
      cfCache: res.headers.get('cf-cache-status'),
      metaStatusCode,
      detectedNotFound:
        res.status === 404 || metaStatusCode === 404 || looksNotFound,
      bodyLooksEmpty,
      bytes,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      url,
      status: 0,
      ok: false,
      finalUrl: url,
      redirectedTo: null,
      prerendered: false,
      prerenderCache: null,
      cfCache: null,
      metaStatusCode: null,
      detectedNotFound: false,
      bodyLooksEmpty: false,
      bytes: 0,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const DEFAULT_TARGETS = [
  'https://phlabs.co.uk/',
  // check-domains-allow-next-line
  'https://prohealthpeptides.co.uk/admin',
  // check-domains-allow-next-line
  'https://www.prohealthpeptides.co.uk/admin',
  'https://phlabs.co.uk/products',
  'https://phlabs.co.uk/products/bpc-157', // should 301 via CF rule
  'https://phlabs.co.uk/',
];

export const probePrerenderStatus = createServerFn({ method: 'POST' })
  .inputValidator((data: { urls?: string[]; idToken: string }) => {
    if (!data?.idToken || typeof data.idToken !== 'string') throw new Error('idToken required');
    return data;
  })
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const requested =
      data.urls && data.urls.length > 0 ? data.urls.slice(0, 12) : DEFAULT_TARGETS;
    const urls = requested.filter(isAllowedUrl);
    if (urls.length === 0) {
      throw new Error('No allowed URLs to probe. Only phlabs.co.uk hosts are permitted.');
    }
    const results = await Promise.all(urls.map(probeOne));
    return { checkedAt: new Date().toISOString(), results };
  });

/**
 * Recache a URL via Prerender.io API.
 * POST https://api.prerender.io/recache  { prerenderToken, url }
 */
export const recachePrerenderUrl = createServerFn({ method: 'POST' })
  .inputValidator((data: { url: string; idToken: string }) => {
    if (!data?.url || !isAllowedUrl(data.url)) {
      throw new Error('Only phlabs.co.uk URLs are allowed.');
    }
    if (!data?.idToken || typeof data.idToken !== 'string') {
      throw new Error('idToken required');
    }
    return data;
  })
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const token = process.env.PRERENDER_TOKEN;
    if (!token) throw new Error('PRERENDER_TOKEN not configured');
    const started = Date.now();
    const res = await fetch('https://api.prerender.io/recache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prerenderToken: token, url: data.url }),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    return {
      url: data.url,
      status: res.status,
      ok: res.ok,
      response: text.slice(0, 500),
      durationMs: Date.now() - started,
      recachedAt: new Date().toISOString(),
    };
  });

/**
 * Bulk recache: proxy to Prerender.io /recache with a list of URLs and
 * optional adaptiveType. Done server-side because api.prerender.io blocks CORS,
 * so calling it from the browser yields "NetworkError when attempting to fetch resource".
 */
export const recachePrerenderUrlsBulk = createServerFn({ method: 'POST' })
  .inputValidator((data: { urls: string[]; adaptiveType?: 'mobile' | 'desktop'; idToken: string }) => {
    if (!Array.isArray(data?.urls) || data.urls.length === 0) {
      throw new Error('urls[] is required');
    }
    if (data.urls.length > 1000) {
      throw new Error('Max 1000 URLs per request');
    }
    if (!data?.idToken || typeof data.idToken !== 'string') {
      throw new Error('idToken required');
    }
    const filtered = data.urls.filter(isAllowedUrl);
    if (filtered.length === 0) {
      throw new Error('No allowed URLs (only phlabs.co.uk hosts permitted).');
    }
    return { urls: filtered, adaptiveType: data.adaptiveType, idToken: data.idToken };
  })
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const token = process.env.PRERENDER_TOKEN;
    if (!token) throw new Error('PRERENDER_TOKEN not configured');
    const started = Date.now();
    const body: Record<string, unknown> = { prerenderToken: token, urls: data.urls };
    if (data.adaptiveType) body.adaptiveType = data.adaptiveType;
    const res = await fetch('https://api.prerender.io/recache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    return {
      count: data.urls.length,
      adaptiveType: data.adaptiveType ?? 'desktop',
      status: res.status,
      ok: res.ok,
      response: text.slice(0, 500),
      durationMs: Date.now() - started,
      recachedAt: new Date().toISOString(),
    };
  });
