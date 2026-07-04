import { createFileRoute } from '@tanstack/react-router';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getDocAdmin } from '@/lib/server/firestore-admin';

/**
 * Automated site audit — meta, headers, structured data, headings, SEO,
 * mobile/a11y hints, Cloudflare + Firebase + Prerender sanity checks.
 *
 * Results are cached in-worker for 1 hour to avoid running expensive
 * checks on every page load. Pass ?force=1 to bypass the cache.
 *
 * Exposed at /api/public/audit-report; the admin tab is the only
 * consumer. Returns only public, non-sensitive diagnostic fields.
 */

const BASE = 'https://phlabs.co.uk';
const PRODUCT_SAMPLE_PATH = '/product/bpc-157-research-peptide';
const CACHE_TTL_MS = 60 * 60 * 1000;

interface CategoryReport {
  score: number;
  issues: string[];
  passed: string[];
}

interface AuditReport {
  checkedAt: string;
  overallScore: number;
  categories: {
    meta: CategoryReport;
    headers: CategoryReport;
    structuredData: CategoryReport;
    headings: CategoryReport;
    seo: CategoryReport;
    coreWebVitals: CategoryReport;
    mobileA11y: CategoryReport;
    gmc: CategoryReport;
    googleAds: CategoryReport;
    cloudflare: CategoryReport;
    firebase: CategoryReport;
    prerender: CategoryReport;
  };
  criticalIssues: string[];
  warnings: string[];
  recommendations: string[];
  sampledPages: Array<{ path: string; status: number; ms: number }>;
}

let cached: { at: number; report: AuditReport } | null = null;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  });
}

interface FetchedPage {
  path: string;
  url: string;
  status: number;
  ms: number;
  html: string;
  headers: Record<string, string>;
  error?: string;
}

