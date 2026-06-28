/**
 * GSC query-level performance for /compound, with high-risk flagging,
 * configurable thresholds, trend history, and one-click negative-keyword
 * sync to Google Ads.
 *
 * Collections:
 *  - settings/compoundQueryThresholds     — admin-editable thresholds
 *  - compound_query_history/{auto}        — weekly snapshots (server-written)
 *  - compound_negatives_applied/{auto}    — audit of pushes to Google Ads
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

export interface CompoundThresholds {
  /** Min current-window impressions for "trending" classification. */
  minImpressions: number;
  /** Min growth vs prior window, as ratio (0.5 = 50%). */
  growthRatio: number;
  /** Lookback window in days (1–90). */
  windowDays: number;
}

export const DEFAULT_THRESHOLDS: CompoundThresholds = {
  minImpressions: 5,
  growthRatio: 0.5,
  windowDays: 28,
};

/** Strict validator — throws on invalid input. Used by save fn and cron. */
export function validateThresholds(t: Partial<CompoundThresholds>): CompoundThresholds {
  const errors: string[] = [];
  const minImpressions = Number(t.minImpressions);
  const growthRatio = Number(t.growthRatio);
  const windowDays = Number(t.windowDays);
  if (!Number.isFinite(minImpressions) || !Number.isInteger(minImpressions) || minImpressions < 1 || minImpressions > 10_000) {
    errors.push('minImpressions must be an integer between 1 and 10000');
  }
  if (!Number.isFinite(growthRatio) || growthRatio < 0 || growthRatio > 50) {
    errors.push('growthRatio must be a number between 0 and 50');
  }
  if (!Number.isFinite(windowDays) || !Number.isInteger(windowDays) || windowDays < 1 || windowDays > 90) {
    errors.push('windowDays must be an integer between 1 and 90');
  }
  if (errors.length) throw new Error(`Invalid thresholds: ${errors.join('; ')}`);
  return { minImpressions, growthRatio, windowDays };
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

async function loadThresholdsFromDb(): Promise<CompoundThresholds> {
  try {
    const { getDocAdmin } = await import('@/lib/server/firestore-admin');
    const d = (await getDocAdmin('settings', 'compoundQueryThresholds')) as
      | Partial<CompoundThresholds>
      | null;
    if (!d) return DEFAULT_THRESHOLDS;
    return {
      minImpressions: Number(d.minImpressions ?? DEFAULT_THRESHOLDS.minImpressions),
      growthRatio: Number(d.growthRatio ?? DEFAULT_THRESHOLDS.growthRatio),
      windowDays: Number(d.windowDays ?? DEFAULT_THRESHOLDS.windowDays),
    };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

/** Pure analysis — reusable from cron and from the admin server fn. */
export async function analyzeCompoundQueries(
  days: number,
  pagePath: string,
  thresholds: CompoundThresholds,
) {
  const siteUrl = await pickSite();
  const cur = await querySearchAnalytics(siteUrl, days, pagePath);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const oldEnd = new Date(Date.now() - days * 86_400_000);
  const encodedSite = encodeURIComponent(siteUrl);
  const priorRes = await fetch(
    `${GATEWAY}/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        startDate: fmt(new Date(oldEnd.getTime() - days * 86_400_000)),
        endDate: fmt(oldEnd),
        dimensions: ['query'],
        dimensionFilterGroups: [
          { filters: [{ dimension: 'page', operator: 'contains', expression: pagePath }] },
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

  const rows = cur.rows.map((r) => {
    const q = r.keys[0];
    const prev = priorMap.get(q) ?? { clicks: 0, impressions: 0 };
    const deltaImpressions = r.impressions - prev.impressions;
    const deltaClicks = r.clicks - prev.clicks;
    const riskTokens = flagRisk(q);
    const trending =
      r.impressions >= thresholds.minImpressions &&
      deltaImpressions > prev.impressions * thresholds.growthRatio;
    return {
      query: q,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
      riskTokens,
      deltaImpressions,
      deltaClicks,
      trending,
    };
  });
  rows.sort((a, b) => b.impressions - a.impressions);

  const riskyTrending = rows.filter((r) => r.riskTokens.length > 0 && r.trending);

  return {
    siteUrl,
    pagePath,
    startDate: cur.startDate,
    endDate: cur.endDate,
    days,
    thresholds,
    totalRows: rows.length,
    totalImpressions: rows.reduce((s, r) => s + r.impressions, 0),
    totalClicks: rows.reduce((s, r) => s + r.clicks, 0),
    riskyCount: rows.filter((r) => r.riskTokens.length > 0).length,
    riskyTrendingCount: riskyTrending.length,
    rows,
    fetchedAt: new Date().toISOString(),
  };
}

export const fetchCompoundQueries = createServerFn({ method: 'POST' })
  .inputValidator((d: { idToken: string; days?: number; pagePath?: string }) => {
    if (!d?.idToken) throw new Error('idToken required');
    const days = Math.min(Math.max(Number(d.days ?? 0) || 0, 0), 90);
    const pagePath = d.pagePath === '/landing/phlabs' ? '/landing/phlabs' : '/compound';
    return { idToken: d.idToken, days, pagePath };
  })
  .handler(async ({ data }) => {
    await requireAdmin(data.idToken);
    const t = await loadThresholdsFromDb();
    const days = data.days || t.windowDays;
    return analyzeCompoundQueries(days, data.pagePath, t);
  });

// ─── Thresholds: get / save ─────────────────────────────────────────────

export const getCompoundThresholds = createServerFn({ method: 'POST' })
  .inputValidator((d: { idToken: string }) => {
    if (!d?.idToken) throw new Error('idToken required');
    return d;
  })
  .handler(async ({ data }) => {
    await requireAdmin(data.idToken);
    return await loadThresholdsFromDb();
  });

export const saveCompoundThresholds = createServerFn({ method: 'POST' })
  .inputValidator((d: { idToken: string; thresholds: Partial<CompoundThresholds> }) => {
    if (!d?.idToken) throw new Error('idToken required');
    const t = d.thresholds ?? {};
    const validated = validateThresholds({
      minImpressions: Number(t.minImpressions),
      growthRatio: Number(t.growthRatio),
      windowDays: Number(t.windowDays),
    });
    return { idToken: d.idToken, thresholds: validated };
  })
  .handler(async ({ data }) => {
    await requireAdmin(data.idToken);
    const { addDocAdmin, updateDocAdmin, getDocAdmin } = await import(
      '@/lib/server/firestore-admin'
    );
    const existing = await getDocAdmin('settings', 'compoundQueryThresholds');
    if (existing) {
      await updateDocAdmin('settings', 'compoundQueryThresholds', {
        ...data.thresholds,
        updatedAt: new Date(),
      });
    } else {
      await addDocAdmin(
        'settings',
        { ...data.thresholds, updatedAt: new Date() },
        'compoundQueryThresholds',
      );
    }
    return { ok: true, thresholds: data.thresholds };
  });

// ─── History list ───────────────────────────────────────────────────────

export const listCompoundHistory = createServerFn({ method: 'POST' })
  .inputValidator((d: { idToken: string; limit?: number }) => {
    if (!d?.idToken) throw new Error('idToken required');
    return { idToken: d.idToken, limit: Math.min(Math.max(Number(d.limit ?? 30), 1), 200) };
  })
  .handler(async ({ data }) => {
    await requireAdmin(data.idToken);
    const { listDocsAdmin } = await import('@/lib/server/firestore-admin');
    const rows = await listDocsAdmin('compound_query_history', {
      orderBy: 'fetchedAt',
      direction: 'DESCENDING',
      limit: data.limit,
    });
    return { rowsJson: JSON.stringify(rows) };
  });

// ─── Apply negatives to Google Ads (dry-run + live) ─────────────────────

/**
 * RFC 4180–style CSV cell escaping — wraps in double quotes only when
 * needed, escapes embedded quotes by doubling them.
 */
function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export type NegativeMatchType = 'Broad' | 'Phrase' | 'Exact';

/**
 * Build a Google Ads Editor–compatible negative-keyword bulk CSV.
 *
 * Header order matches the Google Ads Editor import schema for
 * "Campaign negative keyword" rows:
 *   Campaign, Keyword, Criterion Type, Match Type, Status
 *
 * - Criterion Type is always "Negative Keyword" (campaign-level negative).
 * - Match Type defaults to "Phrase" (safest balance of breadth vs. precision).
 * - Status defaults to "Enabled" so the import activates immediately.
 *
 * Reference: Google Ads Editor → File → Export → CSV column reference.
 */
export function buildNegativesCsv(
  campaignName: string,
  negatives: string[],
  matchType: NegativeMatchType = 'Phrase',
  status: 'Enabled' | 'Paused' = 'Enabled',
): string {
  const header = 'Campaign,Keyword,Criterion Type,Match Type,Status\r\n';
  const rows = negatives
    .map((kw) =>
      [
        csvCell(campaignName),
        csvCell(kw.trim().toLowerCase()),
        'Negative Keyword',
        matchType,
        status,
      ].join(','),
    )
    .join('\r\n');
  return rows ? header + rows + '\r\n' : header;
}

/**
 * Static sample CSV — same exact schema as live exports — so admins can
 * download a known-good reference before importing into Google Ads Editor.
 */
export function buildSampleNegativesCsv(): string {
  return buildNegativesCsv(
    'PHLABS — Compound Search',
    ['recreational use', 'how to inject', 'weight loss', 'human consumption'],
    'Phrase',
    'Enabled',
  );
}



const ADS_API_VERSION = 'v18';
const ADS_API_BASE = `https://googleads.googleapis.com/${ADS_API_VERSION}`;

async function getAdsAccessToken(): Promise<string> {
  const id = process.env.GOOGLE_ADS_CLIENT_ID!;
  const secret = process.env.GOOGLE_ADS_CLIENT_SECRET!;
  const refresh = process.env.GOOGLE_ADS_REFRESH_TOKEN!;
  const body = new URLSearchParams({
    client_id: id,
    client_secret: secret,
    refresh_token: refresh,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`OAuth refresh failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export const applyNegativesToGoogleAds = createServerFn({ method: 'POST' })
  .inputValidator((d: {
    idToken: string;
    campaignResourceId?: string; // numeric Google Ads campaign id (live mode only)
    negatives: string[];
    dryRun?: boolean;
  }) => {
    if (!d?.idToken) throw new Error('idToken required');
    const negatives = Array.from(
      new Set((d.negatives ?? []).map((s) => String(s).trim().toLowerCase()).filter(Boolean)),
    ).slice(0, 200);
    return {
      idToken: d.idToken,
      campaignResourceId: (d.campaignResourceId || '').replace(/[^0-9]/g, ''),
      negatives,
      dryRun: d.dryRun !== false, // default to dry-run for safety
    };
  })
  .handler(async ({ data }) => {
    await requireAdmin(data.idToken);
    if (data.negatives.length === 0) {
      return { ok: false as const, error: 'No negatives to apply' };
    }

    const cid = (process.env.GOOGLE_ADS_CUSTOMER_ID ?? '').replace(/-/g, '');
    const hasCreds =
      !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
      !!process.env.GOOGLE_ADS_CLIENT_ID &&
      !!process.env.GOOGLE_ADS_CLIENT_SECRET &&
      !!process.env.GOOGLE_ADS_REFRESH_TOKEN &&
      !!cid;

    const ops = data.negatives.map((kw) => ({
      campaignCriterionOperation: {
        create: {
          campaign: data.campaignResourceId
            ? `customers/${cid}/campaigns/${data.campaignResourceId}`
            : `customers/${cid || 'CID'}/campaigns/CAMPAIGN_ID`,
          negative: true,
          keyword: { text: kw, matchType: 'PHRASE' },
        },
      },
    }));

    const audit = {
      negatives: data.negatives,
      operationCount: ops.length,
      campaignResourceId: data.campaignResourceId || null,
      dryRun: data.dryRun,
      createdAt: new Date(),
    };

    if (data.dryRun || !hasCreds || !data.campaignResourceId) {
      // Audit dry-runs too so we have a paper trail.
      try {
        const { addDocAdmin } = await import('@/lib/server/firestore-admin');
        await addDocAdmin('compound_negatives_applied', { ...audit, mode: 'dry-run' });
      } catch { /* non-fatal */ }
      return {
        ok: true as const,
        mode: 'dry-run' as const,
        reason: !hasCreds
          ? 'Google Ads credentials not configured'
          : !data.campaignResourceId
          ? 'No campaignResourceId — preview only'
          : 'dryRun=true requested',
        operationCount: ops.length,
        operationsPreviewJson: JSON.stringify(ops.slice(0, 10), null, 2),
        negatives: data.negatives,
      };
    }

    // Live push
    const token = await getAdsAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
      'Content-Type': 'application/json',
    };
    const mccId = process.env.GOOGLE_ADS_MCC_CUSTOMER_ID || process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    if (mccId) headers['login-customer-id'] = mccId.replace(/-/g, '');

    const res = await fetch(`${ADS_API_BASE}/customers/${cid}/campaignCriteria:mutate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        operations: ops.map((o) => o.campaignCriterionOperation),
        partialFailure: true,
        validateOnly: false,
      }),
    });
    const text = await res.text();
    try {
      const { addDocAdmin } = await import('@/lib/server/firestore-admin');
      await addDocAdmin('compound_negatives_applied', {
        ...audit,
        mode: 'live',
        httpStatus: res.status,
        responseSnippet: text.slice(0, 4000),
      });
    } catch { /* non-fatal */ }

    if (!res.ok) {
      return {
        ok: false as const,
        mode: 'live' as const,
        status: res.status,
        errorJson: text,
      };
    }
    return { ok: true as const, mode: 'live' as const, status: res.status, resultJson: text };
  });

// ─── Audit history list ────────────────────────────────────────────────

export const listCompoundNegativesAudit = createServerFn({ method: 'POST' })
  .inputValidator((d: { idToken: string; limit?: number }) => {
    if (!d?.idToken) throw new Error('idToken required');
    const limit = Math.min(Math.max(Number(d.limit ?? 100) || 100, 1), 500);
    return { idToken: d.idToken, limit };
  })
  .handler(async ({ data }) => {
    await requireAdmin(data.idToken);
    const { listDocsAdmin } = await import('@/lib/server/firestore-admin');
    const rows = await listDocsAdmin('compound_negatives_applied', {
      orderBy: 'createdAt',
      direction: 'DESCENDING',
      limit: data.limit,
    });
    return { rowsJson: JSON.stringify(rows) };
  });
