import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from './server/firebase-auth-admin';

/**
 * Admin-only cache operations:
 *   - purgeCloudflareCache: full Cloudflare zone purge (purge_everything) OR
 *     selective file purge for a list of URLs.
 *   - recacheSitemapPrerender: fetch /sitemap.xml, POST every URL to
 *     Prerender.io /recache (desktop + optional mobile).
 *
 * Both require an authenticated Firebase admin (verified server-side via
 * idToken). Tokens never leave the server.
 */

const CF_ZONE_ID = 'ed093ef4578e8e3568e26c3e979558c6';
const ORIGIN = 'https://phlabs.co.uk';
const ALLOWED_HOSTS = new Set(['phlabs.co.uk', 'www.phlabs.co.uk']);

function isAllowedUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const PurgeSchema = z.object({
  idToken: z.string().min(20).max(4096),
  // When true → purge_everything for the whole zone.
  // When false → must provide files[] (max 30, all phlabs.co.uk hosts).
  purgeEverything: z.boolean().default(false),
  files: z.array(z.string().url()).max(30).optional(),
});

export const purgeCloudflareCache = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => PurgeSchema.parse(input))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!token) {
      return { ok: false, status: 0, error: 'CLOUDFLARE_API_TOKEN missing', mode: 'none' as const };
    }

    let body: string;
    let mode: 'everything' | 'files';
    if (data.purgeEverything) {
      body = JSON.stringify({ purge_everything: true });
      mode = 'everything';
    } else {
      const files = (data.files ?? []).filter(isAllowedUrl);
      if (files.length === 0) {
        return { ok: false, status: 0, error: 'No allowed URLs to purge', mode: 'files' as const };
      }
      body = JSON.stringify({ files });
      mode = 'files';
    }

    const started = Date.now();
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body,
          signal: AbortSignal.timeout(15_000),
        },
      );
      const text = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        mode,
        response: text.slice(0, 600),
        durationMs: Date.now() - started,
        at: new Date().toISOString(),
      } as const;
    } catch (e) {
      return {
        ok: false,
        status: 0,
        mode,
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - started,
        at: new Date().toISOString(),
      } as const;
    }
  });

const RecacheSchema = z.object({
  idToken: z.string().min(20).max(4096),
  includeMobile: z.boolean().default(true),
});

async function fetchSitemapUrls(): Promise<string[]> {
  const res = await fetch(`${ORIGIN}/sitemap.xml`, {
    headers: { Accept: 'application/xml' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`sitemap.xml HTTP ${res.status}`);
  const xml = await res.text();
  const urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g))
    .map((m) => m[1].trim())
    .filter(isAllowedUrl);
  // Dedupe.
  return Array.from(new Set(urls));
}

async function postRecache(
  token: string,
  urls: string[],
  adaptiveType?: 'mobile' | 'desktop',
): Promise<{ ok: boolean; status: number; response: string }> {
  const body: Record<string, unknown> = { prerenderToken: token, urls };
  if (adaptiveType) body.adaptiveType = adaptiveType;
  const res = await fetch('https://api.prerender.io/recache', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, response: text.slice(0, 400) };
}

export const recacheSitemapPrerender = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => RecacheSchema.parse(input))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const token = process.env.PRERENDER_TOKEN;
    if (!token) {
      return {
        ok: false,
        urls: 0,
        desktop: null,
        mobile: null,
        error: 'PRERENDER_TOKEN missing',
        at: new Date().toISOString(),
      } as const;
    }
    const started = Date.now();
    let urls: string[];
    try {
      urls = await fetchSitemapUrls();
    } catch (e) {
      return {
        ok: false,
        urls: 0,
        desktop: null,
        mobile: null,
        error: e instanceof Error ? e.message : String(e),
        at: new Date().toISOString(),
      } as const;
    }
    if (urls.length === 0) {
      return {
        ok: false,
        urls: 0,
        desktop: null,
        mobile: null,
        error: 'sitemap.xml contained no allowed URLs',
        at: new Date().toISOString(),
      } as const;
    }

    const desktop = await postRecache(token, urls, 'desktop');
    const mobile = data.includeMobile ? await postRecache(token, urls, 'mobile') : null;

    return {
      ok: desktop.ok && (mobile?.ok ?? true),
      urls: urls.length,
      desktop,
      mobile,
      durationMs: Date.now() - started,
      at: new Date().toISOString(),
    } as const;
  });
