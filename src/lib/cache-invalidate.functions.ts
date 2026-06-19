import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from './server/firebase-auth-admin';


/**
 * Fire Cloudflare cache purge + Prerender.io recache for product-related URLs.
 *
 * Called automatically from src/lib/firebase.ts after any add/update/delete
 * on the product_stock collection. Fire-and-forget — never blocks the UI.
 *
 * Tokens are server-only (process.env). Inputs are tightly validated to
 * prevent abuse / SSRF style misuse.
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

const InputSchema = z.object({
  // Slug of the affected product (optional — e.g. for bulk ops or deletes
  // where caller doesn't know the slug).
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9][a-z0-9-]*$/i, 'invalid slug')
    .optional(),
  slugs: z
    .array(z.string().min(1).max(120).regex(/^[a-z0-9][a-z0-9-]*$/i, 'invalid slug'))
    .max(10)
    .optional(),
  // Category slug to scope the purge to.
  category: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  // Firebase ID token of an admin user. Required — without it any anonymous
  // visitor could spam Cloudflare cache-purge and Prerender.io recache APIs
  // and exhaust quota.
  idToken: z.string().min(20).max(4096),
});


function productUrls(slugs?: string[], category?: string): string[] {
  const urls = new Set<string>([
    `${ORIGIN}/products`,
    `${ORIGIN}/`,
    // Sitemap + robots regenerate dynamically from Firestore — must purge
    // on every product change so crawlers see new lastmod/URL list.
    `${ORIGIN}/sitemap.xml`,
    `${ORIGIN}/robots.txt`,
  ]);

  // Category landing pages — purge all to be safe (cheap).
  for (const cat of CATEGORIES) {
    urls.add(`${ORIGIN}/products/category/${cat}`);
    urls.add(`${ORIGIN}/products?category=${cat}`);
  }
  if (category) {
    urls.add(`${ORIGIN}/products/category/${category}`);
    urls.add(`${ORIGIN}/products?category=${category}`);
  }

  for (const slug of slugs ?? []) {
    if (slug) urls.add(`${ORIGIN}/products/${slug}`);
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

async function recachePrerender(urls: string[]): Promise<{ ok: boolean; desktop: { ok: boolean; status: number; error?: string }; mobile: { ok: boolean; status: number; error?: string } }> {
  const token = process.env.PRERENDER_TOKEN;
  if (!token) {
    const missing = { ok: false, status: 0, error: 'PRERENDER_TOKEN missing' };
    return { ok: false, desktop: missing, mobile: missing };
  }

  // Prerender.io /recache accepts up to 1000 URLs; split if needed (we have ~20).
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

export const invalidateProductCache = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    // Verify caller is an authenticated admin before touching any
    // rate-limited upstream APIs.
    try {
      await requireFirebaseAdmin(data.idToken);
    } catch (e) {
      return {
        ok: false,
        error: 'unauthorized',
        reason: e instanceof Error ? e.message : 'auth_failed',
      } as const;
    }

    const slugs = Array.from(
      new Set([data.slug, ...(data.slugs ?? [])].filter((slug): slug is string => typeof slug === 'string' && slug.length > 0)),
    );
    const urls = productUrls(slugs, data.category);
    const [cf, pr] = await Promise.all([
      purgeCloudflare(urls),
      recachePrerender(urls),
    ]);
    return {
      ok: cf.ok && pr.ok,
      urls: urls.length,
      cloudflare: cf,
      prerender: pr,
      timestamp: new Date().toISOString(),
    } as const;
  });

/**
 * Generic content-cache invalidator — banners, articles, policies,
 * landing pages. Caller passes site-relative paths (e.g. ['/about']).
 * Always also purges /, /sitemap.xml, /robots.txt.
 */
const ContentInputSchema = z.object({
  paths: z
    .array(
      z
        .string()
        .min(1)
        .max(200)
        .regex(/^\/[A-Za-z0-9/_\-.?=&]*$/, 'invalid path'),
    )
    .max(50),
  idToken: z.string().min(20).max(4096),
});

export const invalidateContentCache = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => ContentInputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      await requireFirebaseAdmin(data.idToken);
    } catch (e) {
      return {
        ok: false,
        error: 'unauthorized',
        reason: e instanceof Error ? e.message : 'auth_failed',
      } as const;
    }
    const set = new Set<string>([
      `${ORIGIN}/`,
      `${ORIGIN}/sitemap.xml`,
      `${ORIGIN}/robots.txt`,
    ]);
    for (const p of data.paths) set.add(`${ORIGIN}${p}`);
    const urls = [...set];
    const [cf, pr] = await Promise.all([
      purgeCloudflare(urls),
      recachePrerender(urls),
    ]);
    return {
      ok: cf.ok && pr.ok,
      urls: urls.length,
      cloudflare: cf,
      prerender: pr,
      timestamp: new Date().toISOString(),
    } as const;
  });


