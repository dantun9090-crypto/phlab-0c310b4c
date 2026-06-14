import { createServerFn } from '@tanstack/react-start';

const GATEWAY = 'https://connector-gateway.lovable.dev/google_search_console';
const SITE_URL = 'https://phlabs.co.uk/';
const DOMAIN_PROPERTY = 'sc-domain:phlabs.co.uk';
const FALLBACK_SITE_CANDIDATES = [SITE_URL, DOMAIN_PROPERTY, 'https://www.phlabs.co.uk/'];

interface GscSiteEntry {
  siteUrl: string;
  permissionLevel: string;
}

function authHeaders() {
  const lovable = process.env.LOVABLE_API_KEY;
  const gsc = process.env.GOOGLE_SEARCH_CONSOLE_API_KEY;
  if (!lovable) throw new Error('LOVABLE_API_KEY not configured');
  if (!gsc) throw new Error('GOOGLE_SEARCH_CONSOLE_API_KEY not configured (connector not linked)');
  return {
    Authorization: `Bearer ${lovable}`,
    'X-Connection-Api-Key': gsc,
    'Content-Type': 'application/json',
  } as Record<string, string>;
}

const ALLOWED_GSC_HOSTS = new Set(['phlabs.co.uk', 'www.phlabs.co.uk']);

function assertAllowedSiteUrl(siteUrl: string): void {
  if (siteUrl === DOMAIN_PROPERTY) return;
  try {
    const u = new URL(siteUrl);
    if (!ALLOWED_GSC_HOSTS.has(u.hostname.toLowerCase())) {
      throw new Error('Only phlabs.co.uk siteUrls are permitted');
    }
  } catch {
    throw new Error('Invalid siteUrl');
  }
}

function formatGscError(action: string, status: number, text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string; status?: string } };
    const message = parsed.error?.message ?? text;
    return `${action} ${status}: ${message}`;
  } catch {
    return `${action} ${status}: ${text.slice(0, 300)}`;
  }
}

async function fetchGscSiteEntries(): Promise<GscSiteEntry[]> {
  const res = await fetch(`${GATEWAY}/webmasters/v3/sites`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(formatGscError('GSC sites', res.status, text));
  const json = JSON.parse(text) as { siteEntry?: GscSiteEntry[] };
  return json.siteEntry ?? [];
}

async function resolveAccessibleSiteUrl(requestedSiteUrl?: string): Promise<string> {
  const requested = requestedSiteUrl ?? SITE_URL;
  assertAllowedSiteUrl(requested);
  const sites = await fetchGscSiteEntries();
  const available = new Set(sites.map((site) => site.siteUrl));
  const selected = [requested, ...FALLBACK_SITE_CANDIDATES].find((candidate) => available.has(candidate));
  if (selected) return selected;

  const verified = sites.length
    ? sites.map((site) => site.siteUrl).join(', ')
    : 'none returned by the connected account';
  throw new Error(
    `Search Console account has no verified phlabs.co.uk property. Verified properties: ${verified}`,
  );
}

async function requireAdmin(idToken: string): Promise<void> {
  const { requireFirebaseAdmin } = await import('@/lib/server/firebase-auth-admin');
  await requireFirebaseAdmin(idToken);
}

/**
 * Fetch Search Analytics performance (last 28 days, by page).
 */
export const fetchGscPerformance = createServerFn({ method: 'POST' })
  .inputValidator((data: { idToken: string; days?: number; siteUrl?: string }) => {
    if (!data?.idToken) throw new Error('idToken required');
    const days = Math.min(Math.max(Number(data.days ?? 28), 1), 90);
    const siteUrl = data.siteUrl ?? SITE_URL;
    assertAllowedSiteUrl(siteUrl);
    return { idToken: data.idToken, days, siteUrl };
  })
  .handler(async ({ data }) => {
    await requireAdmin(data.idToken);
    const siteUrl = await resolveAccessibleSiteUrl(data.siteUrl);
    const end = new Date();
    const start = new Date(end.getTime() - data.days * 86_400_000);
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
          dimensions: ['page'],
          rowLimit: 500,
        }),
        signal: AbortSignal.timeout(20_000),
      }
    );
    const text = await res.text();
    if (!res.ok) {
      throw new Error(formatGscError('GSC performance', res.status, text));
    }
    const json = JSON.parse(text) as {
      rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
    };
    const rows = (json.rows ?? []).map((r) => ({
      page: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));
    return {
      siteUrl,
      startDate: fmt(start),
      endDate: fmt(end),
      totalRows: rows.length,
      rows,
      fetchedAt: new Date().toISOString(),
    };
  });

/**
 * Inspect a single URL's indexing status via GSC URL Inspection API.
 * Rate-limited by Google (~2000/day, 600/min) — call sparingly.
 */
export const inspectGscUrl = createServerFn({ method: 'POST' })
  .inputValidator((data: { idToken: string; inspectionUrl: string; siteUrl?: string }) => {
    if (!data?.idToken) throw new Error('idToken required');
    if (!data?.inspectionUrl) throw new Error('inspectionUrl required');
    try {
      const u = new URL(data.inspectionUrl);
      if (!u.hostname.endsWith('phlabs.co.uk')) {
        throw new Error('Only phlabs.co.uk URLs allowed');
      }
    } catch {
      throw new Error('Invalid inspectionUrl');
    }
    return { ...data, siteUrl: data.siteUrl ?? SITE_URL };
  })
  .handler(async ({ data }) => {
    await requireAdmin(data.idToken);
    const siteUrl = await resolveAccessibleSiteUrl(data.siteUrl);
    const res = await fetch(`${GATEWAY}/v1/urlInspection/index:inspect`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        inspectionUrl: data.inspectionUrl,
        siteUrl,
        languageCode: 'en-GB',
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(formatGscError('GSC inspect', res.status, text));
    }
    const json = JSON.parse(text) as {
      inspectionResult?: {
        indexStatusResult?: {
          verdict?: string;
          coverageState?: string;
          robotsTxtState?: string;
          indexingState?: string;
          lastCrawlTime?: string;
          pageFetchState?: string;
          googleCanonical?: string;
          userCanonical?: string;
        };
      };
    };
    const r = json.inspectionResult?.indexStatusResult ?? {};
    return {
      url: data.inspectionUrl,
      verdict: r.verdict ?? 'UNKNOWN',
      coverageState: r.coverageState ?? '',
      indexingState: r.indexingState ?? '',
      robotsTxtState: r.robotsTxtState ?? '',
      pageFetchState: r.pageFetchState ?? '',
      lastCrawlTime: r.lastCrawlTime ?? null,
      googleCanonical: r.googleCanonical ?? null,
      userCanonical: r.userCanonical ?? null,
      inspectedAt: new Date().toISOString(),
    };
  });

/**
 * List verified sites in this GSC account.
 */
export const listGscSites = createServerFn({ method: 'POST' })
  .inputValidator((data: { idToken: string }) => {
    if (!data?.idToken) throw new Error('idToken required');
    return data;
  })
  .handler(async ({ data }) => {
    await requireAdmin(data.idToken);
    const sites = await fetchGscSiteEntries();
    const selectedSiteUrl = await resolveAccessibleSiteUrl();
    return { sites, selectedSiteUrl, fetchedAt: new Date().toISOString() };
  });
