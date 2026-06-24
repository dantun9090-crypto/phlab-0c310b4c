/**
 * Server-only cache invalidation helpers used by trusted server mutations
 * (product edits, stock decrements after purchase). These functions do not
 * require an admin idToken because they are not exposed directly to clients.
 */

const CF_ZONE_ID = 'ed093ef4578e8e3568e26c3e979558c6';
const ORIGIN = 'https://phlabs.co.uk';

const CATEGORIES = [
  'metabolic-signaling',
  'tissue-repair',
  'cognitive-research',
  'longevity',
  'growth-hormone',
  'skin-research',
  'blends',
];

export type ProductCacheInvalidationInput = {
  slugs?: string[];
  categories?: string[];
  reason?: string;
};

function sanitizeSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return /^[a-z0-9][a-z0-9-]{0,119}$/i.test(v) ? v : null;
}

function sanitizeCategory(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return /^[a-z0-9-]{1,60}$/i.test(v) ? v : null;
}

export function productCacheUrls(input: ProductCacheInvalidationInput = {}): string[] {
  const urls = new Set<string>([
    `${ORIGIN}/`,
    `${ORIGIN}/products`,
    `${ORIGIN}/sitemap.xml`,
    `${ORIGIN}/robots.txt`,
  ]);

  for (const cat of CATEGORIES) {
    urls.add(`${ORIGIN}/products/category/${cat}`);
    urls.add(`${ORIGIN}/products?category=${cat}`);
  }

  for (const cat of input.categories ?? []) {
    const clean = sanitizeCategory(cat);
    if (!clean) continue;
    urls.add(`${ORIGIN}/products/category/${clean}`);
    urls.add(`${ORIGIN}/products?category=${clean}`);
  }

  for (const slug of input.slugs ?? []) {
    const clean = sanitizeSlug(slug);
    if (clean) urls.add(`${ORIGIN}/products/${clean}`);
  }

  return [...urls];
}

async function purgeCloudflare(urls: string[]): Promise<{ ok: boolean; status: number; error?: string }> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) return { ok: false, status: 0, error: 'CLOUDFLARE_API_TOKEN missing' };

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files: urls }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function recachePrerender(urls: string[]): Promise<{
  ok: boolean;
  desktop: { ok: boolean; status: number; error?: string };
  mobile: { ok: boolean; status: number; error?: string };
}> {
  const token = process.env.PRERENDER_TOKEN;
  if (!token) {
    const missing = { ok: false, status: 0, error: 'PRERENDER_TOKEN missing' };
    return { ok: false, desktop: missing, mobile: missing };
  }

  const post = async (adaptiveType: 'desktop' | 'mobile') => {
    const res = await fetch('https://api.prerender.io/recache', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Prerender-Token': token,
      },
      body: JSON.stringify({ prerenderToken: token, urls, adaptiveType }),
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: res.ok, status: res.status };
  };

  try {
    const [desktop, mobile] = await Promise.all([post('desktop'), post('mobile')]);
    return { ok: desktop.ok && mobile.ok, desktop, mobile };
  } catch (e) {
    const failed = { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
    return { ok: false, desktop: failed, mobile: failed };
  }
}

export async function invalidateProductCacheFromServer(input: ProductCacheInvalidationInput = {}) {
  const urls = productCacheUrls(input);
  const [cloudflare, prerender] = await Promise.all([
    purgeCloudflare(urls),
    recachePrerender(urls),
  ]);

  return {
    ok: cloudflare.ok && prerender.ok,
    urls: urls.length,
    cloudflare,
    prerender,
    reason: input.reason ?? 'server-mutation',
    timestamp: new Date().toISOString(),
  } as const;
}