#!/usr/bin/env node
/**
 * e2e-stale-assets.mjs — full site crawl + Playwright browser audit.
 *
 * Crawls phlabs.co.uk (same-origin links, depth-limited), and for every HTML
 * page collects every asset URL the page references (scripts, styles, images,
 * fonts, icons, media, srcset, inline <link>s). Then requests each asset like
 * a browser would (real UA, Referer, Accept) and flags any non-2xx response —
 * those are the "stale assets" a real visitor would hit.
 *
 * Phase 2 (default on): Playwright loads each crawled page in a real Chromium
 * with request/failed-response listeners — catches JS-injected assets the
 * static crawl can't see. Disable with --no-browser or E2E_NO_BROWSER=1.
 *
 * Modes:
 *   default                          crawl the live site + audit found assets (+ optional browser pass)
 *   REPLAY=1|true                    replay the last run's requests.ndjson (no network crawl, no browser)
 *   --prune                          after a successful crawl, delete run artifact dirs older than N days
 *   --prune-dry-run / --dry-run      (with --prune) only report what would be deleted
 *
 * Key env (all optional, sane defaults):
 *   TARGET                           site origin (default https://phlabs.co.uk)
 *   MAX_PAGES                        max HTML pages to crawl (default 400)
 *   CONCURRENCY                      concurrent fetches (default 6)
 *   TIMEOUT_MS                       per-request timeout (default 20000)
 *   RETRIES                          retries for flaky statuses (default 1; browser-page retries = PLAYWRIGHT_RETRIES)
 *   RETRY_BACKOFF_MS                 base backoff, doubles per attempt (default 400)
 *   ASSET_EXTENSIONS                 comma list that marks a URL as an asset even w/o a tag reference
 *   IGNORE_URL_PATTERNS              comma list of regexes; matching asset URLs are skipped
 *   SKIP_PATH_PREFIXES               comma list of path prefixes the crawler won't follow
 *   INCLUDE_CROSS_ORIGIN_ASSETS      1/true to also audit non-phlabs asset URLs (default off, still recorded)
 *   USER_AGENT / ASSET_USER_AGENT    override UAs
 *   E2E_NO_BROWSER                   1/true disables the Playwright pass
 *   PLAYWRIGHT_PAGE_TIMEOUT_MS       page.goto timeout (default 30000)
 *   PLAYWRIGHT_SETTLE_MS             extra wait after load for lazy assets (default 1500)
 *   PLAYWRIGHT_MAX_PAGES             cap browser pages (default = crawled pages, hard-capped 100)
 *   PLAYWRIGHT_MAX_ASSETS_PER_PAGE   cap per-page asset waiting (default 200)
 *   PLAYWRIGHT_RETRIES               page-level retries for flaky browser failures (default 1)
 *   PLAYWRIGHT_BLOCKLIST             comma regexes for requests to abort in the browser (analytics etc.)
 *   SITEMAP_SEED=1                   seed the crawl frontier from /sitemap.xml (plus loc-derived sitemaps)
 *   E2E_MANIFEST_SEED                1/true to seed assets from HTML-parsed asset-manifest.json (default on)
 *   REPLAY                           replay mode (default off)
 *   ARTIFACT_DIR                     where to write artifacts (default tests/artifacts/e2e-stale-assets/<ts>)
 *   KEEP_ARTIFACT_DAYS               for --prune (default 14)
 *   GITHUB_STEP_SUMMARY              if set, a markdown summary is appended (CI)
 *   E2E_BYPASS_TOKEN                 if set, sent as x-phl-e2e header on every HTML request (Worker lets it through)
 *   E2E_BLOCK_BUDGET_S               mid-run ride-out budget for edge-block windows, seconds (default 480)
 *   E2E_BLOCK_PROBE_INTERVAL_S       seconds between cheap re-probes while riding out a block (default 60)
 *   --prune / --prune-dry-run        CLI flags for artifact retention
 *   --max-pages N --concurrency N --timeout-ms N --no-browser --no-sitemap-seed   CLI overrides
 *
 * Exit code: 0 when no stale assets / browser failures; 2 otherwise (1 = unexpected crash).
 * In REPLAY mode, HTML fetches are replayed as recorded; live revalidation still runs for assets.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

// ---------- env & CLI ----------

const REPLAY = /^1|true$/i.test(process.env.REPLAY || '');
const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(name);
const flagValue = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};

const TARGET = (process.env.TARGET || 'https://phlabs.co.uk').replace(/\/+$/, '');
const MAX_PAGES = Number(flagValue('--max-pages') ?? process.env.MAX_PAGES ?? 400);
const CONCURRENCY = Math.max(1, Number(flagValue('--concurrency') ?? process.env.CONCURRENCY ?? 6));
const TIMEOUT_MS = Math.max(1000, Number(flagValue('--timeout-ms') ?? process.env.TIMEOUT_MS ?? 20000));
const RETRIES = Math.max(0, Number(process.env.RETRIES ?? 1));
const RETRY_BACKOFF_MS = Math.max(0, Number(process.env.RETRY_BACKOFF_MS ?? 400));
const INCLUDE_CROSS_ORIGIN_ASSETS = /^1|true$/i.test(process.env.INCLUDE_CROSS_ORIGIN_ASSETS || '');
const SITEMAP_SEED = /^1|true$/i.test(process.env.SITEMAP_SEED || '') || (!REPLAY && !hasFlag('--no-sitemap-seed') && process.env.SITEMAP_SEED !== '0' && !/^0|false$/i.test(process.env.SITEMAP_SEED || '1'));
const E2E_MANIFEST_SEED = !/^0|false$/i.test(process.env.E2E_MANIFEST_SEED || '1');
const USER_AGENT = process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const ASSET_USER_AGENT = process.env.ASSET_USER_AGENT || USER_AGENT;
const E2E_BYPASS_TOKEN = (process.env.E2E_BYPASS_TOKEN || '').trim();
const NO_BROWSER = hasFlag('--no-browser') || /^1|true$/i.test(process.env.E2E_NO_BROWSER || '');
const PLAYWRIGHT_PAGE_TIMEOUT_MS = Math.max(5000, Number(process.env.PLAYWRIGHT_PAGE_TIMEOUT_MS ?? 30000));
const PLAYWRIGHT_SETTLE_MS = Math.max(0, Number(process.env.PLAYWRIGHT_SETTLE_MS ?? 1500));
const PLAYWRIGHT_MAX_PAGES = Math.max(1, Number(process.env.PLAYWRIGHT_MAX_PAGES ?? 100));
const PLAYWRIGHT_MAX_ASSETS_PER_PAGE = Math.max(10, Number(process.env.PLAYWRIGHT_MAX_ASSETS_PER_PAGE ?? 200));
const PLAYWRIGHT_RETRIES = Math.max(0, Number(process.env.PLAYWRIGHT_RETRIES ?? 1));
const PLAYWRIGHT_BLOCKLIST = (process.env.PLAYWRIGHT_BLOCKLIST || 'googletagmanager\\.com|google-analytics\\.com|analytics\\.google|/api/public/hooks/prerender-recache|posthog|sentry')
  .split(',').map((s) => s.trim()).filter(Boolean).map((s) => { try { return new RegExp(s, 'i'); } catch { return null; } }).filter(Boolean);
const ASSET_EXTENSIONS = new Set((process.env.ASSET_EXTENSIONS || '.js,.mjs,.css,.png,.jpg,.jpeg,.webp,.avif,.gif,.svg,.ico,.woff,.woff2,.ttf,.otf,.mp4,.webm,.json,.xml,.txt,.pdf,.wasm')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
const IGNORE_URL_PATTERNS = (process.env.IGNORE_URL_PATTERNS || '')
  .split(',').map((s) => s.trim()).filter(Boolean).map((s) => { try { return new RegExp(s); } catch { console.warn(`[warn] bad IGNORE_URL_PATTERNS regex ignored: ${s}`); return null; } }).filter(Boolean);
const SKIP_PATH_PREFIXES = (process.env.SKIP_PATH_PREFIXES || '/cdn-cgi,/api/,/go/,/r/')
  .split(',').map((s) => s.trim()).filter(Boolean);
const PRUNE = hasFlag('--prune');
const PRUNE_DRY_RUN = hasFlag('--prune-dry-run') || hasFlag('--dry-run');
const KEEP_ARTIFACT_DAYS = Math.max(1, Number(process.env.KEEP_ARTIFACT_DAYS ?? 14));

const ARTIFACT_ROOT = path.resolve('tests/artifacts/e2e-stale-assets');
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const ARTIFACT_DIR = path.resolve(process.env.ARTIFACT_DIR || path.join(ARTIFACT_ROOT, RUN_ID));
const LATEST_LINK = path.join(ARTIFACT_ROOT, 'latest');

// ---------- mid-run edge-block budget ----------
// When the origin/Lovable edge starts answering 401/403/503 mid-run (credential
// scanning storms, origin WAF), a browser reload just re-hits the same wall and
// the scenario skips — which is exactly the noon flake this budget exists to
// absorb. Instead of skipping immediately, we wait and re-probe with cheap
// node-side fetches (no browser) until the edge clears or the shared budget is
// gone. The budget is shared across ALL scenarios in the run: it is a property
// of the edge window, not of any one scenario. Budget only ever decreases, so
// this always terminates. If it runs out we fall back to the old behaviour —
// skip with a visible ::warning and fail the run. Never a false green.
const BLOCK_BUDGET_MS = Math.max(0, Number(process.env.E2E_BLOCK_BUDGET_S ?? 480) * 1000);
const BLOCK_PROBE_INTERVAL_MS = Math.max(250, Number(process.env.E2E_BLOCK_PROBE_INTERVAL_S ?? 60) * 1000);
let blockBudgetLeftMs = BLOCK_BUDGET_MS;

async function waitForEdgeUnblock() {
  if (blockBudgetLeftMs <= 0) return false;
  console.warn(`[block-wait] mid-run edge block — riding it out (budget: ${Math.round(blockBudgetLeftMs / 1000)}s, probe every ≤60s)`);
  while (blockBudgetLeftMs > 0) {
    const t0 = Date.now();
    await sleep(Math.min(BLOCK_PROBE_INTERVAL_MS, blockBudgetLeftMs));
    let blocked = true;
    try {
      const resp = await fetch(TARGET, {
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
        headers: {
          'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'accept': 'text/html,application/xhtml+xml',
          ...(E2E_BYPASS_TOKEN ? { 'x-phl-e2e': E2E_BYPASS_TOKEN } : {}),
        },
      });
      blocked = [401, 403, 503].includes(resp.status);
    } catch (e) {
      console.warn(`[block-wait] re-probe threw: ${e?.message || e}`);
    }
    const spent = Date.now() - t0;
    blockBudgetLeftMs = Math.max(0, blockBudgetLeftMs - spent);
    if (!blocked) {
      console.warn(`[block-wait] edge clear after spending ~${Math.round(spent / 1000)}s of budget (${Math.round(blockBudgetLeftMs / 1000)}s left) — resuming scenarios`);
      return true;
    }
  }
  console.warn('[block-wait] budget exhausted — remaining scenarios will skip (run fails visibly, never a false green)');
  return false;
}

const nowIso = () => new Date().toISOString();
const rel = (p) => path.relative(process.cwd(), p);

function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function appendJsonLine(file, obj) {
  fs.appendFileSync(file, JSON.stringify(obj) + '\n');
}

function xmlEscape(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

// ---------- URL helpers ----------

const ASSET_EXT_RE = /\.(js|mjs|css|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|mp4|webm|json|xml|txt|pdf|wasm)([?#].*)?$/i;

function isAssetUrl(u) {
  try {
    const p = new URL(u).pathname.toLowerCase();
    if (ASSET_EXT_RE.test(p)) return true;
    for (const ext of ASSET_EXTENSIONS) if (p.endsWith(ext)) return true;
    return false;
  } catch {
    return false;
  }
}

function isProbablyHtml(url, contentType) {
  if (contentType && /text\/html/i.test(contentType)) return true;
  if (contentType && !/text\/html/i.test(contentType)) return false;
  try {
    const p = new URL(url).pathname;
    if (isAssetUrl(url)) return false;
    return !/\.[a-z0-9]{2,5}$/i.test(p) || /\.(html?|php)$/i.test(p);
  } catch {
    return false;
  }
}

function normalizeUrl(raw, base) {
  try {
    const u = new URL(raw, base);
    u.hash = '';
    // drop tracking noise so the frontier doesn't explode
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|_hsenc$|_hsmi$|ref$)/i.test(key)) u.searchParams.delete(key);
    }
    if (u.pathname !== '/' && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
    return u.toString();
  } catch {
    return null;
  }
}

function isSkippablePath(u) {
  try {
    const p = new URL(u).pathname;
    return SKIP_PATH_PREFIXES.some((prefix) => p.startsWith(prefix));
  } catch {
    return true;
  }
}

function isSameOrigin(u) {
  try {
    return new URL(u).origin === new URL(TARGET).origin;
  } catch {
    return false;
  }
}

// ---------- extraction ----------

const HREF_SRC_RE = /\b(?:href|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
const SRCSET_RE = /\bsrcset\s*=\s*("([^"]*)"|'([^']*)')/gi;
const META_REFRESH_RE = /<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'][^"']*url\s*=\s*([^"'>]+)["']/gi;
const IMPORT_RE = /\b(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
const CSS_URL_RE = /\burl\(\s*(['"]?)([^'")]+)\1\s*\)/g;

function extractUrlsFromHtml(html, pageUrl) {
  const links = new Set();
  const assets = new Set();
  let m;
  HREF_SRC_RE.lastIndex = 0;
  while ((m = HREF_SRC_RE.exec(html))) {
    const raw = m[2] ?? m[3] ?? m[4];
    if (!raw || raw.startsWith('data:') || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) continue;
    const abs = normalizeUrl(raw, pageUrl);
    if (!abs) continue;
    if (isAssetUrl(abs)) assets.add(abs);
    else if (isSameOrigin(abs)) links.add(abs);
  }
  SRCSET_RE.lastIndex = 0;
  while ((m = SRCSET_RE.exec(html))) {
    const raw = m[2] ?? m[3];
    if (!raw) continue;
    for (const candidate of raw.split(',')) {
      const urlPart = candidate.trim().split(/\s+/)[0];
      if (!urlPart || urlPart.startsWith('data:')) continue;
      const abs = normalizeUrl(urlPart, pageUrl);
      if (abs) assets.add(abs);
    }
  }
  META_REFRESH_RE.lastIndex = 0;
  while ((m = META_REFRESH_RE.exec(html))) {
    const abs = normalizeUrl(m[1].trim(), pageUrl);
    if (abs && isSameOrigin(abs)) links.add(abs);
  }
  return { links: [...links], assets: [...assets] };
}

function extractUrlsFromJs(jsText, baseUrl) {
  const out = new Set();
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(jsText))) {
    const abs = normalizeUrl(m[1], baseUrl);
    if (abs && isSameOrigin(abs)) out.add(abs);
  }
  DYNAMIC_IMPORT_RE.lastIndex = 0;
  while ((m = DYNAMIC_IMPORT_RE.exec(jsText))) {
    const abs = normalizeUrl(m[1], baseUrl);
    if (abs && isSameOrigin(abs)) out.add(abs);
  }
  return [...out];
}

function extractUrlsFromCss(cssText, baseUrl) {
  const out = new Set();
  let m;
  CSS_URL_RE.lastIndex = 0;
  while ((m = CSS_URL_RE.exec(cssText))) {
    const raw = m[2];
    if (!raw || raw.startsWith('data:') || raw.startsWith('#')) continue;
    const abs = normalizeUrl(raw, baseUrl);
    if (abs) out.add(abs);
  }
  return [...out];
}

// ---------- asset-manifest.json seeding ----------
// Lovable/Vite builds emit asset-manifest.json mapping logical names → built
// files. HTML <script>/<link> extraction already catches the entry points, but
// lazy chunks only appear via dynamic import(). Parsing those out of minified
// JS is brittle; the manifest lists them directly. Best-effort: any failure
// just skips the seed.

async function seedFromManifest() {
  if (!E2E_MANIFEST_SEED || REPLAY) return [];
  const candidates = [`${TARGET}/asset-manifest.json`, `${TARGET}/assets/asset-manifest.json`];
  for (const url of candidates) {
    try {
      const resp = await fetchWithRetry(url, {
        headers: { 'user-agent': ASSET_USER_AGENT, accept: 'application/json' },
      });
      if (!resp.ok) continue;
      const json = await resp.json().catch(() => null);
      const files = json && typeof json === 'object' ? (json.files || json) : null;
      if (!files || typeof files !== 'object') continue;
      const found = [];
      for (const v of Object.values(files)) {
        if (typeof v !== 'string') continue;
        const abs = normalizeUrl(v, url);
        if (abs && isSameOrigin(abs) && isAssetUrl(abs)) found.push(abs);
      }
      if (found.length) {
        console.log(`[seed] asset-manifest ${url} → ${found.length} assets`);
        return found;
      }
    } catch (e) {
      console.warn(`[seed] asset-manifest ${url} failed: ${e?.message || e}`);
    }
  }
  return [];
}

// ---------- fetch wrapper with retry ----------

const FLAKY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

class WafBlockedError extends Error {
  constructor(url, status) {
    super(`edge/WAF blocked (${status}) ${url}`);
    this.name = 'WafBlockedError';
    this.status = status;
    this.url = url;
    this.wafBlocked = true;
  }
}

async function fetchOnce(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout ?? TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const resp = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      ...opts,
      headers: {
        'user-agent': opts.asset ? ASSET_USER_AGENT : USER_AGENT,
        accept: opts.asset ? '*/*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...(opts.referer ? { referer: opts.referer } : {}),
        ...(E2E_BYPASS_TOKEN && !opts.asset ? { 'x-phl-e2e': E2E_BYPASS_TOKEN } : {}),
        ...(opts.headers || {}),
      },
    });
    return { resp, durationMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url, opts = {}) {
  const maxAttempts = 1 + (opts.retries ?? RETRIES);
  let last;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { resp, durationMs } = await fetchOnce(url, opts);
      // Never retry a hard WAF block — waiting won't help within one request
      // and the scenario-level handler needs to see it immediately.
      if (resp.status === 401 || resp.status === 403) throw new WafBlockedError(url, resp.status);
      if (FLAKY_STATUSES.has(resp.status) && attempt < maxAttempts - 1) {
        last = { status: resp.status, durationMs };
        await sleep(RETRY_BACKOFF_MS * 2 ** attempt);
        continue;
      }
      return { resp, durationMs, attempts: attempt + 1 };
    } catch (e) {
      if (e instanceof WafBlockedError) throw e;
      last = { error: e };
      if (attempt < maxAttempts - 1) {
        await sleep(RETRY_BACKOFF_MS * 2 ** attempt);
        continue;
      }
      throw e;
    }
  }
  // unreachable in practice, keeps TS-style linters calm
  throw last?.error || new Error(`fetch failed for ${url} (status ${last?.status ?? 'n/a'})`);
}

