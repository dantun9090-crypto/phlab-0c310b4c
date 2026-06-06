import { createServerFn } from '@tanstack/react-start';
import { requireFirebaseAdmin } from '@/lib/server/firebase-auth-admin';

const GATEWAY = 'https://connector-gateway.lovable.dev/semrush';
const DEFAULT_DOMAIN = 'phlabs.co.uk';
const DEFAULT_DATABASE = 'uk';

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
  if (!res.ok) throw new Error(`Semrush ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Semrush invalid JSON: ${text.slice(0, 200)}`); }
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

export const getSemrushOverview = createServerFn({ method: 'POST' })
  .inputValidator((data: { idToken: string; domain?: string; database?: string }) => {
    if (!data?.idToken) throw new Error('idToken required');
    return {
      idToken: data.idToken,
      domain: data.domain || DEFAULT_DOMAIN,
      database: data.database || DEFAULT_DATABASE,
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