async function fetchPage(path: string): Promise<FetchedPage> {
  const url = new URL(path, BASE).toString();
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'text/html',
        'Cache-Control': 'no-cache',
        'User-Agent': 'phlabs-audit-report/1.0',
      },
      signal: AbortSignal.timeout(12_000),
    });
    const html = res.headers.get('content-type')?.includes('text/html')
      ? await res.text()
      : '';
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    return { path, url, status: res.status, ms: Date.now() - started, html, headers };
  } catch (err) {
    return {
      path,
      url,
      status: 0,
      ms: Date.now() - started,
      html: '',
      headers: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function attr(html: string, tagRx: RegExp, attrName: string): string | null {
  const m = html.match(tagRx);
  if (!m) return null;
  const inner = m[0];
  const a = inner.match(new RegExp(`${attrName}\\s*=\\s*"([^"]*)"`, 'i'));
  return a ? a[1] : null;
}

function metaContent(html: string, name: string, kind: 'name' | 'property' = 'name'): string | null {
  const rx = new RegExp(`<meta[^>]*${kind}\\s*=\\s*"${name}"[^>]*>`, 'i');
  return attr(html, rx, 'content');
}

function analyzeMeta(page: FetchedPage): CategoryReport {
  const issues: string[] = [];
  const passed: string[] = [];
  if (page.status !== 200 || !page.html) {
    return { score: 0, issues: [`homepage fetch failed (${page.status})`], passed: [] };
  }
  const html = page.html;

  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? '';
  if (!title) issues.push('missing <title>');
  else if (title.length < 30 || title.length > 65) issues.push(`title length ${title.length} (want 30–65)`);
  else passed.push(`title ok (${title.length} chars)`);

  const desc = metaContent(html, 'description') ?? '';
  if (!desc) issues.push('missing meta description');
  else if (desc.length < 80 || desc.length > 170) issues.push(`description length ${desc.length} (want 80–170)`);
  else passed.push(`description ok (${desc.length} chars)`);

  const canonical = attr(html, /<link[^>]*rel\s*=\s*"canonical"[^>]*>/i, 'href');
  if (!canonical) issues.push('missing canonical link');
  else if (!canonical.startsWith('https://phlabs.co.uk')) issues.push(`canonical not on phlabs.co.uk: ${canonical}`);
  else passed.push('canonical present');

  for (const p of ['og:title', 'og:description', 'og:url', 'og:type']) {
    if (!metaContent(html, p, 'property')) issues.push(`missing ${p}`);
    else passed.push(`${p} present`);
  }
  if (!metaContent(html, 'twitter:card')) issues.push('missing twitter:card');
  else passed.push('twitter:card present');

  const viewport = metaContent(html, 'viewport');
  if (!viewport) issues.push('missing viewport');
  else passed.push('viewport present');

  if (!/charset\s*=\s*["']?utf-8/i.test(html)) issues.push('missing charset UTF-8');
  else passed.push('charset UTF-8');

  const lang = attr(html, /<html[^>]*>/i, 'lang');
  if (!lang) issues.push('missing <html lang>');
  else if (!/^en(-GB|-gb)?$/i.test(lang)) issues.push(`html lang="${lang}" (want en-GB)`);
  else passed.push(`html lang="${lang}"`);

  const robots = metaContent(html, 'robots');
  if (robots && /noindex/i.test(robots)) issues.push(`robots meta noindex on homepage: ${robots}`);
  else passed.push('robots meta indexable');

  return score(issues, passed);
}

function analyzeHeaders(page: FetchedPage): CategoryReport {
  const issues: string[] = [];
  const passed: string[] = [];
  if (page.status === 0) return { score: 0, issues: [`fetch failed: ${page.error}`], passed: [] };
  const h = page.headers;

  const req = (name: string, matcher: (v: string) => boolean, msg: string) => {
    const v = h[name];
    if (!v) issues.push(`missing ${name}`);
    else if (!matcher(v)) issues.push(`${name}: ${msg} (got "${v.slice(0, 80)}")`);
    else passed.push(`${name} ok`);
  };

  const ct = h['content-type'] ?? '';
  if (!/text\/html.*utf-8/i.test(ct)) issues.push(`content-type not text/html; charset=utf-8 (got "${ct}")`);
  else passed.push('content-type ok');

  req('strict-transport-security', v => /max-age=\d+/i.test(v), 'want HSTS with max-age');
  req('x-content-type-options', v => /nosniff/i.test(v), 'want nosniff');
  req('referrer-policy', () => true, 'present');
  req('content-security-policy', v => v.includes('script-src'), 'want script-src');

  const xfo = h['x-frame-options'];
  const csp = h['content-security-policy'] ?? '';
  if (!xfo && !/frame-ancestors/i.test(csp)) issues.push('missing X-Frame-Options AND CSP frame-ancestors');
  else passed.push('frame protection present');

  if (!h['x-build-id']) issues.push('missing x-build-id header');
  else passed.push(`x-build-id ${h['x-build-id']}`);

  const cc = h['cache-control'] ?? '';
  if (!cc) issues.push('missing cache-control');
  else if (cc.includes('stale-while-revalidate=86400')) issues.push(`cache SWR window too wide: ${cc}`);
  else passed.push(`cache-control: ${cc.slice(0, 60)}`);

  return score(issues, passed);
}

function analyzeStructuredData(page: FetchedPage): CategoryReport {
  const issues: string[] = [];
  const passed: string[] = [];
  if (!page.html) return { score: 0, issues: ['no HTML'], passed: [] };

  const blocks = [...page.html.matchAll(/<script[^>]*type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  if (blocks.length === 0) {
    issues.push('no JSON-LD blocks on homepage');
    return score(issues, passed);
  }
  passed.push(`${blocks.length} JSON-LD block(s)`);

  const types = new Set<string>();
  const ids: string[] = [];
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b[1].trim());
      const flat = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of flat) {
        const t = node?.['@type'];
        if (typeof t === 'string') types.add(t);
        else if (Array.isArray(t)) t.forEach(x => types.add(String(x)));
        if (node?.['@id']) ids.push(String(node['@id']));
      }
    } catch (err) {
      issues.push(`invalid JSON-LD: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const dupIds = ids.filter((v, i, a) => a.indexOf(v) !== i);
  if (dupIds.length) issues.push(`duplicate @id: ${[...new Set(dupIds)].join(', ')}`);
  else passed.push('no duplicate @id');

  for (const t of ['Organization', 'WebSite']) {
    if (!types.has(t)) issues.push(`missing ${t} schema on homepage`);
    else passed.push(`${t} schema present`);
  }
  return score(issues, passed);
}

function analyzeHeadings(page: FetchedPage): CategoryReport {
  const issues: string[] = [];
  const passed: string[] = [];
  if (!page.html) return { score: 0, issues: ['no HTML'], passed: [] };

  const h1s = [...page.html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  if (h1s.length === 0) issues.push('no H1 on homepage');
  else if (h1s.length > 1) issues.push(`${h1s.length} H1s on homepage (want exactly 1)`);
  else {
    const text = h1s[0][1].replace(/<[^>]+>/g, '').trim();
    if (!text) issues.push('H1 is empty');
    else passed.push(`H1: "${text.slice(0, 60)}"`);
  }

  for (const level of [2, 3, 4, 5, 6]) {
    const matches = [...page.html.matchAll(new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)<\\/h${level}>`, 'gi'))];
    const empty = matches.filter(m => !m[1].replace(/<[^>]+>/g, '').trim()).length;
    if (empty > 0) issues.push(`${empty} empty H${level} tag(s)`);
  }
  if (!issues.some(i => i.includes('empty H'))) passed.push('no empty headings');

  return score(issues, passed);
}

function analyzeSEO(
  page: FetchedPage,
  robots: FetchedPage,
  sitemap: FetchedPage,
): CategoryReport {
  const issues: string[] = [];
  const passed: string[] = [];

  if (robots.status !== 200) issues.push(`robots.txt not 200 (${robots.status})`);
  else {
    passed.push('robots.txt reachable');
    const body = robots.html;
    for (const path of ['/admin', '/cart', '/checkout', '/payment', '/account', '/login']) {
      if (!body.includes(`Disallow: ${path}`)) issues.push(`robots.txt missing Disallow: ${path}`);
    }
    for (const bot of ['GPTBot', 'Google-Extended', 'ChatGPT-User']) {
      if (!body.includes(bot)) issues.push(`robots.txt missing AI scraper block: ${bot}`);
    }
    if (!/sitemap:/i.test(body)) issues.push('robots.txt missing Sitemap: directive');
    else passed.push('sitemap referenced in robots.txt');
  }

  if (sitemap.status !== 200) issues.push(`sitemap.xml not 200 (${sitemap.status})`);
  else {
    const urlCount = (sitemap.html.match(/<loc>/g) ?? []).length;
    if (urlCount === 0) issues.push('sitemap.xml has no <loc> entries');
    else passed.push(`sitemap.xml has ${urlCount} URLs`);
    if (!sitemap.html.includes('<?xml')) issues.push('sitemap.xml missing XML prolog');
  }

  if (page.html) {
    const imgs = [...page.html.matchAll(/<img\b[^>]*>/gi)];
    const missingAlt = imgs.filter(m => !/\balt\s*=/i.test(m[0])).length;
    if (missingAlt > 0) issues.push(`${missingAlt}/${imgs.length} <img> missing alt attribute`);
    else if (imgs.length > 0) passed.push(`${imgs.length} <img> all have alt`);
  }

  return score(issues, passed);
}

function analyzeCoreWebVitals(page: FetchedPage): CategoryReport {
  const issues: string[] = [];
  const passed: string[] = [];
  if (page.status !== 200) return { score: 0, issues: ['homepage not reachable'], passed: [] };

  if (page.ms > 800) issues.push(`TTFB ${page.ms}ms > 800ms budget`);
  else passed.push(`TTFB ${page.ms}ms`);

  const html = page.html;
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)];
  const lazyless = imgs.filter(m => !/loading\s*=\s*"lazy"/i.test(m[0])).length;
  if (imgs.length > 4 && lazyless / imgs.length > 0.6) {
    issues.push(`${lazyless}/${imgs.length} images not lazy-loaded`);
  } else if (imgs.length > 0) {
    passed.push('image lazy-loading acceptable');
  }

  const scripts = [...html.matchAll(/<script\b[^>]*src=/gi)];
  if (scripts.length > 25) issues.push(`${scripts.length} <script src> tags — consider more code splitting`);
  else passed.push(`${scripts.length} external scripts`);

  passed.push('field CWV (LCP/INP/CLS) requires CrUX API — not checked here');
  return score(issues, passed);
}

