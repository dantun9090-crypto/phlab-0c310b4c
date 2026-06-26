import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from '@/lib/server/firebase-auth-admin';

const GATEWAY = 'https://connector-gateway.lovable.dev/semrush';
const OUR_DOMAIN = 'phlabs.co.uk';
const DEFAULT_DATABASE = 'uk';
const DatabaseEnum = z.enum(['uk', 'us', 'au', 'ca', 'ie', 'de', 'fr', 'es', 'it', 'nl']);

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
  const res = await fetch(`${GATEWAY}${path}?${qs.toString()}`, {
    headers: { ...authHeaders(), 'Allow-Limit-Offset': 'true' },
    signal: AbortSignal.timeout(25_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Semrush ${res.status}: ${text.slice(0, 160)}`);
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

const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

const Input = z.object({
  idToken: z.string().min(10).max(4096),
  competitors: z.array(z.string().regex(DOMAIN_RE)).max(5).optional(),
  database: DatabaseEnum.optional(),
  perDomainLimit: z.number().int().min(20).max(200).optional(),
});

type KwRow = { phrase: string; position: number; volume: number; cpc: number; competition: number; traffic: number };

function parseKeywords(json: any): KwRow[] {
  const objs = rowsToObjects(json);
  return objs
    .map((o) => ({
      phrase: String(o.Ph ?? '').toLowerCase().trim(),
      position: Number(o.Po ?? 0) || 0,
      volume: Number(o.Nq ?? 0) || 0,
      cpc: Number(o.Cp ?? 0) || 0,
      competition: Number(o.Co ?? 0) || 0,
      traffic: Number(o.Tr ?? 0) || 0,
    }))
    .filter((r) => r.phrase.length > 0);
}

export const getSemrushKeywordGaps = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => {
    const p = Input.parse(data);
    return {
      idToken: p.idToken,
      competitors: (p.competitors ?? []).map((d) => d.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')),
      database: p.database ?? DEFAULT_DATABASE,
      perDomainLimit: p.perDomainLimit ?? 100,
    };
  })
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);

    const ORG_COLS = 'Ph,Po,Nq,Cp,Co,Tr';

    // Auto-discover competitors if none provided
    let competitors = data.competitors.slice();
    let autoDiscovered = false;
    if (competitors.length === 0) {
      try {
        const disc = await gwGet('/domains/domain_organic_organic', {
          domain: OUR_DOMAIN, database: data.database, display_limit: 5,
          export_columns: 'Dn,Cr,Np,Or',
        });
        const rows = rowsToObjects(disc);
        competitors = rows
          .map((r) => String(r.Dn ?? '').toLowerCase())
          .filter((d) => DOMAIN_RE.test(d) && d !== OUR_DOMAIN)
          .slice(0, 5);
        autoDiscovered = true;
      } catch (e) {
        // fallback hand-picked UK research-chem competitors
        competitors = ['direct-sarms.com', 'pharmagrade.store', 'peptidesciences.com'];
        autoDiscovered = true;
      }
    }

    // Fetch our + competitor keywords in parallel
    const targets = [OUR_DOMAIN, ...competitors];
    const settled = await Promise.allSettled(
      targets.map((dom) =>
        gwGet('/domains/domain_organic', {
          domain: dom, database: data.database, display_limit: data.perDomainLimit,
          export_columns: ORG_COLS,
        }),
      ),
    );

    const perDomain = settled.map((s, i) => ({
      domain: targets[i],
      keywords: s.status === 'fulfilled' ? parseKeywords(s.value) : [],
      error: s.status === 'rejected' ? String((s as any).reason?.message ?? 'failed').slice(0, 200) : null,
    }));

    const ours = perDomain[0];
    const ourMap = new Map<string, KwRow>();
    ours.keywords.forEach((k) => ourMap.set(k.phrase, k));

    type Gap = {
      phrase: string;
      volume: number;
      cpc: number;
      competition: number;
      ourPosition: number | null;
      competitors: Array<{ domain: string; position: number; traffic: number }>;
      bestCompetitorPosition: number;
      opportunityScore: number;
      bucket: 'quick_win' | 'striking_distance' | 'content_gap' | 'long_term';
      recommendation: string;
    };

    const gapMap = new Map<string, Gap>();
    for (let i = 1; i < perDomain.length; i++) {
      const comp = perDomain[i];
      for (const kw of comp.keywords) {
        if (kw.position > 30 || kw.volume < 10) continue;
        const ourKw = ourMap.get(kw.phrase);
        // Only a gap if we don't rank or rank worse
        if (ourKw && ourKw.position <= kw.position && ourKw.position <= 10) continue;

        const existing = gapMap.get(kw.phrase);
        const compEntry = { domain: comp.domain, position: kw.position, traffic: kw.traffic };
        if (existing) {
          existing.competitors.push(compEntry);
          existing.bestCompetitorPosition = Math.min(existing.bestCompetitorPosition, kw.position);
        } else {
          gapMap.set(kw.phrase, {
            phrase: kw.phrase,
            volume: kw.volume,
            cpc: kw.cpc,
            competition: kw.competition,
            ourPosition: ourKw ? ourKw.position : null,
            competitors: [compEntry],
            bestCompetitorPosition: kw.position,
            opportunityScore: 0,
            bucket: 'content_gap',
            recommendation: '',
          });
        }
      }
    }

    // Score + bucket + recommend
    const gaps: Gap[] = Array.from(gapMap.values()).map((g) => {
      // Multi-competitor bonus, easier comp wins
      const compCount = g.competitors.length;
      const posFactor = 1 / Math.max(1, g.bestCompetitorPosition);
      const compEase = 1 - Math.min(0.95, g.competition);
      // Score 0-100
      let score = Math.log10(g.volume + 1) * 20 * posFactor * (1 + 0.2 * compCount) * (0.5 + 0.5 * compEase);
      score = Math.min(100, Math.round(score * 10) / 10);

      let bucket: Gap['bucket'];
      let recommendation: string;
      if (g.ourPosition && g.ourPosition >= 4 && g.ourPosition <= 20) {
        bucket = 'striking_distance';
        recommendation = `Already ranking #${g.ourPosition}. Refresh the existing page targeting "${g.phrase}" — strengthen H1/H2, add internal links from /research and /products, expand FAQ. Quickest path to page 1.`;
      } else if (!g.ourPosition && g.bestCompetitorPosition <= 5 && g.volume >= 100) {
        bucket = 'quick_win';
        recommendation = `Competitors rank top-5 for ${g.volume.toLocaleString()}/mo searches and you don't appear. Publish a dedicated research article or product hub targeting "${g.phrase}" and submit to GSC.`;
      } else if (!g.ourPosition && compCount >= 2) {
        bucket = 'content_gap';
        recommendation = `${compCount} competitors rank for "${g.phrase}" — clear content gap. Add a section or article covering this term with internal links.`;
      } else {
        bucket = 'long_term';
        recommendation = `Lower-priority opportunity. Consider mentioning "${g.phrase}" in a related article or FAQ to build topical coverage.`;
      }
      return { ...g, opportunityScore: score, bucket, recommendation };
    });

    gaps.sort((a, b) => b.opportunityScore - a.opportunityScore);

    const summary = {
      totalGaps: gaps.length,
      quickWins: gaps.filter((g) => g.bucket === 'quick_win').length,
      strikingDistance: gaps.filter((g) => g.bucket === 'striking_distance').length,
      contentGaps: gaps.filter((g) => g.bucket === 'content_gap').length,
      totalMonthlyVolume: gaps.reduce((s, g) => s + g.volume, 0),
    };

    return {
      ourDomain: OUR_DOMAIN,
      database: data.database,
      competitors,
      autoDiscovered,
      fetchedAt: new Date().toISOString(),
      perDomainStats: perDomain.map((d) => ({
        domain: d.domain,
        keywordCount: d.keywords.length,
        error: d.error,
      })),
      summary,
      gaps: gaps.slice(0, 200),
    };
  });