// ---------- crawler ----------

async function readSitemaps() {
  const seeds = new Set();
  const queue = [`${TARGET}/sitemap.xml`];
  const seen = new Set();
  while (queue.length && seen.size < 25) {
    const sm = queue.shift();
    if (!sm || seen.has(sm)) continue;
    seen.add(sm);
    try {
      const { resp } = await fetchWithRetry(sm, { headers: { accept: 'application/xml,text/xml,*/*' } });
      if (!resp.ok) continue;
      const xml = await resp.text();
      const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim());
      for (const loc of locs) {
        if (loc.endsWith('.xml')) {
          if (!seen.has(loc)) queue.push(loc);
          continue;
        }
        const abs = normalizeUrl(loc, TARGET);
        if (abs && isSameOrigin(abs) && !isSkippablePath(abs)) seeds.add(abs);
      }
    } catch (e) {
      console.warn(`[sitemap] ${sm} failed: ${e?.message || e}`);
    }
  }
  return [...seeds];
}

async function crawl() {
  const frontier = [];
  const queued = new Set();
  const pages = new Map(); // url -> { status, contentType, durationMs, assets[], links[] }

  const seed = (u) => {
    const abs = normalizeUrl(u, TARGET);
    if (!abs || !isSameOrigin(abs) || isSkippablePath(abs) || queued.has(abs)) return;
    queued.add(abs);
    frontier.push(abs);
  };

  seed(TARGET);
  if (SITEMAP_SEED) {
    const smSeeds = await readSitemaps();
    console.log(`[sitemap] seeded ${smSeeds.length} URLs`);
    smSeeds.forEach(seed);
  }

  const requestsLog = path.join(ARTIFACT_DIR, 'requests.ndjson');
  const responsesLog = path.join(ARTIFACT_DIR, 'responses.ndjson');

  async function worker() {
    while (frontier.length && pages.size < MAX_PAGES) {
      const url = frontier.shift();
      if (!url || pages.has(url)) continue;
      appendJsonLine(requestsLog, { ts: nowIso(), type: 'page', url });
      let entry;
      try {
        const { resp, durationMs, attempts } = await fetchWithRetry(url, { retries: RETRIES });
        const contentType = resp.headers.get('content-type') || '';
        entry = { url, status: resp.status, contentType, durationMs, attempts, assets: [], links: [] };
        if (resp.ok && isProbablyHtml(url, contentType)) {
          const html = await resp.text();
          const { links, assets } = extractUrlsFromHtml(html, url);
          entry.assets = assets;
          entry.links = links;
          for (const link of links) seed(link);
        } else {
          await resp.arrayBuffer().catch(() => {});
        }
      } catch (e) {
        entry = { url, status: 0, error: String(e?.message || e), assets: [], links: [] };
      }
      pages.set(url, entry);
      appendJsonLine(responsesLog, { ts: nowIso(), type: 'page', ...entry, links: entry.links.length, assets: entry.assets.length });
      if (pages.size % 25 === 0) console.log(`[crawl] ${pages.size}/${MAX_PAGES} pages, frontier ${frontier.length}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return pages;
}

// ---------- asset audit ----------

function collectAssets(pages, extraSeeds = []) {
  const assetMap = new Map(); // url -> { referers: Set, crossOrigin: bool }
  const addAsset = (rawUrl, referer) => {
    const abs = normalizeUrl(rawUrl, referer);
    if (!abs || !isAssetUrl(abs)) return;
    if (IGNORE_URL_PATTERNS.some((re) => re.test(abs))) return;
    const sameOrigin = isSameOrigin(abs);
    if (!sameOrigin && !INCLUDE_CROSS_ORIGIN_ASSETS) {
      // recorded for visibility, not audited
    }
    if (!assetMap.has(abs)) assetMap.set(abs, { referers: new Set(), crossOrigin: !sameOrigin });
    assetMap.get(abs).referers.add(referer);
  };
  for (const [pageUrl, entry] of pages) {
    for (const a of entry.assets || []) addAsset(a, pageUrl);
  }
  for (const a of extraSeeds) addAsset(a, TARGET);
  return assetMap;
}

async function auditAssets(assetMap, pagesOk) {
  const results = [];
  const requestsLog = path.join(ARTIFACT_DIR, 'requests.ndjson');
  const responsesLog = path.join(ARTIFACT_DIR, 'responses.ndjson');
  const urls = [...assetMap.keys()];
  let idx = 0;
  let audited = 0;
  let skippedCross = 0;

  async function worker() {
    while (idx < urls.length) {
      const url = urls[idx++];
      const meta = assetMap.get(url);
      if (meta.crossOrigin && !INCLUDE_CROSS_ORIGIN_ASSETS) {
        skippedCross++;
        results.push({ url, status: 'skipped-cross-origin', referers: [...meta.referers].slice(0, 5) });
        continue;
      }
      const referer = [...meta.referers][0] || TARGET;
      appendJsonLine(requestsLog, { ts: nowIso(), type: 'asset', url, referer });
      let row;
      try {
        const { resp, durationMs, attempts } = await fetchWithRetry(url, {
          asset: true,
          referer,
          retries: RETRIES,
          headers: {
            accept: url.match(/\.css(\?|$)/i) ? 'text/css,*/*;q=0.1'
              : url.match(/\.(png|jpe?g|webp|avif|gif|svg|ico)(\?|$)/i) ? 'image/avif,image/webp,image/*,*/*;q=0.8'
              : url.match(/\.(woff2?|ttf|otf)(\?|$)/i) ? 'font/woff2,font/*,*/*;q=0.8'
              : '*/*',
          },
        });
        row = {
          url,
          status: resp.status,
          ok: resp.ok,
          contentType: resp.headers.get('content-type') || '',
          contentLength: Number(resp.headers.get('content-length') || 0) || undefined,
          durationMs,
          attempts,
          referers: [...meta.referers].slice(0, 5),
        };
        await resp.arrayBuffer().catch(() => {});
      } catch (e) {
        row = { url, status: 0, ok: false, error: String(e?.message || e), referers: [...meta.referers].slice(0, 5) };
      }
      results.push(row);
      appendJsonLine(responsesLog, { ts: nowIso(), type: 'asset', ...row });
      if (++audited % 50 === 0) console.log(`[assets] ${audited}/${urls.length}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const stale = results.filter((r) => r.status !== 'skipped-cross-origin' && !r.ok);
  return { results, stale, skippedCross, total: urls.length, pagesOk };
}

// ---------- CSS deep-dive (url() references) ----------

async function auditCssInternals(assetRows) {
  const cssRows = assetRows.filter((r) => r.ok && /text\/css/i.test(r.contentType || '') || (r.ok && /\.css(\?|$)/i.test(r.url)));
  const nested = new Map();
  for (const row of cssRows) {
    try {
      const { resp } = await fetchWithRetry(row.url, { asset: true, referer: TARGET });
      if (!resp.ok) continue;
      const css = await resp.text();
      for (const u of extractUrlsFromCss(css, row.url)) {
        if (IGNORE_URL_PATTERNS.some((re) => re.test(u))) continue;
        if (!nested.has(u)) nested.set(u, { referers: new Set([row.url]), crossOrigin: !isSameOrigin(u) });
      }
    } catch (e) {
      console.warn(`[css] ${row.url}: ${e?.message || e}`);
    }
  }
  if (!nested.size) return { results: [], stale: [] };
  const fakeMap = new Map([...nested.entries()].map(([u, m]) => [u, m]));
  const { results, stale } = await auditAssets(fakeMap, true);
  return { results, stale };
}

// ---------- replay mode ----------

async function replay() {
  // Find the most recent run dir (or ARTIFACT_DIR if it has requests.ndjson)
  let srcDir = ARTIFACT_DIR;
  if (!fs.existsSync(path.join(srcDir, 'requests.ndjson'))) {
    const dirs = fs.readdirSync(ARTIFACT_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d{4}-/.test(d.name))
      .map((d) => d.name).sort().reverse();
    const found = dirs.find((d) => fs.existsSync(path.join(ARTIFACT_ROOT, d, 'requests.ndjson')));
    if (!found) throw new Error(`REPLAY: no requests.ndjson found under ${rel(ARTIFACT_ROOT)}`);
    srcDir = path.join(ARTIFACT_ROOT, found);
  }
  console.log(`[replay] source: ${rel(srcDir)}`);
  const lines = fs.readFileSync(path.join(srcDir, 'requests.ndjson'), 'utf8').split('\n').filter(Boolean);
  const recorded = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const assetUrls = recorded.filter((r) => r.type === 'asset').map((r) => ({ url: r.url, referer: r.referer }));
  console.log(`[replay] ${assetUrls.length} recorded asset requests`);

  const assetMap = new Map();
  for (const { url, referer } of assetUrls) {
    if (IGNORE_URL_PATTERNS.some((re) => re.test(url))) continue;
    if (!assetMap.has(url)) assetMap.set(url, { referers: new Set([referer || TARGET]), crossOrigin: !isSameOrigin(url) });
  }
  return auditAssets(assetMap, true);
}

// ---------- artifact pruning ----------

async function pruneArtifacts() {
  if (!PRUNE) return;
  const cutoff = Date.now() - KEEP_ARTIFACT_DAYS * 24 * 3600 * 1000;
  const dirs = fs.readdirSync(ARTIFACT_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-/.test(d.name));
  let removed = 0;
  for (const d of dirs) {
    const dir = path.join(ARTIFACT_ROOT, d.name);
    const ts = Date.parse(d.name.replace(/-/g, (m, off) => (off === 10 || off === 13 ? ':' : off > 16 ? '' : m)));
    const stat = fs.statSync(dir);
    const ageMs = Date.now() - stat.mtimeMs;
    const oldEnough = !Number.isNaN(ts) ? ts < cutoff : ageMs > KEEP_ARTIFACT_DAYS * 24 * 3600 * 1000;
    if (oldEnough) {
      if (PRUNE_DRY_RUN) {
        console.log(`[prune-dry-run] would remove ${rel(dir)}`);
      } else {
        await fsp.rm(dir, { recursive: true, force: true });
        console.log(`[prune] removed ${rel(dir)}`);
      }
      removed++;
    }
  }
  console.log(`[prune] ${PRUNE_DRY_RUN ? 'would remove' : 'removed'} ${removed} run dirs (keep ${KEEP_ARTIFACT_DAYS}d)`);
}

// ---------- reporting ----------

function writeReports({ pages, assetResults, staleAssets, browserReport, startedAt, extra = {} }) {
  const summary = {
    target: TARGET,
    mode: REPLAY ? 'replay' : 'live',
    startedAt,
    finishedAt: nowIso(),
    pages: pages ? pages.size : extra.pagesCount ?? 0,
    pagesOk: pages ? [...pages.values()].filter((p) => p.status >= 200 && p.status < 400).length : undefined,
    assetsTotal: assetResults.length,
    assetsStale: staleAssets.length,
    browser: browserReport ? {
      pagesVisited: browserReport.pagesVisited,
      failures: browserReport.failures.length,
      consoleErrors: browserReport.consoleErrors.length,
    } : undefined,
    ...extra,
  };

  const reportJson = { summary, staleAssets, browser: browserReport || undefined };
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'report.json'), JSON.stringify(reportJson, null, 2));

  const lines = [];
  lines.push(`# e2e-stale-assets — ${summary.finishedAt}`);
  lines.push(`target: ${TARGET} | mode: ${summary.mode}`);
  lines.push(`pages: ${summary.pages}${summary.pagesOk != null ? ` (${summary.pagesOk} ok)` : ''} | assets: ${summary.assetsTotal} | stale: ${summary.assetsStale}`);
  if (browserReport) lines.push(`browser pages: ${browserReport.pagesVisited} | browser failures: ${browserReport.failures.length} | console errors: ${browserReport.consoleErrors.length}`);
  lines.push('');
  if (staleAssets.length) {
    lines.push('## Stale assets (what a real visitor would hit as broken)');
    for (const s of staleAssets) {
      lines.push(`- [${s.status || 'ERR'}] ${s.url}`);
      if (s.error) lines.push(`  error: ${s.error}`);
      if (s.referers?.length) lines.push(`  referenced from: ${s.referers.join(', ')}`);
    }
    lines.push('');
  }
  if (browserReport?.failures?.length) {
    lines.push('## Browser-detected failures (JS-injected / runtime requests)');
    for (const f of browserReport.failures) {
      lines.push(`- [${f.status || 'ERR'}] ${f.url}  (page: ${f.page})`);
      if (f.errorText) lines.push(`  ${f.errorText}`);
    }
    lines.push('');
  }
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'report.txt'), lines.join('\n'));

  // JUnit for CI annotations
  const testcaseFail = staleAssets.map((s, i) => `  <testcase classname="stale-assets" name="asset ${i + 1}: ${xmlEscape(s.url)}"><failure message="status ${s.status || 'ERR'}">${xmlEscape(s.error || `HTTP ${s.status}`)}</failure></testcase>`);
  const browserFails = (browserReport?.failures || []).map((f, i) => `  <testcase classname="browser-assets" name="browser ${i + 1}: ${xmlEscape(f.url)}"><failure message="status ${f.status || 'ERR'}">${xmlEscape(f.errorText || `HTTP ${f.status}`)} (page ${xmlEscape(f.page)})</failure></testcase>`);
  const totalTests = 1 + staleAssets.length + browserFails.length;
  const junit = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="e2e-stale-assets" tests="${totalTests}" failures="${staleAssets.length + browserFails.length}" time="${((Date.now() - Date.parse(startedAt)) / 1000).toFixed(1)}">
  <testcase classname="crawl" name="site crawl + asset inventory"/>