function analyzeMobileA11y(page: FetchedPage): CategoryReport {
  const issues: string[] = [];
  const passed: string[] = [];
  if (!page.html) return { score: 0, issues: ['no HTML'], passed: [] };

  const viewport = metaContent(page.html, 'viewport') ?? '';
  if (!/width=device-width/i.test(viewport)) issues.push('viewport missing width=device-width');
  else passed.push('responsive viewport');

  const buttons = [...page.html.matchAll(/<(?:button|a)\b[^>]*>/gi)];
  const withoutLabel = buttons.filter(m => !/aria-label|>[^<]/i.test(m[0])).length;
  if (withoutLabel > 5) issues.push(`~${withoutLabel} interactive elements may lack accessible name`);
  else passed.push('interactive elements labelled');

  if (!/skip[- ]to[- ]?content|#main|#content/i.test(page.html)) {
    issues.push('no skip-to-content link detected');
  } else passed.push('skip link detected');

  return score(issues, passed);
}

function analyzeGMC(product: FetchedPage): CategoryReport {
  const issues: string[] = [];
  const passed: string[] = [];
  if (product.status !== 200) {
    return { score: 0, issues: [`product sample fetch failed (${product.status})`], passed: [] };
  }

  const html = product.html;
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '';
  if (/\bpeptides?\b/i.test(title)) {
    issues.push(`product title contains "peptide" — GMC policy risk: "${title.slice(0, 60)}"`);
  } else passed.push('product title free of "peptide"');

  if (!/for research use only/i.test(html)) {
    issues.push('product page missing "For Research Use Only" disclaimer');
  } else passed.push('research-use disclaimer present');

  for (const forbidden of ['dosage', 'human consumption', 'cures', 'treats', 'weight loss']) {
    if (new RegExp(`\\b${forbidden}\\b`, 'i').test(html)) {
      issues.push(`forbidden claim on product page: "${forbidden}"`);
    }
  }

  const productLd = /"@type"\s*:\s*"Product"/.test(html);
  if (!productLd) issues.push('product page missing Product JSON-LD');
  else passed.push('Product JSON-LD present');

  return score(issues, passed);
}

