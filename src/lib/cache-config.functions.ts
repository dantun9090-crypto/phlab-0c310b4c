import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from './server/firebase-auth-admin';
import { getDocAdmin, updateDocAdmin, addDocAdmin } from './server/firestore-admin';
import {
  CACHE_TTL_OPTIONS,
  DEFAULT_HTML_TTL_SECONDS,
  isValidHtmlTtl,
} from './cache-config-shared';
import { invalidateHtmlTtlCache } from './server/cache-config-server';

/**
 * Admin-managed HTML edge-cache TTL.
 * Stored at Firestore `siteSettings/cacheConfig` with field
 * `htmlTtlSeconds` (integer). The origin and the Cloudflare Worker both
 * read this value to size the public HTML edge cache.
 */

const CF_ZONE_ID = 'ed093ef4578e8e3568e26c3e979558c6';
const ALLOWED_TTLS = CACHE_TTL_OPTIONS.map((o) => o.value);

const GetSchema = z.object({ idToken: z.string().min(20).max(4096) });

export const getCacheConfig = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => GetSchema.parse(input))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    let htmlTtlSeconds: number = DEFAULT_HTML_TTL_SECONDS;
    let updatedAt: string | null = null;
    let updatedBy: string | null = null;
    try {
      const doc = await getDocAdmin('siteSettings', 'cacheConfig');
      if (doc) {
        if (isValidHtmlTtl(doc.htmlTtlSeconds)) htmlTtlSeconds = doc.htmlTtlSeconds;
        if (typeof doc.updatedAt === 'string') updatedAt = doc.updatedAt;
        if (typeof doc.updatedBy === 'string') updatedBy = doc.updatedBy;
      }
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
        htmlTtlSeconds,
        updatedAt,
        updatedBy,
        options: CACHE_TTL_OPTIONS,
      };
    }
    return {
      ok: true as const,
      htmlTtlSeconds,
      updatedAt,
      updatedBy,
      options: CACHE_TTL_OPTIONS,
    };
  });

const SetSchema = z.object({
  idToken: z.string().min(20).max(4096),
  htmlTtlSeconds: z
    .number()
    .int()
    .refine((n) => ALLOWED_TTLS.includes(n as (typeof ALLOWED_TTLS)[number]), {
      message: 'Invalid TTL — must be one of the allowed presets',
    }),
});

export const setCacheConfig = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => SetSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await requireFirebaseAdmin(data.idToken);
    const payload = {
      htmlTtlSeconds: data.htmlTtlSeconds,
      updatedAt: new Date().toISOString(),
      updatedBy: user.email ?? user.uid ?? 'admin',
    };
    // Upsert: try PATCH first, fall back to create on 404 (first time).
    try {
      await updateDocAdmin('siteSettings', 'cacheConfig', payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('404') || msg.toLowerCase().includes('not_found')) {
        await addDocAdmin('siteSettings', payload, 'cacheConfig');
      } else {
        throw e;
      }
    }
    invalidateHtmlTtlCache();

    // Best-effort Cloudflare purge so the new TTL takes effect immediately
    // instead of waiting for the previous TTL window to expire.
    let purge: { ok: boolean; status: number; detail?: string } = {
      ok: false,
      status: 0,
      detail: 'skipped',
    };
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (token) {
      try {
        const res = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ purge_everything: true }),
            signal: AbortSignal.timeout(15_000),
          },
        );
        const text = await res.text();
        purge = { ok: res.ok, status: res.status, detail: text.slice(0, 240) };
      } catch (e) {
        purge = {
          ok: false,
          status: 0,
          detail: e instanceof Error ? e.message : String(e),
        };
      }
    }

    return {
      ok: true as const,
      htmlTtlSeconds: data.htmlTtlSeconds,
      updatedAt: payload.updatedAt,
      updatedBy: payload.updatedBy,
      purge,
    };
  });
