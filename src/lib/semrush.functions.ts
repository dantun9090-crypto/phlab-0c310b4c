import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from '@/lib/server/firebase-auth-admin';

const GATEWAY = 'https://connector-gateway.lovable.dev/semrush';
const DEFAULT_DOMAIN = 'phlabs.co.uk';
const DEFAULT_DATABASE = 'uk';
// Strict allowlist: only first-party hosts may be queried via the connector.
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
  if (!res.ok) throw new Error(`Semrush ${res.status}: ${text.slice(0, 80)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Semrush invalid JSON: ${text.slice(0, 80)}`); }
}

const OverviewInput = z.object({
  idToken: z.string().min(10).max(4096),
  domain: z.string().min(1).max(253).regex(/^[a-z0-9.-]+$/i).optional(),
  database: DatabaseEnum.optional(),
});

export const getSemrushOverview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => {
    const parsed = OverviewInput.parse(data);
    const domain = (parsed.domain || DEFAULT_DOMAIN).toLowerCase();
    if (!ALLOWED_DOMAINS.has(domain)) {
      throw new Error('domain not on allowlist');
    }
    return {
      idToken: parsed.idToken,
      domain,
      database: parsed.database || DEFAULT_DATABASE,
    };
  })
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);

    const [limits, ranks, topPages, backlinksOverview] = await Promise.allSettled([
      gwGet('/user/limits', {}),
      gwGet('/domains/domain_ranks', {
        domain: data.domain,
        database: data.database,
        export_columns: 'Db,Dn,Rk,Or,Ot,Oc,Ad,At,Ac',
      }),
      gwGet('/domains/domain_organic', {
        domain: data.domain,
        database: data.database,
        display_limit: 15,
        export_columns: 'Ph,Po,Nq,Cp,Tr,Tc,Co,Nr,Td',
      }),
      gwGet('/backlinks/backlinks_overview', {
        target: data.domain,
        target_type: 'root_domain',
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
// Keyword geo breakdown — per-country search volumes for a single phrase
// ---------------------------------------------

// Wide allowlist of Semrush regional databases for cross-country volume lookups.
const GEO_DATABASES: Array<{ id: string; country: string }> = [
  { id: 'uk', country: 'United Kingdom' },
  { id: 'us', country: 'United States' },
  { id: 'ca', country: 'Canada' },
  { id: 'au', country: 'Australia' },
  { id: 'ie', country: 'Ireland' },
  { id: 'nz', country: 'New Zealand' },
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
  { id: 'za', country: 'South Africa' },
];

const KeywordGeoInput = z.object({
  idToken: z.string().min(10).max(4096),
  // Conservative phrase guard: 2-80 chars, printable, no control/HTML.
  phrase: z.string().min(2).max(80).regex(/^[\p{L}\p{N} .,'+&/-]+$/u, 'phrase contains unsupported characters'),
});

export const getSemrushKeywordGeo = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => {
    const parsed = KeywordGeoInput.parse(data);
    return { idToken: parsed.idToken, phrase: parsed.phrase.trim() };
  })
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);

    const settled = await Promise.allSettled(
      GEO_DATABASES.map((db) =>
        gwGet('/keywords/phrase_this', {
          phrase: data.phrase,
          database: db.id,
          export_columns: 'Ph,Nq,Cp,Co,Nr,Td',
        }),
      ),
    );

    type Row = {
      database: string;
      country: string;
      volume: number | null;
      cpc: number | null;
      competition: number | null;
      results: number | null;
      error: string | null;
    };

    const rows: Row[] = settled.map((s, i) => {
      const meta = GEO_DATABASES[i];
      if (s.status !== 'fulfilled') {
        return {
          database: meta.id,
          country: meta.country,
          volume: null, cpc: null, competition: null, results: null,
          error: String((s as any).reason?.message ?? 'request failed').slice(0, 200),
        };
      }
      const obj = rowsToObjects(s.value)[0] ?? {};
      const num = (v: any) => (v == null || v === '' ? null : Number(v));
      return {
        database: meta.id,
        country: meta.country,
        volume: num(obj.Nq),
        cpc: num(obj.Cp),
        competition: num(obj.Co),
        results: num(obj.Nr),
        error: null,
      };
    });

    const totalVolume = rows.reduce((sum, r) => sum + (r.volume ?? 0), 0);
    const ukVolume = rows.find((r) => r.database === 'uk')?.volume ?? 0;
    const ukSharePct = totalVolume > 0 ? (ukVolume / totalVolume) * 100 : 0;

    return {
      phrase: data.phrase,
      fetchedAt: new Date().toISOString(),
      rows,
      totals: {
        countries: rows.length,
        withData: rows.filter((r) => r.volume != null && r.volume > 0).length,
        totalVolume,
        ukVolume,
        ukSharePct: Math.round(ukSharePct * 100) / 100,
      },
    };
  });