function analyzeGoogleAds(page: FetchedPage, product: FetchedPage): CategoryReport {
  const issues: string[] = [];
  const passed: string[] = [];
  const combined = `${page.html}\n${product.html}`;
  if (!/privacy/i.test(combined)) issues.push('no privacy policy link detected');
  else passed.push('privacy policy linked');
  if (!/terms/i.test(combined)) issues.push('no terms link detected');
  else passed.push('terms linked');
  if (!/contact/i.test(combined)) issues.push('no contact info detected');
  else passed.push('contact info linked');
  if (page.ms > 3000) issues.push(`homepage load ${page.ms}ms > 3s Ads budget`);
  else passed.push(`homepage load ${page.ms}ms`);
  return score(issues, passed);
}

function analyzeCloudflare(page: FetchedPage): CategoryReport {
  const issues: string[] = [];
  const passed: string[] = [];
  const h = page.headers;
  if (!h['cf-ray']) issues.push('no cf-ray header — request may not have hit Cloudflare');
  else passed.push(`cf-ray ${h['cf-ray'].slice(0, 20)}`);
  if (!h['cf-cache-status']) issues.push('no cf-cache-status');
  else passed.push(`cf-cache-status: ${h['cf-cache-status']}`);
  if (page.status >= 500) issues.push(`origin returned ${page.status}`);
  else passed.push('no 5xx from origin');
  return score(issues, passed);
}

