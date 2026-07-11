import { createFileRoute } from '@tanstack/react-router';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getDocAdmin, listDocsAdmin } from '@/lib/server/firestore-admin';

/**
 * Cloudflare secrets + last-purge diagnostic feed for the admin
 * `Cloudflare Status` tab. Returns ONLY presence booleans for each
 * required secret (never the values) plus the last purge / verify
 * result cached in Firestore `_meta/build_state` and the most recent
 * `post_publish_auto_invalidation` audit row.
 */

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  });
}

function parseTs(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') {
    const parsed = Date.parse(v);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  if (typeof v === 'object' && v !== null && 'seconds' in (v as Record<string, unknown>)) {
    const s = (v as { seconds?: unknown }).seconds;
    return typeof s === 'number' ? new Date(s * 1000).toISOString() : null;
  }
  return null;
}

function present(name: string): { present: boolean; length: number } {
  const raw = process.env[name];
  const v = typeof raw === 'string' ? raw.trim() : '';
  return { present: v.length > 0, length: v.length };
}

export const Route = createFileRoute('/api/public/cloudflare-secrets-status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const limited = await enforceRateLimit(request, 'cf-secrets-status', {
          limit: 30,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) return limited;

        // Presence-only — never leak values.
        const cfApiToken = present('CF_API_TOKEN');
        const cfApiTokenAlt = present('CLOUDFLARE_API_TOKEN');
        const cfZonePhlabs = present('CF_ZONE_ID');
        const cfZonePhlabsAlt = present('CLOUDFLARE_ZONE_ID_PHLABS');
        const cfZoneProhealth = present('CF_ZONE_ID_PROHEALTH');
        const cfZoneProhealthAlt = present('CLOUDFLARE_ZONE_ID_PROHEALTH');

        const [buildState, recentAudit] = await Promise.all([
          getDocAdmin('_meta', 'build_state').catch(() => null),
          listDocsAdmin('auditLogs', {
            orderBy: 'createdAt',
            direction: 'DESCENDING',
            limit: 25,
          }).catch(() => [] as Array<Record<string, unknown> & { id: string }>),
        ]);

        const lastAudit = recentAudit.find(
          (r) => r.kind === 'post_publish_auto_invalidation',
        );
        const cf = (lastAudit?.cloudflare as
          | { ok?: boolean; status?: number; detail?: string; zone?: string }
          | undefined) ?? null;
        const verify = (lastAudit?.verify as
          | { ok?: boolean; hits?: number; misses?: number; sample?: unknown }
          | undefined) ?? null;

        return json({
          checkedAt: new Date().toISOString(),
          secrets: {
            CF_API_TOKEN: {
              present: cfApiToken.present || cfApiTokenAlt.present,
              source: cfApiToken.present
                ? 'CF_API_TOKEN'
                : cfApiTokenAlt.present
                ? 'CLOUDFLARE_API_TOKEN'
                : null,
              length: cfApiToken.present ? cfApiToken.length : cfApiTokenAlt.length,
            },
            CF_ZONE_ID: {
              present: cfZonePhlabs.present || cfZonePhlabsAlt.present,
              source: cfZonePhlabs.present
                ? 'CF_ZONE_ID'
                : cfZonePhlabsAlt.present
                ? 'CLOUDFLARE_ZONE_ID_PHLABS'
                : null,
              length: cfZonePhlabs.present ? cfZonePhlabs.length : cfZonePhlabsAlt.length,
            },
            CF_ZONE_ID_PROHEALTH: {
              present: cfZoneProhealth.present || cfZoneProhealthAlt.present,
              source: cfZoneProhealth.present
                ? 'CF_ZONE_ID_PROHEALTH'
                : cfZoneProhealthAlt.present
                ? 'CLOUDFLARE_ZONE_ID_PROHEALTH'
                : null,
              length: cfZoneProhealth.present
                ? cfZoneProhealth.length
                : cfZoneProhealthAlt.length,
            },
          },
          lastPurge: {
            requested: cf !== null || buildState?.lastPurgeOk !== undefined,
            ok: cf?.ok ?? (typeof buildState?.lastPurgeOk === 'boolean' ? buildState.lastPurgeOk : null),
            status:
              cf?.status ??
              (typeof buildState?.lastPurgeStatus === 'number'
                ? buildState.lastPurgeStatus
                : null),
            zone: cf?.zone ?? null,
            detail: typeof cf?.detail === 'string' ? cf.detail.slice(0, 240) : null,
            buildId: (lastAudit?.buildId as string | undefined) ?? null,
            at: parseTs(lastAudit?.createdAt) ?? parseTs(buildState?.updatedAt),
          },
          lastVerify: {
            requested: verify !== null,
            ok: verify?.ok ?? null,
            hits: typeof verify?.hits === 'number' ? verify.hits : null,
            misses: typeof verify?.misses === 'number' ? verify.misses : null,
          },
        });
      },
    },
  },
});
