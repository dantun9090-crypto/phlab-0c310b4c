import { createServerFn } from '@tanstack/react-start';

/**
 * Probe a single URL as Googlebot to see what Prerender.io / our edge serves.
 * Returns the HTTP status, whether the HTML response carries a
 * `<meta name="prerender-status-code">` (Prerender.io's signal for soft-404),
 * and a few diagnostic headers.
 */
const GOOGLEBOT_UA =
  'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

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
  'https://www.phlabs.co.uk/',
  'https://www.phlabs.co.uk/products',
  'https://www.phlabs.co.uk/products/bpc-157', // should 301 via CF rule
  'https://phlabs.co.uk/',
];

export const probePrerenderStatus = createServerFn({ method: 'POST' })
  .inputValidator((data: { urls?: string[] } | undefined) => data ?? {})
  .handler(async ({ data }) => {
    const urls =
      data.urls && data.urls.length > 0 ? data.urls.slice(0, 12) : DEFAULT_TARGETS;
    const results = await Promise.all(urls.map(probeOne));
    return { checkedAt: new Date().toISOString(), results };
  });