${testcaseFail.join('\n')}
${browserFails.join('\n')}
</testsuite>
`;
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'junit.xml'), junit);

  // console.ndjson placeholder so all artifact sets have the same shape
  if (!fs.existsSync(path.join(ARTIFACT_DIR, 'console.ndjson'))) fs.writeFileSync(path.join(ARTIFACT_DIR, 'console.ndjson'), '');

  // latest symlink (best-effort; Windows checkouts just skip)
  try {
    fs.rmSync(LATEST_LINK, { force: true, recursive: true });
    fs.symlinkSync(path.basename(ARTIFACT_DIR), LATEST_LINK, 'dir');
  } catch { /* optional */ }

  return summary;
}

function writeGithubSummary(summary, staleAssets, browserReport) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const md = [];
  md.push(`## e2e-stale-assets`);
  md.push('');
  md.push(`| metric | value |`);
  md.push(`|---|---|`);
  md.push(`| target | ${TARGET} |`);
  md.push(`| mode | ${summary.mode} |`);
  md.push(`| pages crawled | ${summary.pages} |`);
  md.push(`| assets audited | ${summary.assetsTotal} |`);
  md.push(`| stale assets | **${summary.assetsStale}** |`);
  if (browserReport) {
    md.push(`| browser pages | ${browserReport.pagesVisited} |`);
    md.push(`| browser failures | **${browserReport.failures.length}** |`);
  }
  if (staleAssets.length) {
    md.push('');
    md.push(`<details><summary>stale assets (${staleAssets.length})</summary>`);
    md.push('');
    for (const s of staleAssets.slice(0, 50)) md.push(`- \`${s.status || 'ERR'}\` ${s.url}`);
    if (staleAssets.length > 50) md.push(`- …and ${staleAssets.length - 50} more (see report.txt)`);
    md.push('');
    md.push(`</details>`);
  }
  md.push('');
  md.push(`Artifacts: \`${rel(ARTIFACT_DIR)}\``);
  fs.appendFileSync(file, md.join('\n') + '\n');
}

