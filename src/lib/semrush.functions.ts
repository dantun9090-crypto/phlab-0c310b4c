import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from '@/lib/server/firebase-auth-admin';

const GATEWAY = 'https://connector-gateway.lovable.dev/semrush';
const DEFAULT_DOMAIN = 'phlabs.co.uk';
const DEFAULT_DATABASE = 'uk';
const ALLOWED_DOMAINS = new Set(['phlabs.co.uk', 'www.phlabs.co.uk']);
const DatabaseEnum = z.enum(['uk', 'us', 'au', 'ca', 'de', 'fr', 'es', 'it', 'nl', 'ie']);

function authHeaders() {
  const lovable = process.env.LOVABLE_API_KEY;
  const sem = process.env.SEMRUSH_API_KEY;
  if (!lovable) throw new Error('LOVABLE_API_KEY not configured');
  if (!sem) throw new Error('SEMRUSH_API_KEY not configured (Semrush connector not linked)');
  return {
    Authorization: `Bearer ${lovable}`,
    'X-Connection-Api-Key': sem,
  } as Record<string, string>;
}

async function gwGet(path: string, params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const url = `${GATEWAY}${path}?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { ...authHeaders(), 'Allow-Limit-Offset': 'true' },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Semrush ${res.status}: ${text.slice(0, 120)}`);
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`Semrush invalid JSON: ${text.slice(0, 80)}`); }
  if (json && typeof json === 'object' && typeof json.error === 'string') {
    throw new Error(`Semrush ${json.status ?? ''}: ${json.error}`.trim());
  }
  return json;
}

function rowsToObjects(data: any): Array<Record<string, any>> {
  const cols: string[] = data?.data?.columnNames ?? [];
  const rows: any[][] = data?.data?.rows ?? [];
  return rows.map((r) => {
    const o: Record<string, any> = {};
    cols.forEach((c, i) => { o[c] = r[i]; });
    return o;
  });
}

// ---------------------------------------------
// Domain overview
// ---------------------------------------------

const OverviewInput = z.object({
  idToken: z.string().min(10).max(4096),
  domain: z.string().min(1).max(253).regex(/^[a-z0-9.-]+$/i).optional(),
  database: DatabaseEnum.optional(),
});

export const getSemrushOverview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => {
    const parsed = OverviewInput.parse(data);
    const domain = (parsed.domain || DEFAULT_DOMAIN).toLowerCase();
    if (!ALLOWED_DOMAINS.has(domain)) throw new Error('domain not on allowlist');
    return { idToken: parsed.idToken, domain, database: parsed.database || DEFAULT_DATABASE };
  })
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);

    const [limits, ranks, topPages, backlinksOverview] = await Promise.allSettled([
      gwGet('/user/limits', {}),
      gwGet('/domains/domain_ranks', {
        domain: data.domain, database: data.database,
        export_columns: 'Db,Dn,Rk,Or,Ot,Oc,Ad,At,Ac',
      }),
      gwGet('/domains/domain_organic', {
        domain: data.domain, database: data.database, display_limit: 15,
        export_columns: 'Ph,Po,Nq,Cp,Tr,Tc,Co,Nr,Td',
      }),
      gwGet('/backlinks/backlinks_overview', {
        target: data.domain, target_type: 'root_domain',
        export_columns: 'ascore,total,domains_num,urls_num,ips_num,follows_num,nofollows_num,texts_num,images_num',
      }),
    ]);

    return {
      domain: data.domain,
      database: data.database,
      fetchedAt: new Date().toISOString(),
      limits: limits.status === 'fulfilled' ? rowsToObjects(limits.value)[0] ?? null : { error: String((limits as any).reason?.message ?? limits) },
      ranks: ranks.status === 'fulfilled' ? rowsToObjects(ranks.value)[0] ?? null : { error: String((ranks as any).reason?.message ?? ranks) },
      topKeywords: topPages.status === 'fulfilled' ? rowsToObjects(topPages.value) : [],
      topKeywordsError: topPages.status === 'rejected' ? String((topPages as any).reason?.message ?? topPages) : null,
      backlinks: backlinksOverview.status === 'fulfilled' ? rowsToObjects(backlinksOverview.value)[0] ?? null : { error: String((backlinksOverview as any).reason?.message ?? backlinksOverview) },
    };
  });

// ---------------------------------------------
// Keyword geo breakdown
// ---------------------------------------------

// Priority order — top-N fallback walks this list head-first.
export const GEO_DATABASES: Array<{ id: string; country: string }> = [
  { id: 'uk', country: 'United Kingdom' },
  { id: 'us', country: 'United States' },
  { id: 'ie', country: 'Ireland' },
  { id: 'au', country: 'Australia' },
  { id: 'ca', country: 'Canada' },
  { id: 'nz', country: 'New Zealand' },
  { id: 'za', country: 'South Africa' },
  { id: 'de', country: 'Germany' },
  { id: 'fr', country: 'France' },
  { id: 'es', country: 'Spain' },
  { id: 'it', country: 'Italy' },
  { id: 'nl', country: 'Netherlands' },
  { id: 'be', country: 'Belgium' },
  { id: 'ch', country: 'Switzerland' },
  { id: 'at', country: 'Austria' },
  { id: 'se', country: 'Sweden' },
  { id: 'no', country: 'Norway' },
  { id: 'dk', country: 'Denmark' },
  { id: 'fi', country: 'Finland' },
  { id: 'pl', country: 'Poland' },
  { id: 'br', country: 'Brazil' },
  { id: 'mx', country: 'Mexico' },
  { id: 'in', country: 'India' },
  { id: 'jp', country: 'Japan' },
  { id: 'sg', country: 'Singapore' },
];
const GEO_DB_IDS = new Set(GEO_DATABASES.map((d) => d.id));
const COUNTRY_BY_ID = new Map(GEO_DATABASES.map((d) => [d.id, d.country]));