async function analyzeFirebase(currentBuildId: string): Promise<CategoryReport> {
  const issues: string[] = [];
  const passed: string[] = [];
  try {
    const state = await getDocAdmin('_meta', 'build_state');
    const last = (state?.lastBuildId as string | undefined) ?? null;
    if (!last) issues.push('_meta/build_state has no lastBuildId');
    else if (last !== currentBuildId) issues.push(`build_state stale: ${last} vs current ${currentBuildId}`);
    else passed.push(`build_state matches current build ${currentBuildId}`);
  } catch (err) {
    issues.push(`firebase admin read failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return score(issues, passed);
}

async function analyzePrerender(): Promise<CategoryReport> {
  const issues: string[] = [];
  const passed: string[] = [];
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(15_000),
    });
    const ms = Date.now() - started;
    const html = await res.text();
    if (res.status !== 200) issues.push(`Googlebot fetch not 200 (${res.status})`);
    else passed.push(`Googlebot fetch ${res.status} in ${ms}ms`);
    if (!/<h1/i.test(html)) issues.push('prerendered HTML has no <h1> — prerender may have failed');
    else passed.push('prerendered HTML has <h1>');
    const rendered = res.headers.get('x-prerender-requestid') || res.headers.get('x-prerender');
    if (rendered) passed.push('prerender header present');
  } catch (err) {
    issues.push(`prerender check failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return score(issues, passed);
}

function score(issues: string[], passed: string[]): CategoryReport {
  const total = issues.length + passed.length;
  const s = total === 0 ? 100 : Math.round((passed.length / total) * 100);
  return { score: s, issues, passed };
}

function classify(cats: AuditReport['categories']): { critical: string[]; warnings: string[]; recs: string[] } {
  const critical: string[] = [];
  const warnings: string[] = [];
  const recs: string[] = [];
  for (const [name, cat] of Object.entries(cats)) {
    for (const iss of cat.issues) {
      if (cat.score < 40) critical.push(`[${name}] ${iss}`);
      else if (cat.score < 75) warnings.push(`[${name}] ${iss}`);
      else recs.push(`[${name}] ${iss}`);
    }
  }
  return { critical, warnings, recs };
}

export const Route = createFileRoute('/api/public/audit-report')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const limited = await enforceRateLimit(request, 'audit-report', {
          limit: 10,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) return limited;

        const url = new URL(request.url);
        const force = url.searchParams.get('force') === '1';
        if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
          return json({ ...cached.report, cache: { hit: true, ageMs: Date.now() - cached.at } });
        }

        const currentBuildId = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'unknown';

        const [home, product, robots, sitemap, firebase, prerender] = await Promise.all([
          fetchPage('/'),
          fetchPage(PRODUCT_SAMPLE_PATH),
          fetchPage('/robots.txt'),
          fetchPage('/sitemap.xml'),
          analyzeFirebase(currentBuildId),
          analyzePrerender(),
        ]);

        const categories: AuditReport['categories'] = {
          meta: analyzeMeta(home),
          headers: analyzeHeaders(home),
          structuredData: analyzeStructuredData(home),
          headings: analyzeHeadings(home),
          seo: analyzeSEO(home, robots, sitemap),
          coreWebVitals: analyzeCoreWebVitals(home),
          mobileA11y: analyzeMobileA11y(home),
          gmc: analyzeGMC(product),
          googleAds: analyzeGoogleAds(home, product),
          cloudflare: analyzeCloudflare(home),
          firebase,
          prerender,
        };

        const overall = Math.round(
          Object.values(categories).reduce((sum, c) => sum + c.score, 0) /
            Object.values(categories).length,
        );

        const { critical, warnings, recs } = classify(categories);

        const report: AuditReport = {
          checkedAt: new Date().toISOString(),
          overallScore: overall,
          categories,
          criticalIssues: critical,
          warnings,
          recommendations: recs,
          sampledPages: [home, product, robots, sitemap].map(p => ({
            path: p.path,
            status: p.status,
            ms: p.ms,
          })),
        };

        cached = { at: Date.now(), report };
        return json({ ...report, cache: { hit: false, ageMs: 0 } });
      },
    },
  },
});