// ---------- playwright browser pass ----------

async function playwrightPass(pageUrls) {
  if (NO_BROWSER || REPLAY) return null;
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.warn('[browser] playwright not available — skipping browser pass');
    return null;
  }

  const urls = pageUrls.slice(0, PLAYWRIGHT_MAX_PAGES);
  const failures = [];
  const consoleErrors = [];
  const seenRequests = new Set();
  let pagesVisited = 0;

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: E2E_BYPASS_TOKEN ? { 'x-phl-e2e': E2E_BYPASS_TOKEN } : {},
    });
    // Abort analytics/monitoring noise so it can't flake the run.
    await context.route('**/*', (route) => {
      const u = route.request().url();
      if (PLAYWRIGHT_BLOCKLIST.some((re) => re.test(u))) return route.abort().catch(() => {});
      return route.continue().catch(() => {});
    });

    for (const pageUrl of urls) {
      let attempt = 0;
      let pageFailed = false;
      while (attempt <= PLAYWRIGHT_RETRIES) {
        attempt++;
        const page = await context.newPage();
        const pageFailures = [];
        page.on('requestfailed', (req) => {
          const u = req.url();
          if (PLAYWRIGHT_BLOCKLIST.some((re) => re.test(u))) return;
          if (seenRequests.has(`fail:${u}`)) return;
          seenRequests.add(`fail:${u}`);
          pageFailures.push({ page: pageUrl, url: u, status: 0, errorText: req.failure()?.errorText || 'request failed' });
        });
        page.on('response', (resp) => {
          const u = resp.url();
          if (PLAYWRIGHT_BLOCKLIST.some((re) => re.test(u))) return;
          if (resp.status() < 400) return;
          if (!isAssetUrl(u) && resp.request().resourceType() !== 'document') return;
          if (seenRequests.has(`resp:${u}:${resp.status()}`)) return;
          seenRequests.add(`resp:${u}:${resp.status()}`);
          pageFailures.push({ page: pageUrl, url: u, status: resp.status(), errorText: `${resp.status()} ${resp.statusText()}` });
        });
        page.on('console', (msg) => {
          if (msg.type() === 'error') consoleErrors.push({ page: pageUrl, text: msg.text().slice(0, 500) });
        });
        try {
          const resp = await page.goto(pageUrl, { timeout: PLAYWRIGHT_PAGE_TIMEOUT_MS, waitUntil: 'load' });
          if (resp && (resp.status() === 401 || resp.status() === 403)) {
            throw new WafBlockedError(pageUrl, resp.status());
          }
          if (PLAYWRIGHT_SETTLE_MS > 0) await page.waitForTimeout(PLAYWRIGHT_SETTLE_MS);
          // cap: stop waiting for stragglers
          await page.close();
          pagesVisited++;
          failures.push(...pageFailures.slice(0, PLAYWRIGHT_MAX_ASSETS_PER_PAGE));
          pageFailed = false;
          break;
        } catch (e) {
          await page.close().catch(() => {});
          if (e instanceof WafBlockedError) {
            // ride out the edge block, then retry the page via the normal loop
            if (await waitForEdgeUnblock()) {
              console.warn(`[retry] browser pass: edge block cleared — retrying ${pageUrl}`);
              attempt--;
              continue;
            }
            failures.push({ page: pageUrl, url: pageUrl, status: e.status, errorText: `edge block outlasted ride-out budget: ${e.message}` });
            pageFailed = true;
            break;
          }
          pageFailed = true;
          if (attempt <= PLAYWRIGHT_RETRIES) {
            await sleep(RETRY_BACKOFF_MS * 2 ** (attempt - 1));
            continue;
          }
          failures.push({ page: pageUrl, url: pageUrl, status: 0, errorText: `page load failed after ${attempt} attempt(s): ${e?.message || e}` });
        }
      }
      if (pageFailed) console.warn(`[browser] page failed: ${pageUrl}`);
    }
    await context.close();
  } finally {
    await browser.close().catch(() => {});
  }
  return { pagesVisited, failures, consoleErrors };
}