async function fetchQuota(): Promise<{
  remaining: number | null;
  total: number | null;
  resetAt: string | null;
  isPaid: boolean | null;
}> {
  try {
    const lim = await gwGet('/user/limits', {});
    const remaining = Number(lim?.remaining ?? lim?.api_units_left ?? NaN);
    const total = Number(lim?.total ?? NaN);
    const validTill = Number(lim?.valid_till ?? NaN);
    return {
      remaining: Number.isFinite(remaining) ? remaining : null,
      total: Number.isFinite(total) ? total : null,
      resetAt: Number.isFinite(validTill) ? new Date(validTill * 1000).toISOString() : null,
      isPaid: typeof lim?.is_paid === 'boolean' ? lim.is_paid : null,
    };
  } catch {
    return { remaining: null, total: null, resetAt: null, isPaid: null };
  }
}

const QuotaInput = z.object({ idToken: z.string().min(10).max(4096) });
export const getSemrushQuota = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => QuotaInput.parse(data))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const q = await fetchQuota();
    return {
      ...q,
      fetchedAt: new Date().toISOString(),
      fullRunCost: GEO_DATABASES.length,
      databases: GEO_DATABASES,
    };
  });

const KeywordGeoInput = z.object({
  idToken: z.string().min(10).max(4096),
  phrase: z.string().min(2).max(80).regex(/^[\p{L}\p{N} .,'+&/-]+$/u, 'phrase contains unsupported characters'),
  // Optional subset (used for resume + top-N fallback). Must be from GEO_DATABASES.
  databases: z.array(z.string().min(2).max(4)).max(GEO_DATABASES.length).optional(),
  // If true and quota < requested, automatically trim to whatever the quota allows
  // (walking GEO_DATABASES in priority order). If false, throws when quota is short.
  autoLimit: z.boolean().optional(),
});

export const getSemrushKeywordGeo = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => {
    const parsed = KeywordGeoInput.parse(data);
    // Sanitize databases against allowlist + dedupe, preserving priority order.
    let dbs = (parsed.databases ?? GEO_DATABASES.map((d) => d.id))
      .map((s) => s.toLowerCase())
      .filter((id) => GEO_DB_IDS.has(id));
    dbs = Array.from(new Set(dbs));
    // Reorder by priority (preserves stable behavior for top-N fallback)
    const priority = new Map(GEO_DATABASES.map((d, i) => [d.id, i] as const));
    dbs.sort((a, b) => (priority.get(a)! - priority.get(b)!));
    if (dbs.length === 0) throw new Error('no valid databases requested');
    return {
      idToken: parsed.idToken,
      phrase: parsed.phrase.trim(),
      databases: dbs,
      autoLimit: parsed.autoLimit !== false, // default true
    };
  })
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);

    const quotaBefore = await fetchQuota();
    let toFetch = data.databases.slice();
    let trimmedByQuota: string[] = [];

    if (quotaBefore.remaining != null && quotaBefore.remaining < toFetch.length) {
      if (!data.autoLimit) {
        throw new Error(
          `Semrush quota too low: ${quotaBefore.remaining}/${quotaBefore.total ?? '?'} units remaining, ` +
          `need ${toFetch.length}. ${quotaBefore.isPaid ? '' : 'Free plan — '}` +
          `${quotaBefore.resetAt ? `resets at ${quotaBefore.resetAt}. ` : ''}` +
          `Upgrade Semrush plan or wait for reset.`,
        );
      }
      const allowed = Math.max(0, quotaBefore.remaining);
      trimmedByQuota = toFetch.slice(allowed);
      toFetch = toFetch.slice(0, allowed);
    }

    type Row = {
      database: string; country: string;
      volume: number | null; cpc: number | null;
      competition: number | null; results: number | null;
      error: string | null;
    };

    let rows: Row[] = [];
    if (toFetch.length > 0) {
      const settled = await Promise.allSettled(
        toFetch.map((db) =>
          gwGet('/keywords/phrase_this', {
            phrase: data.phrase, database: db,
            export_columns: 'Ph,Nq,Cp,Co,Nr,Td',
          }),
        ),
      );
      rows = settled.map((s, i) => {
        const id = toFetch[i];
        const country = COUNTRY_BY_ID.get(id) ?? id.toUpperCase();
        if (s.status !== 'fulfilled') {
          return {
            database: id, country,
            volume: null, cpc: null, competition: null, results: null,
            error: String((s as any).reason?.message ?? 'request failed').slice(0, 200),
          };
        }
        const obj = rowsToObjects(s.value)[0] ?? {};
        const num = (v: any) => (v == null || v === '' ? null : Number(v));
        return {
          database: id, country,
          volume: num(obj.Nq), cpc: num(obj.Cp),
          competition: num(obj.Co), results: num(obj.Nr),
          error: null,
        };
      });
    }

    const quotaAfter = await fetchQuota();
    const unitsUsed =
      quotaBefore.remaining != null && quotaAfter.remaining != null
        ? Math.max(0, quotaBefore.remaining - quotaAfter.remaining)
        : rows.filter((r) => r.error == null).length;

    return {
      phrase: data.phrase,
      fetchedAt: new Date().toISOString(),
      requestedDatabases: data.databases,
      fetchedDatabases: toFetch,
      trimmedByQuota,
      rows,
      quota: {
        before: quotaBefore,
        after: quotaAfter,
        unitsUsed,
      },
      catalog: GEO_DATABASES,
    };
  });
