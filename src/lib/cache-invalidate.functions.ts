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
const ORIGIN = 'https://www.phlabs.co.uk';

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
  // Category slug to scope the purge to.
  category: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

function productUrls(slug?: string, category?: string): string[] {
  const urls = new Set<string>([
    `${ORIGIN}/products`,
    `${ORIGIN}/`,
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

  if (slug) {
    urls.add(`${ORIGIN}/products/${slug}`);
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

async function recachePrerender(urls: string[]): Promise<{ ok: boolean; status: number; error?: string }> {
  const token = process.env.PRERENDER_TOKEN;
  if (!token) return { ok: false, status: 0, error: 'PRERENDER_TOKEN missing' };

  // Prerender.io /recache accepts up to 1000 URLs; split if needed (we have ~20).
  try {
    const res = await fetch('https://api.prerender.io/recache', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Prerender-Token': token,
      },
      body: JSON.stringify({ prerenderToken: token, urls }),
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export const invalidateProductCache = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const urls = productUrls(data.slug, data.category);
    const [cf, pr] = await Promise.all([
      purgeCloudflare(urls),
      recachePrerender(urls),
    ]);
    return {
      urls: urls.length,
      cloudflare: cf,
      prerender: pr,
      timestamp: new Date().toISOString(),
    };
  });