// ---------- main ----------

async function main() {
  const startedAt = nowIso();
  ensureDirSync(ARTIFACT_DIR);
  console.log(`[e2e-stale-assets] target=${TARGET} mode=${REPLAY ? 'replay' : 'live'} concurrency=${CONCURRENCY} browser=${NO_BROWSER ? 'off' : 'on'}`);
  console.log(`[e2e-stale-assets] artifacts → ${rel(ARTIFACT_DIR)}`);

  let pages = null;
  let assetResults = [];
  let staleAssets = [];
  let browserReport = null;

  if (REPLAY) {
    const { results, stale } = await replay();
    assetResults = results;
    staleAssets = stale;
  } else {
    pages = await crawl();
    console.log(`[crawl] done: ${pages.size} pages`);

    // WAF preflight: if the origin is already blocking before we burn a
    // browser launch, ride out the block window with the shared budget first.
    // Historical windows last 3–9 minutes; waits at 0/60/120/180s cover the
    // common case and defer to the shared budget for the rest.
    const wafPreflight = async () => {
      const waits = [0, 60_000, 120_000, 180_000];
      for (let i = 0; i < waits.length; i++) {
        if (waits[i]) {
          console.warn(`[waf] preflight blocked — waiting ${waits[i] / 1000}s before retry ${i}/${waits.length - 1}`);
          await sleep(waits[i]);
        }
        try {
          await fetchWithRetry(TARGET, { retries: 0 });
          return true;
        } catch (e) {
          if (!(e instanceof WafBlockedError)) throw e;
        }
      }
      return false;
    };
    const preflightOk = await wafPreflight();
    if (!preflightOk) {
      console.warn('[waf] origin still blocking after preflight — running asset audit only (browser pass skipped, run still fails on stale assets)');
    }

    const manifestSeeds = await seedFromManifest();
    const assetMap = collectAssets(pages, manifestSeeds);
    console.log(`[assets] ${assetMap.size} unique asset URLs (${manifestSeeds.length} from manifest)`);
    const audit = await auditAssets(assetMap, true);
    assetResults = audit.results;
    staleAssets = audit.stale;

    // CSS deep-dive: url() references inside stylesheets (fonts/bg images)
    const cssDeep = await auditCssInternals(assetResults);
    if (cssDeep.results.length) {
      assetResults = assetResults.concat(cssDeep.results);
      staleAssets = staleAssets.concat(cssDeep.stale);
      console.log(`[css] deep-dive audited ${cssDeep.results.length} nested refs, ${cssDeep.stale.length} stale`);
    }

    if (preflightOk) {
      const pageUrls = [...pages.entries()]
        .filter(([, e]) => e.status >= 200 && e.status < 400)
        .map(([u]) => u);
      console.log(`[browser] visiting ${Math.min(pageUrls.length, PLAYWRIGHT_MAX_PAGES)} pages with Chromium…`);
      browserReport = await playwrightPass(pageUrls);
      if (browserReport) {
        console.log(`[browser] done: ${browserReport.pagesVisited} pages, ${browserReport.failures.length} failures, ${browserReport.consoleErrors.length} console errors`);
        for (const ce of browserReport.consoleErrors.slice(0, 200)) {
          appendJsonLine(path.join(ARTIFACT_DIR, 'console.ndjson'), { ts: nowIso(), ...ce });
        }
      }
    }
  }

  const summary = writeReports({ pages, assetResults, staleAssets, browserReport, startedAt });
  writeGithubSummary(summary, staleAssets, browserReport);
  await pruneArtifacts();

  const browserFailures = browserReport?.failures?.length || 0;
  if (staleAssets.length || browserFailures) {
    console.error(`\nFAIL: ${staleAssets.length} stale asset(s), ${browserFailures} browser failure(s). See ${rel(path.join(ARTIFACT_DIR, 'report.txt'))}`);
    process.exit(2);
  }
  console.log(`\nOK: no stale assets (${summary.assetsTotal} audited across ${summary.pages} pages${browserReport ? `, ${browserReport.pagesVisited} browser-checked` : ''}).`);
}

main().catch((e) => {
  console.error(`[fatal] ${e?.stack || e}`);
  process.exit(1);
});
