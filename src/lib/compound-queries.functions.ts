/**
 * GSC query-level performance for /compound, with high-risk flagging.
 *
 * Pulls Search Analytics filtered to page=/compound, returns top queries
 * with clicks/impressions/ctr/position and flags ones containing
 * Google-Ads-banned tokens (recreational intent, molecule names, dosing,
 * weight loss, etc.) so admins can spot risky search demand early.
 */
import { createServerFn } from '@tanstack/react-start';

const GATEWAY = 'https://connector-gateway.lovable.dev/google_search_console';
const SITE_URL = 'https://phlabs.co.uk/';
const DOMAIN_PROPERTY = 'sc-domain:phlabs.co.uk';
const FALLBACKS = [SITE_URL, DOMAIN_PROPERTY, 'https://www.phlabs.co.uk/'];

// High-risk tokens — match Google Ads "Dangerous Products / Recreational
// drugs / Pharma" triggers. Keep aligned with NEGATIVE_KEYWORDS.
export const HIGH_RISK_TOKENS = [
  'recreational', 'designer', 'legal high', 'rc ', ' rc',
  'psychoactive', 'party',
  'human', 'consumption', 'inject', 'dose', 'dosage', 'dosing',
  'cycle', 'stack', 'how to use', 'how to mix',
  'weight loss', 'fat loss', 'slimming', 'anti aging', 'anti-aging',
  'muscle growth', 'bodybuilding', 'steroid', 'sarms',
  'cure', 'treatment', 'therapy', 'medicine', 'prescription',
  'patient', 'clinical', 'diabetes', 'cancer',
  'retatrutide', 'tirzepatide', 'semaglutide',
  'bpc-157', 'bpc 157', 'tb-500', 'tb 500',
  'ghk-cu', 'ghk cu', 'pt-141', 'pt 141',
  'melanotan', 'mt-2', 'mt ii', 'mots-c', 'kpv',
  'ipamorelin', 'cjc-1295', 'hgh', 'somatropin', 'igf-1',
  'peptide', 'peptides',
];

export interface CompoundQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  riskTokens: string[];
}

function authHeaders() {
  const lovable = process.env.LOVABLE_API_KEY;
  const gsc = process.env.GOOGLE_SEARCH_CONSOLE_API_KEY;
  if (!lovable) throw new Error('LOVABLE_API_KEY not configured');
  if (!gsc) throw new Error('GOOGLE_SEARCH_CONSOLE_API_KEY not configured');
  return {
    Authorization: `Bearer ${lovable}`,
    'X-Connection-Api-Key': gsc,
    'Content-Type': 'application/json',
  };
}

async function pickSite(): Promise<string> {
  const res = await fetch(`${GATEWAY}/webmasters/v3/sites`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GSC sites ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { siteEntry?: { siteUrl: string }[] };
  const available = new Set((json.siteEntry ?? []).map((s) => s.siteUrl));
  return FALLBACKS.find((s) => available.has(s)) ?? FALLBACKS[0];
}

function flagRisk(query: string): string[] {
  const lc = query.toLowerCase();
  return HIGH_RISK_TOKENS.filter((t) => lc.includes(t));
}

async function querySearchAnalytics(siteUrl: string, days: number, pagePath: string) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const encodedSite = encodeURIComponent(siteUrl);

  const res = await fetch(
    `${GATEWAY}/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        startDate: fmt(start),
        endDate: fmt(end),
        dimensions: ['query'],
        dimensionFilterGroups: [
          {
            filters: [
              { dimension: 'page', operator: 'contains', expression: pagePath },
            ],
          },
        ],
        rowLimit: 250,
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!res.ok) throw new Error(`GSC query ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
  };
  return { rows: json.rows ?? [], startDate: fmt(start), endDate: fmt(end) };
}

async function requireAdmin(idToken: string): Promise<void> {
  const { requireFirebaseAdmin } = await import('@/lib/server/firebase-auth-admin');
  await requireFirebaseAdmin(idToken);
}

export const fetchCompoundQueries = createServerFn({ method: 'POST' })
  .inputValidator((d: { idToken: string; days?: number; pagePath?: string }) => {
    if (!d?.idToken) throw new Error('idToken required');
    const days = Math.min(Math.max(Number(d.days ?? 28), 1), 90);
    const pagePath = d.pagePath === '/landing/phlabs' ? '/landing/phlabs' : '/compound';
    return { idToken: d.idToken, days, pagePath };
  })
  .handler(async ({ data }) => {
    await requireAdmin(data.idToken);
    const siteUrl = await pickSite();

    // Current window
    const cur = await querySearchAnalytics(siteUrl, data.days, data.pagePath);
    // Prior window (same length) for trend comparison
    const priorDays = data.days;
    const oldEnd = new Date(Date.now() - data.days * 86_400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const encodedSite = encodeURIComponent(siteUrl);
    const priorRes = await fetch(
      `${GATEWAY}/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          startDate: fmt(new Date(oldEnd.getTime() - priorDays * 86_400_000)),
          endDate: fmt(oldEnd),
          dimensions: ['query'],
          dimensionFilterGroups: [
            { filters: [{ dimension: 'page', operator: 'contains', expression: data.pagePath }] },
          ],
          rowLimit: 250,
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    const priorJson = priorRes.ok
      ? ((await priorRes.json()) as { rows?: Array<{ keys: string[]; impressions: number; clicks: number }> })
      : { rows: [] };
    const priorMap = new Map<string, { clicks: number; impressions: number }>();
    for (const r of priorJson.rows ?? []) {
      priorMap.set(r.keys[0], { clicks: r.clicks, impressions: r.impressions });
    }

    const rows: (CompoundQueryRow & { deltaImpressions: number; deltaClicks: number; trending: boolean })[] =
      cur.rows.map((r) => {
        const q = r.keys[0];
        const prev = priorMap.get(q) ?? { clicks: 0, impressions: 0 };
        const deltaImpressions = r.impressions - prev.impressions;
        const deltaClicks = r.clicks - prev.clicks;
        const riskTokens = flagRisk(q);
        return {
          query: q,
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: r.ctr,
          position: r.position,
          riskTokens,
          deltaImpressions,
          deltaClicks,
          trending: deltaImpressions >= 5 && deltaImpressions > prev.impressions * 0.5,
        };
      });

    rows.sort((a, b) => b.impressions - a.impressions);

    const riskyTrending = rows.filter((r) => r.riskTokens.length > 0 && r.trending);

    return {
      siteUrl,
      pagePath: data.pagePath,
      startDate: cur.startDate,
      endDate: cur.endDate,
      days: data.days,
      totalRows: rows.length,
      totalImpressions: rows.reduce((s, r) => s + r.impressions, 0),
      totalClicks: rows.reduce((s, r) => s + r.clicks, 0),
      riskyCount: rows.filter((r) => r.riskTokens.length > 0).length,
      riskyTrendingCount: riskyTrending.length,
      rows,
      fetchedAt: new Date().toISOString(),
    };
  });
