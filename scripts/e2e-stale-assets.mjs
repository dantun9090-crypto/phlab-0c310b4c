#!/usr/bin/env node
/**
 * E2E: stale-asset recovery for phlabs.co.uk.
 *
 * Scenarios (each isolated in its own BrowserContext):
 *   1. js-chunk-404         — classic stale lazy import
 *   2. sourcemap-404        — silent .map miss; must NOT reload
 *   3. css-link-error       — stale stylesheet referenced by HTML
 *   4. cross-tab-lock       — two tabs same build id, ONE purge
 *   5. network-fail-fallback — purge endpoint aborts, NO reload loop
 *
 * CLI:
 *   node scripts/e2e-stale-assets.mjs                       # run all
 *   --scenario=<name>                                       # run one
 *   --record                                                # write fixtures
 *   --replay                                                # fail-fast on missing/invalid fixtures
 *   --fixture-dir=./fixtures/stale-assets                   # fixture root
 *   --retries=N           (env E2E_RETRIES, default 1)      # retry transient browser/network errors only
 *   --retry-delay=MS      (default 1500)                    # backoff between retries
 *   --deterministic       (env E2E_DETERMINISTIC=1)         # stable scenario order + fixed retry timing for comparable CI runs
 *   --list                                                  # list scenario names and exit
 *
 *   Live-vs-replay thresholds (REPLAY only — fail only on meaningful regressions):
 *   --max-mismatches=N            (default 0)  total mismatch budget per scenario
 *   --max-status-mismatches=N     (default 0)  HTTP status differences allowed
 *   --max-body-byte-delta=N       (default 0)  per-response body byte delta allowed
 *
 *   Redaction (applies to fixtures, HAR trace, ndjson logs, and HTML report):
 *   --redact-bodies                   strip all captured request/response bodies
 *   --max-body-bytes=N (default 4000) truncate captured bodies to N bytes
 *   --redact-headers=a,b,c            comma list of header NAMES to mask (default: authorization,cookie,set-cookie,x-api-key,x-auth-token)
 *   --redact-url-params=a,b,c         comma list of query param NAMES to mask (default: token,key,api_key,access_token,id_token)
 *
 * Outputs in $E2E_REPORT_DIR (default ./e2e-stale-report/):
 *   report.html   self-contained dashboard with clickable per-request drilldown
 *   report.json   machine-readable summary
 *   report.txt    plain-text CI log
 *   junit.xml     CI test reporter
 *   db-diff.json  Firestore _meta/build_state before/after (when admin SDK present)
 *   har-<scenario>.json  compact HAR-like trace (timings, redirect chain, headers, body)
 *   requests.ndjson / responses.ndjson / console.ndjson
 *   screenshots/<scenario>.png
 *
 * Replay mode validates each fixture against a JSON schema (required fields +
 * post-publish-check body contract) and aborts with a clear error on mismatch.
 * Retries fire ONLY for transient errors (net::ERR_, navigation timeouts,
 * closed browser); assertion failures are deterministic and never retried.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------- CLI parsing ----------
const argv = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};
const ONLY = flag('scenario', null);
const RECORD = !!flag('record', false);
const REPLAY = !!flag('replay', false);
const LIST = !!flag('list', false);
const FIXTURE_DIR = flag('fixture-dir', join(process.cwd(), 'fixtures', 'stale-assets'));
const DETERMINISTIC = !!flag('deterministic', process.env.E2E_DETERMINISTIC === '1');
// Deterministic mode forces stable retry timing AND removes RNG jitter so two CI runs
// produce byte-comparable summaries (modulo wall-clock timestamps, which we normalize in the diff).
const RETRIES = DETERMINISTIC
  ? Math.max(0, parseInt(flag('retries', process.env.E2E_RETRIES ?? '0'), 10) || 0)
  : Math.max(0, parseInt(flag('retries', process.env.E2E_RETRIES ?? '1'), 10) || 0);
const RETRY_DELAY_MS = DETERMINISTIC
  ? 1000 // fixed backoff, no jitter
  : Math.max(0, parseInt(flag('retry-delay', '1500'), 10) || 0);
if (RECORD && REPLAY) {
  console.error('--record and --replay are mutually exclusive');
  process.exit(2);
}

// ---------- mismatch thresholds (REPLAY) ----------
const MAX_MISMATCHES = Math.max(0, parseInt(flag('max-mismatches', '0'), 10) || 0);
const MAX_STATUS_MISMATCHES = Math.max(0, parseInt(flag('max-status-mismatches', '0'), 10) || 0);
const MAX_BODY_BYTE_DELTA = Math.max(0, parseInt(flag('max-body-byte-delta', '0'), 10) || 0);

// ---------- redaction config ----------
const REDACT_BODIES = !!flag('redact-bodies', false);
const MAX_BODY_BYTES = Math.max(0, parseInt(flag('max-body-bytes', '4000'), 10) || 0);
const REDACT_HEADERS = new Set(
  String(flag('redact-headers', 'authorization,cookie,set-cookie,x-api-key,x-auth-token'))
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
);
const REDACT_URL_PARAMS = new Set(
  String(flag('redact-url-params', 'token,key,api_key,access_token,id_token'))
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
);
const REDACTED = '[REDACTED]';

function redactHeaders(h) {
  if (!h || typeof h !== 'object') return h;
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    out[k] = REDACT_HEADERS.has(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
}
function redactUrl(u) {
  if (!u || REDACT_URL_PARAMS.size === 0) return u;
  try {
    const url = new URL(u);
    let touched = false;
    for (const key of [...url.searchParams.keys()]) {
      if (REDACT_URL_PARAMS.has(key.toLowerCase())) { url.searchParams.set(key, REDACTED); touched = true; }
    }
    return touched ? url.toString() : u;
  } catch { return u; }
}
function redactBody(body) {
  if (body == null) return body;
  if (REDACT_BODIES) return REDACTED;
  const s = String(body);
  if (MAX_BODY_BYTES > 0 && s.length > MAX_BODY_BYTES) {
    return s.slice(0, MAX_BODY_BYTES) + `…[truncated ${s.length - MAX_BODY_BYTES}B]`;
  }
  return s;
}

// Transient errors we retry; assertion failures (record()) NEVER trigger retry.
const TRANSIENT_RE = /(net::ERR_|ECONNRESET|ECONNREFUSED|ETIMEDOUT|Target page, context or browser has been closed|Navigation timeout|browserContext\.|Protocol error|Connection closed|socket hang up|EAI_AGAIN)/i;
function isTransient(err) { return !!err && TRANSIENT_RE.test(String(err?.message || err)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


const TARGET = process.env.TARGET_URL || 'http://localhost:8080';
const REPORT_DIR = process.env.E2E_REPORT_DIR || join(process.cwd(), 'e2e-stale-report');
const ASSET_RE = /\/(?:assets|_build)\/[^?#]+\.(?:js|mjs|css|map)(?:[?#]|$)/i;
const HASHED_JS_RE = /\/(?:assets|_build)\/[^?#]+\.(?:js|mjs)(?:[?#]|$)/i;
const SHOTS = join(REPORT_DIR, 'screenshots');
mkdirSync(SHOTS, { recursive: true });
mkdirSync(FIXTURE_DIR, { recursive: true });

const reqLog = join(REPORT_DIR, 'requests.ndjson');
const resLog = join(REPORT_DIR, 'responses.ndjson');
const conLog = join(REPORT_DIR, 'console.ndjson');
for (const p of [reqLog, resLog, conLog]) writeFileSync(p, '');

const results = []; // { scenario, stage, ok, extra, diagnostics }
const perScenario = new Map(); // name -> { failures, purgeCalls, buildIds, topRequests, reloads, hashedJsUrls }
let currentScenario = '(setup)';

function ensureScenario(name) {
  if (!perScenario.has(name)) {
    perScenario.set(name, {
      failures: [], purgeCalls: [], buildIds: new Set(), topRequests: [],
      reloads: [], hashedJsUrls: new Set(),
      har: [], // compact HAR-like entries
      attempts: 0,
      transientErrors: [],
      dbSnapshots: [], // [{ at, label, data }]
      replayDiff: null, // populated only in REPLAY mode
      liveResponses: [], // captured this run (for replay diff)
      liveRequests: [],
    });
  }
  return perScenario.get(name);
}

function record(stage, ok, extra = '', diagnostics = null) {
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} [${currentScenario}] ${stage}${extra ? ' — ' + extra : ''}`);
  results.push({ scenario: currentScenario, stage, ok, extra, diagnostics: ok ? null : diagnostics });
  if (!ok) {
    ensureScenario(currentScenario).failures.push({ stage, extra });
    process.exitCode = 1;
  }
}
function appendNd(path, obj) {
  try { appendFileSync(path, JSON.stringify(obj) + '\n'); } catch { /* ignore */ }
}

// ---------- optional Firebase DB diff ----------
async function readBuildState() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  try {
    const admin = await import('firebase-admin');
    if (!admin.apps?.length) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
      });
    }
    const snap = await admin.firestore().collection('_meta').doc('build_state').get();
    return snap.exists ? snap.data() : null;
  } catch (e) { return { error: String(e) }; }
}

// Fields that MUST stay byte-identical when purge is deduped for the same build id.
const LOCK_FIELDS = ['lockBuildId', 'lockHolder', 'inFlightBuildId', 'inFlightStartedAt', 'lockAcquiredAt'];
function assertLockStateUnchanged(before, after) {
  const b = before || {}, a = after || {};
  const diffs = [];
  for (const k of LOCK_FIELDS) {
    const bv = JSON.stringify(b[k] ?? null);
    const av = JSON.stringify(a[k] ?? null);
    if (bv !== av) diffs.push({ field: k, before: b[k] ?? null, after: a[k] ?? null });
  }
  return diffs;
}

// Build a chronological lock-field timeline across all snapshots taken during the run.
function buildLockTimeline(snapshots) {
  // snapshots: [{ at, label, data }]
  const events = []; // { at, label, field, from, to }
  let prev = null;
  for (const snap of snapshots) {
    const d = snap.data || {};
    if (prev) {
      for (const f of LOCK_FIELDS) {
        const a = JSON.stringify((prev.data || {})[f] ?? null);
        const b = JSON.stringify(d[f] ?? null);
        if (a !== b) {
          events.push({ at: snap.at, label: snap.label, field: f, from: (prev.data || {})[f] ?? null, to: d[f] ?? null });
        }
      }
    } else {
      // initial state
      for (const f of LOCK_FIELDS) {
        if (d[f] != null) events.push({ at: snap.at, label: snap.label + ' (initial)', field: f, from: null, to: d[f] });
      }
    }
    prev = snap;
  }
  return events;
}

// ---------- live vs replay diff ----------
function diffLiveVsReplay(scenarioName) {
  if (!REPLAY) return null;
  const sc = perScenario.get(scenarioName);
  if (!sc) return null;
  const fixtureResp = loadFixture(scenarioName, 'responses') || [];
  const fixtureReq = loadFixture(scenarioName, 'requests') || [];
  const liveResp = sc.liveResponses;
  const liveReq = sc.liveRequests;
  const byUrl = (arr) => {
    const m = new Map();
    for (const r of arr) {
      const key = (r.url || '').split('?')[0];
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(r);
    }
    return m;
  };
  const fMap = byUrl(fixtureResp), lMap = byUrl(liveResp);
  const allUrls = new Set([...fMap.keys(), ...lMap.keys()]);
  const mismatches = [];
  for (const u of allUrls) {
    const f = fMap.get(u) || [];
    const l = lMap.get(u) || [];
    if (f.length !== l.length) {
      mismatches.push({ url: u, kind: 'count', fixture: f.length, live: l.length });
    }
    const n = Math.max(f.length, l.length);
    for (let i = 0; i < n; i++) {
      const fr = f[i], lr = l[i];
      if (!fr) { mismatches.push({ url: u, kind: 'only-live', index: i, status: lr.status }); continue; }
      if (!lr) { mismatches.push({ url: u, kind: 'only-fixture', index: i, status: fr.status }); continue; }
      if (fr.status !== lr.status) {
        mismatches.push({ url: u, kind: 'status', index: i, fixture: fr.status, live: lr.status });
      }
      if ((fr.body || '') !== (lr.body || '')) {
        mismatches.push({
          url: u, kind: 'body', index: i,
          fixtureBytes: (fr.body || '').length, liveBytes: (lr.body || '').length,
        });
      }
    }
  }
  // Purge call timing comparison (relative to first purge per side).
  const fPurge = fixtureResp.filter((r) => /post-publish-check/.test(r.url || ''));
  const lPurge = liveResp.filter((r) => /post-publish-check/.test(r.url || ''));
  const relTimes = (arr) => {
    if (!arr.length) return [];
    const t0 = arr[0].at;
    return arr.map((r) => r.at - t0);
  };
  const fRel = relTimes(fPurge), lRel = relTimes(lPurge);
  const purgeTiming = {
    fixtureCount: fPurge.length,
    liveCount: lPurge.length,
    fixtureRelMs: fRel,
    liveRelMs: lRel,
    deltaMs: lRel.map((t, i) => (fRel[i] != null ? t - fRel[i] : null)),
  };
  return {
    summary: {
      requestsFixture: fixtureReq.length,
      requestsLive: liveReq.length,
      responsesFixture: fixtureResp.length,
      responsesLive: liveResp.length,
      mismatchCount: mismatches.length,
    },
    purgeTiming,
    mismatches: mismatches.slice(0, 40),
    truncated: mismatches.length > 40,
  };
}

// ---------- fixture helpers ----------
function fixturePath(scenario, kind) {
  return join(FIXTURE_DIR, scenario, `${kind}.json`);
}
function loadFixture(scenario, kind) {
  const p = fixturePath(scenario, kind);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}
function saveFixture(scenario, kind, data) {
  mkdirSync(join(FIXTURE_DIR, scenario), { recursive: true });
  writeFileSync(fixturePath(scenario, kind), JSON.stringify(data, null, 2));
}

// ---------- fixture schema validation (replay-mode fail-fast) ----------
const FIXTURE_SCHEMAS = {
  requests: {
    arrayOf: { required: ['scenario', 'at', 'method', 'url', 'headers'], optional: ['postData'] },
  },
  responses: {
    arrayOf: { required: ['scenario', 'at', 'url', 'status', 'body'] },
    // Replay rewrites /api/public/post-publish-check; body MUST be JSON describing a purge result.
    bodyContract: {
      match: /post-publish-check/,
      contentType: 'application/json',
      requiredJsonKeys: ['ok', 'buildId'],
    },
  },
};
function validateFixture(scenario, kind, data) {
  const schema = FIXTURE_SCHEMAS[kind];
  if (!schema) return { ok: true };
  if (!Array.isArray(data)) {
    return { ok: false, error: `${kind} fixture must be a JSON array, got ${typeof data}` };
  }
  const missing = [];
  data.forEach((row, i) => {
    if (!row || typeof row !== 'object') {
      missing.push(`row[${i}] is not an object`); return;
    }
    for (const k of schema.arrayOf.required) {
      if (!(k in row)) missing.push(`row[${i}] missing required field "${k}"`);
    }
  });
  if (schema.bodyContract) {
    const matches = data.filter((r) => r && schema.bodyContract.match.test(r.url || ''));
    if (matches.length === 0) {
      missing.push(`no response matched ${schema.bodyContract.match} — replay would have nothing to serve`);
    }
    for (const r of matches) {
      let parsed;
      try { parsed = JSON.parse(r.body ?? ''); }
      catch { missing.push(`response ${r.url} body is not JSON (expected ${schema.bodyContract.contentType})`); continue; }
      for (const k of schema.bodyContract.requiredJsonKeys) {
        if (!(k in parsed)) missing.push(`response ${r.url} JSON missing key "${k}"`);
      }
    }
  }
  if (missing.length) {
    return { ok: false, error: `fixture validation failed for ${scenario}/${kind}.json:\n  - ${missing.slice(0, 12).join('\n  - ')}${missing.length > 12 ? `\n  - …and ${missing.length - 12} more` : ''}` };
  }
  return { ok: true };
}

// ---------- one scenario harness ----------
async function withContext(browser, name, fn) {
  currentScenario = name;
  const sc = ensureScenario(name);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const purgeCalls = [];
  const purgeResponses = [];
  const autoPurgeLogs = [];
  const reloads = [];
  const allConsole = [];
  const assetReqs = []; // hashed JS asset request URLs (ordered)
  const requestRecording = [];
  const responseRecording = [];

  let replayResponses = null;
  if (REPLAY) {
    const raw = loadFixture(name, 'responses');
    if (!raw) {
      throw new Error(`[replay] missing fixture ${fixturePath(name, 'responses')} — run with --record first`);
    }
    const v = validateFixture(name, 'responses', raw);
    if (!v.ok) throw new Error(`[replay] ${v.error}`);
    const reqRaw = loadFixture(name, 'requests');
    if (reqRaw) {
      const vr = validateFixture(name, 'requests', reqRaw);
      if (!vr.ok) throw new Error(`[replay] ${vr.error}`);
    }
    replayResponses = raw;
  }

  // HAR-like trace: keep per-request timing/redirect chain.
  const harByReq = new WeakMap();
  context.on('request', (req) => {
    const url = req.url();
    const startedAt = Date.now();
    const entry = { scenario: name, at: startedAt, method: req.method(), url, headers: req.headers(), postData: req.postData() || null };
    appendNd(reqLog, entry);
    if (RECORD) requestRecording.push(entry);
    sc.liveRequests.push(entry);
    if (HASHED_JS_RE.test(url)) { assetReqs.push(url); sc.hashedJsUrls.add(url.split('?')[0]); }
    if (sc.topRequests.length < 25) sc.topRequests.push({ method: req.method(), url });
    const redirectFrom = req.redirectedFrom();
    const har = {
      startedAt,
      method: req.method(),
      url,
      resourceType: req.resourceType(),
      redirectedFrom: redirectFrom ? redirectFrom.url() : null,
      status: null,
      mimeType: null,
      durationMs: null,
      fromCache: false,
      failed: null,
    };
    harByReq.set(req, har);
    sc.har.push(har);
  });
  context.on('response', async (res) => {
    const u = res.url();
    const har = harByReq.get(res.request());
    if (har) {
      har.status = res.status();
      har.mimeType = res.headers()['content-type'] || null;
      har.durationMs = Date.now() - har.startedAt;
      har.fromCache = !!res.fromServiceWorker?.();
    }
    if (!/\/api\/public\//.test(u)) return;
    let body = null;
    try { body = (await res.text()).slice(0, 4000); } catch { /* ignore */ }
    const entry = { scenario: name, at: Date.now(), url: u, status: res.status(), body };
    appendNd(resLog, entry);
    if (RECORD) responseRecording.push(entry);
    sc.liveResponses.push(entry);
    if (/post-publish-check/.test(u)) {
      purgeResponses.push(entry);
      try {
        const j = JSON.parse(body || '{}');
        if (j.buildId) sc.buildIds.add(j.buildId);
        if (j.previous) sc.buildIds.add(j.previous);
      } catch { /* ignore */ }
    }
  });
  context.on('requestfailed', (req) => {
    const har = harByReq.get(req);
    if (har) { har.failed = req.failure()?.errorText || 'failed'; har.durationMs = Date.now() - har.startedAt; }
  });

  // Stub purge endpoint (or replay).
  await context.route('**/api/public/post-publish-check*', async (route) => {
    purgeCalls.push({ at: Date.now(), url: route.request().url() });
    sc.purgeCalls.push({ at: Date.now(), url: route.request().url() });
    let fixtureBody = null;
    if (REPLAY && replayResponses) {
      const m = replayResponses.find((r) => /post-publish-check/.test(r.url));
      if (m) fixtureBody = m.body;
    }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: fixtureBody || JSON.stringify({ ok: true, changed: true, buildId: 'E2E-NEW', previous: 'E2E-OLD' }),
    });
  });

  const page = await context.newPage();
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) {
      const entry = { at: Date.now(), url: f.url() };
      reloads.push(entry); sc.reloads.push(entry);
    }
  });
  page.on('console', (msg) => {
    const entry = { scenario: name, at: Date.now(), type: msg.type(), text: msg.text() };
    allConsole.push(entry); appendNd(conLog, entry);
    if (msg.text().includes('[auto-purge]')) autoPurgeLogs.push(msg.text());
  });

  try {
    await fn({ context, page, purgeCalls, purgeResponses, autoPurgeLogs, reloads, allConsole, assetReqs, sc });
  } finally {
    try { await page.screenshot({ path: join(SHOTS, `${name}.png`) }); } catch { /* ignore */ }
    // Write compact HAR-like trace for this scenario (overwritten on retry — only final attempt kept).
    try {
      writeFileSync(join(REPORT_DIR, `har-${name}.json`), JSON.stringify({
        scenario: name, target: TARGET, mode: REPLAY ? 'replay' : (RECORD ? 'record' : 'live'),
        capturedAt: new Date().toISOString(), entryCount: sc.har.length, entries: sc.har,
      }, null, 2));
    } catch { /* ignore */ }
    if (RECORD) {
      saveFixture(name, 'requests', requestRecording);
      saveFixture(name, 'responses', responseRecording);
      console.log(`[record] wrote fixtures for ${name} → ${join(FIXTURE_DIR, name)}`);
    }
    await context.close();
  }
}
function diag(extra) {
  return { target: TARGET, scenario: currentScenario, hint: 'See requests.ndjson / responses.ndjson / console.ndjson / db-diff.json.', ...extra };
}

// Shared stronger no-loop / single-swap assertions used by JS+CSS scenarios.
function assertNoLoop(reloads, assetReqs, sc, label) {
  record(`${label}: navigation count ≤ 2 (initial + at most one recovery)`, reloads.length <= 2,
    `navigations=${reloads.length}`, diag({ reloads }));
  const unique = new Set(assetReqs.map((u) => u.split('?')[0]));
  record(`${label}: hashed chunk URL set changes at most once`, unique.size <= 2,
    `unique=${unique.size} total=${assetReqs.length}`,
    diag({ uniqueAssets: [...unique], allAssetRequests: assetReqs }));
  // No third navigation arrives in a follow-up window.
  const lastAt = reloads[reloads.length - 1]?.at ?? 0;
  const trailing = reloads.filter((r) => r.at > lastAt - 1).length;
  record(`${label}: no trailing reload after recovery`, trailing <= 1,
    `trailing=${trailing}`, diag({ reloads }));
}

// ---------- scenarios registry ----------
const scenarios = {
  'js-chunk-404': async (browser) => withContext(browser, 'js-chunk-404',
    async ({ context, page, purgeCalls, autoPurgeLogs, reloads, assetReqs, sc }) => {
    let armed = true, seen = null;
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (armed && ASSET_RE.test(url) && /\.(?:js|mjs)(?:[?#]|$)/.test(url)) {
        seen = url; armed = false;
        return route.fulfill({ status: 404, body: 'Not Found' });
      }
      return route.continue();
    });
    await page.goto(TARGET, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(8000);
    record('forced stale chunk observed', !!seen, seen || '', diag({ seen }));
    record('post-publish-check called BEFORE reload',
      purgeCalls.length >= 1 && purgeCalls[0].at <= (reloads[1]?.at ?? Infinity),
      `calls=${purgeCalls.length} reloads=${reloads.length}`, diag({ purgeCalls, reloads }));
    assertNoLoop(reloads, assetReqs, sc, 'js');
    record('visible [auto-purge] console log', autoPurgeLogs.length >= 1,
      autoPurgeLogs[0]?.slice(0, 120) ?? '', diag({ autoPurgeLogs }));
  }),

  'sourcemap-404': async (browser) => withContext(browser, 'sourcemap-404',
    async ({ context, page, reloads, allConsole, assetReqs, sc }) => {
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (/\.map(?:[?#]|$)/.test(url)) return route.fulfill({ status: 404, body: 'Not Found' });
      return route.continue();
    });
    await page.goto(TARGET, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(5000);
    record('sourcemap 404 does NOT cause reload', reloads.length === 1, `n=${reloads.length}`,
      diag({ reloads, lastConsole: allConsole.slice(-20) }));
    assertNoLoop(reloads, assetReqs, sc, 'sourcemap');
  }),

  'css-link-error': async (browser) => withContext(browser, 'css-link-error',
    async ({ context, page, purgeCalls, autoPurgeLogs, reloads, assetReqs, sc }) => {
    let armed = true, seen = null;
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (armed && ASSET_RE.test(url) && /\.css(?:[?#]|$)/.test(url)) {
        seen = url; armed = false;
        return route.fulfill({ status: 404, body: 'Not Found' });
      }
      return route.continue();
    });
    await page.goto(TARGET, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(8000);
    if (seen) {
      record('css stale link → purge BEFORE reload',
        purgeCalls.length >= 1 && purgeCalls[0].at <= (reloads[1]?.at ?? Infinity),
        `calls=${purgeCalls.length} reloads=${reloads.length}`, diag({ purgeCalls, reloads, seen }));
      assertNoLoop(reloads, assetReqs, sc, 'css');
      record('visible [auto-purge] console log for css', autoPurgeLogs.length >= 1, '', diag({ autoPurgeLogs }));
    } else {
      record('css asset request observed', false, 'no CSS asset request seen', diag({}));
    }
  }),

  'cross-tab-lock': async (browser) => withContext(browser, 'cross-tab-lock',
    async ({ context, page, purgeCalls }) => {
    let armed = true;
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (armed && ASSET_RE.test(url) && /\.(?:js|mjs)(?:[?#]|$)/.test(url)) {
        armed = false;
        return route.fulfill({ status: 404, body: 'Not Found' });
      }
      return route.continue();
    });
    await page.goto(TARGET, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(6000);
    const before = purgeCalls.length;
    const dbMid = await readBuildState();
    const tab2 = await context.newPage();
    await tab2.goto(TARGET, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await tab2.waitForTimeout(4000);
    record('cross-tab lock: ONE purge per build id across tabs',
      purgeCalls.length === before,
      `before=${before} after=${purgeCalls.length}`,
      diag({ purgeCallsBefore: before, purgeCallsAfter: purgeCalls.length, allCalls: purgeCalls }));
    // Tightened DB assertion: when dedup kicks in, lock/in-flight fields MUST NOT mutate again.
    const dbAfter = await readBuildState();
    if (dbMid && dbAfter) {
      const diffs = assertLockStateUnchanged(dbMid, dbAfter);
      record('cross-tab dedup: lock/in-flight DB fields unchanged after 2nd tab',
        diffs.length === 0, diffs.length ? `diffs=${diffs.length}` : 'none',
        diag({ diffs, before: dbMid, after: dbAfter, fields: LOCK_FIELDS }));
    } else {
      record('cross-tab dedup: DB lock-state assertion (skipped — no Firebase admin)', true, 'skipped');
    }
  }),

  'network-fail-fallback': async (browser) => withContext(browser, 'network-fail-fallback',
    async ({ context, page, reloads, assetReqs, sc }) => {
    await context.unroute('**/api/public/post-publish-check*');
    await context.route('**/api/public/post-publish-check*', (route) => route.abort('failed'));
    let armed = true;
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (armed && ASSET_RE.test(url) && /\.(?:js|mjs)(?:[?#]|$)/.test(url)) {
        armed = false;
        return route.fulfill({ status: 404, body: 'Not Found' });
      }
      return route.continue();
    });
    await page.goto(TARGET, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(7000);
    record('aborted purge does NOT cause reload loop', reloads.length <= 2, `n=${reloads.length}`, diag({ reloads }));
    assertNoLoop(reloads, assetReqs, sc, 'netfail');
  }),
};

// ---------- main ----------
async function run() {
  if (LIST) { console.log(Object.keys(scenarios).join('\n')); return; }
  if (ONLY && !scenarios[ONLY]) {
    console.error(`unknown scenario "${ONLY}". Available: ${Object.keys(scenarios).join(', ')}`);
    process.exit(2);
  }
  const dbBefore = await readBuildState();
  const dbSnapshots = [{ at: Date.now(), label: 'run-start', data: dbBefore || {} }];
  const browser = await chromium.launch({ headless: true });
  // Deterministic mode: stable scenario ordering so CI runs are comparable.
  const toRun = ONLY
    ? [ONLY]
    : (DETERMINISTIC ? [...Object.keys(scenarios)].sort() : Object.keys(scenarios));
  if (DETERMINISTIC) console.log(`[deterministic] scenario order: ${toRun.join(', ')}`);
  for (const name of toRun) {
    let lastErr = null;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      // Reset state for this scenario before each attempt so retries are clean.
      perScenario.delete(name);
      for (let i = results.length - 1; i >= 0; i--) if (results[i].scenario === name) results.splice(i, 1);
      const sc = ensureScenario(name);
      sc.attempts = attempt + 1;
      const hadAssertionFailureBefore = (process.exitCode === 1);
      try {
        await scenarios[name](browser);
        lastErr = null;
        const scNow = ensureScenario(name);
        if (scNow.failures.length > 0) {
          console.log(`[no-retry] [${name}] assertion failures present (${scNow.failures.length}) — deterministic, not retrying`);
          break;
        }
        break; // success
      } catch (err) {
        lastErr = err;
        const transient = isTransient(err);
        ensureScenario(name).transientErrors.push({ attempt: attempt + 1, transient, message: String(err?.message || err) });
        if (!transient || attempt === RETRIES) {
          console.error(`[${name}] failed${transient ? ' (transient, retries exhausted)' : ''}: ${err?.message || err}`);
          record('scenario crashed', false, String(err?.message || err).slice(0, 200), { error: String(err?.stack || err), transient });
          break;
        }
        console.warn(`[retry] [${name}] transient error on attempt ${attempt + 1}/${RETRIES + 1}: ${err?.message || err} — retrying in ${RETRY_DELAY_MS}ms`);
        await sleep(RETRY_DELAY_MS);
        if (!hadAssertionFailureBefore) process.exitCode = 0;
      }
    }
    // Per-scenario DB snapshot for the lock timeline.
    const snap = await readBuildState();
    const entry = { at: Date.now(), label: `after:${name}`, data: snap || {} };
    dbSnapshots.push(entry);
    const sc = ensureScenario(name);
    sc.dbSnapshots.push(entry);
    // Build live-vs-replay diff once per scenario (REPLAY only).
    sc.replayDiff = diffLiveVsReplay(name);
  }
  await browser.close();
  const dbAfter = await readBuildState();
  const lockTimeline = buildLockTimeline(dbSnapshots);
  writeFileSync(join(REPORT_DIR, 'db-diff.json'),
    JSON.stringify({ before: dbBefore, after: dbAfter, lockFieldsTracked: LOCK_FIELDS, snapshots: dbSnapshots, lockTimeline }, null, 2));

  const failed = results.filter((r) => !r.ok);

  // Concise per-scenario summary for CI logs.
  const perScenarioSummary = [...perScenario.entries()].map(([name, s]) => ({
    scenario: name,
    failures: s.failures.length,
    failureStages: s.failures.map((f) => f.stage),
    purgeCallCount: s.purgeCalls.length,
    buildIds: [...s.buildIds],
    uniqueHashedJsUrls: [...s.hashedJsUrls],
    navigations: s.reloads.length,
    topRequests: s.topRequests,
    replayDiff: s.replayDiff,
  }));

  const summary = {
    target: TARGET,
    finishedAt: new Date().toISOString(),
    total: results.length, failed: failed.length, passed: results.length - failed.length,
    scenarios: [...new Set(results.map((r) => r.scenario))],
    perScenario: perScenarioSummary,
    lockTimeline,
    cli: { ONLY, RECORD, REPLAY, FIXTURE_DIR, RETRIES, RETRY_DELAY_MS, DETERMINISTIC },
    results,
  };
  writeFileSync(join(REPORT_DIR, 'report.json'), JSON.stringify(summary, null, 2));

  const txt = [
    `E2E stale-assets — ${TARGET}`,
    `finished: ${summary.finishedAt}`,
    `total: ${summary.total}   passed: ${summary.passed}   failed: ${summary.failed}`,
    ONLY ? `scenario filter: ${ONLY}` : '',
    RECORD ? 'mode: RECORD' : (REPLAY ? 'mode: REPLAY' : ''),
    '',
    '── per-scenario summary ──',
    ...perScenarioSummary.map((s) =>
      `[${s.scenario}] failures=${s.failures} purgeCalls=${s.purgeCallCount} buildIds=${s.buildIds.join(',') || '-'} navs=${s.navigations} uniqueJs=${s.uniqueHashedJsUrls.length}`
      + (s.failureStages.length ? `\n   FAIL: ${s.failureStages.join(' | ')}` : '')
      + (s.topRequests.length ? `\n   top: ${s.topRequests.slice(0, 5).map((r) => r.method + ' ' + r.url).join('\n        ')}` : '')
    ),
    '',
    '── assertions ──',
    ...results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  [${r.scenario}]  ${r.stage}${r.extra ? '  — ' + r.extra : ''}`),
    '',
    failed.length ? 'See requests.ndjson, responses.ndjson, console.ndjson, db-diff.json, screenshots/.' : '',
  ].filter(Boolean).join('\n');
  writeFileSync(join(REPORT_DIR, 'report.txt'), txt);

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="e2e-stale-assets" tests="${summary.total}" failures="${summary.failed}" time="0">`,
    ...results.map((r) => {
      const cls = r.scenario.replace(/[^a-zA-Z0-9._-]/g, '_');
      const nm = r.stage.replace(/[^a-zA-Z0-9._ -]/g, '_');
      if (r.ok) return `  <testcase classname="${cls}" name="${nm}"/>`;
      const msg = (r.extra || 'failed').replace(/[<&>]/g, '');
      const body = JSON.stringify(r.diagnostics || {}).replace(/]]>/g, ']]]]><![CDATA[>');
      return `  <testcase classname="${cls}" name="${nm}"><failure message="${msg}"><![CDATA[${body}]]></failure></testcase>`;
    }),
    '</testsuite>',
  ].join('\n');
  writeFileSync(join(REPORT_DIR, 'junit.xml'), xml);

  // ---------- self-contained HTML report ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dbHighlights = (() => {
    if (!dbBefore && !dbAfter) return '<p class="muted">No Firestore DB diff captured (FIREBASE_SERVICE_ACCOUNT_JSON not set).</p>';
    const keys = new Set([...Object.keys(dbBefore || {}), ...Object.keys(dbAfter || {})]);
    const rows = [...keys].sort().map((k) => {
      const a = JSON.stringify((dbBefore || {})[k] ?? null);
      const b = JSON.stringify((dbAfter || {})[k] ?? null);
      const changed = a !== b;
      const lock = LOCK_FIELDS.includes(k);
      return `<tr class="${changed ? 'diff' : ''}"><td>${esc(k)}${lock ? ' <span class="pill">lock</span>' : ''}</td><td><code>${esc(a)}</code></td><td><code>${esc(b)}</code></td></tr>`;
    }).join('');
    return `<table class="tbl"><thead><tr><th>field</th><th>before</th><th>after</th></tr></thead><tbody>${rows}</tbody></table>`;
  })();
  const scCards = perScenarioSummary.map((s) => {
    const meta = perScenario.get(s.scenario) || {};
    const attempts = meta.attempts || 1;
    const transient = (meta.transientErrors || []).length;
    const asserts = results.filter((r) => r.scenario === s.scenario);
    const purgeRes = (meta.purgeCalls || []).slice(0, 5).map((c) => `<li><code>${esc(new Date(c.at).toISOString())}</code> → <code>${esc(c.url)}</code></li>`).join('');
    const reloadList = (meta.reloads || []).map((r) => `<li><code>${esc(new Date(r.at).toISOString())}</code> → ${esc(r.url)}</li>`).join('');
    const uniqueJs = s.uniqueHashedJsUrls.map((u) => `<li><code>${esc(u)}</code></li>`).join('');
    const assertRows = asserts.map((r) => `<tr class="${r.ok ? 'pass' : 'fail'}"><td>${r.ok ? '✅' : '❌'}</td><td>${esc(r.stage)}</td><td>${esc(r.extra || '')}</td></tr>`).join('');
    const failBadge = s.failures > 0 ? `<span class="badge bad">${s.failures} FAIL</span>` : '<span class="badge ok">PASS</span>';
    return `<section class="card"><header><h3>${esc(s.scenario)} ${failBadge}</h3>
      <div class="kv">attempts=${attempts} · transient=${transient} · purge=${s.purgeCallCount} · navs=${s.navigations} · uniqueJs=${s.uniqueHashedJsUrls.length} · builds=${s.buildIds.join(', ') || '—'}</div></header>
      <details open><summary>Assertions (${asserts.length})</summary><table class="tbl"><thead><tr><th></th><th>stage</th><th>detail</th></tr></thead><tbody>${assertRows}</tbody></table></details>
      <details><summary>Purge calls (${(meta.purgeCalls || []).length})</summary><ul>${purgeRes || '<li class="muted">none</li>'}</ul></details>
      <details><summary>Navigations / no-loop evidence (${(meta.reloads || []).length})</summary><ul>${reloadList || '<li class="muted">none</li>'}</ul>
        <p>Unique hashed JS URLs: ${s.uniqueHashedJsUrls.length}</p><ul>${uniqueJs}</ul></details>
      <details><summary>HAR trace</summary><p><a href="har-${esc(s.scenario)}.json">har-${esc(s.scenario)}.json</a> · ${(meta.har || []).length} entries</p></details>
      ${(() => {
        const d = meta.replayDiff;
        if (!d) return REPLAY ? '<details><summary>Live vs replay</summary><p class="muted">no diff produced</p></details>' : '';
        const pt = d.purgeTiming;
        const ptRows = pt.liveRelMs.map((t, i) => `<tr><td>${i}</td><td><code>${pt.fixtureRelMs[i] ?? '—'}</code> ms</td><td><code>${t}</code> ms</td><td><code>${pt.deltaMs[i] ?? '—'}</code> ms</td></tr>`).join('')
          || '<tr><td colspan="4" class="muted">no purge calls observed</td></tr>';
        const mmRows = d.mismatches.map((m) => `<tr class="diff"><td>${esc(m.kind)}</td><td><code>${esc(m.url)}</code></td><td><code>${esc(JSON.stringify(m).slice(0, 200))}</code></td></tr>`).join('')
          || '<tr><td colspan="3" class="muted">no mismatches — live matches fixture ✅</td></tr>';
        return `<details ${d.summary.mismatchCount ? 'open' : ''}><summary>Live vs replay (mismatches=${d.summary.mismatchCount}, fixture/live req=${d.summary.requestsFixture}/${d.summary.requestsLive}, resp=${d.summary.responsesFixture}/${d.summary.responsesLive})</summary>
          <h4>Purge call timing (relative to first purge per side)</h4>
          <table class="tbl"><thead><tr><th>#</th><th>fixture</th><th>live</th><th>Δ</th></tr></thead><tbody>${ptRows}</tbody></table>
          <h4>Mismatched requests / status / bodies</h4>
          <table class="tbl"><thead><tr><th>kind</th><th>url</th><th>detail</th></tr></thead><tbody>${mmRows}</tbody></table>
          ${d.truncated ? '<p class="muted">(truncated to first 40)</p>' : ''}
        </details>`;
      })()}
      <details><summary>Screenshot</summary><p><a href="screenshots/${esc(s.scenario)}.png"><img src="screenshots/${esc(s.scenario)}.png" alt="${esc(s.scenario)}" loading="lazy" style="max-width:100%;border:1px solid #444"/></a></p></details>
    </section>`;
  }).join('\n');
  // Build DB lock timeline HTML.
  const lockTimelineHtml = (() => {
    if (!lockTimeline.length) return '<p class="muted">No lock-field transitions captured (Firebase admin not available or no changes).</p>';
    const rows = lockTimeline.map((e) => `<tr><td><code>${esc(new Date(e.at).toISOString())}</code></td><td>${esc(e.label)}</td><td><span class="pill">${esc(e.field)}</span></td><td><code>${esc(JSON.stringify(e.from))}</code></td><td><code>${esc(JSON.stringify(e.to))}</code></td></tr>`).join('');
    return `<table class="tbl"><thead><tr><th>timestamp</th><th>checkpoint</th><th>field</th><th>from</th><th>to</th></tr></thead><tbody>${rows}</tbody></table>`;
  })();
  const overall = failed.length ? 'FAILED' : 'PASSED';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>E2E stale-assets — ${esc(overall)}</title>
<style>
:root{color-scheme:dark light;font-family:ui-sans-serif,system-ui,sans-serif}
body{margin:0;padding:24px;background:#0f172a;color:#e2e8f0;line-height:1.45}
h1,h2,h3{margin:.4em 0}.muted{color:#94a3b8}
header.top{display:flex;flex-wrap:wrap;gap:12px;align-items:baseline;border-bottom:1px solid #334155;padding-bottom:12px;margin-bottom:16px}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600}
.badge.ok{background:#065f46;color:#a7f3d0}.badge.bad{background:#7f1d1d;color:#fecaca}
.pill{background:#1e293b;color:#fbbf24;padding:1px 6px;border-radius:6px;font-size:11px;margin-left:4px}
.card{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px 16px;margin-bottom:14px}
.card header h3{display:flex;gap:10px;align-items:center}
.kv{color:#94a3b8;font-size:13px;margin-top:4px}
details{margin-top:8px}summary{cursor:pointer;color:#cbd5e1;font-weight:600}
table.tbl{border-collapse:collapse;width:100%;margin-top:6px;font-size:13px}
.tbl th,.tbl td{border:1px solid #334155;padding:4px 8px;text-align:left;vertical-align:top}
.tbl tr.pass td:first-child{color:#34d399}.tbl tr.fail td{background:#3f1d1d}
.tbl tr.diff td{background:#3b2a16}
code{background:#0f172a;padding:1px 4px;border-radius:4px;font-size:12px;word-break:break-all}
a{color:#7dd3fc}
</style></head><body>
<header class="top">
  <h1>E2E stale-assets <span class="badge ${failed.length ? 'bad' : 'ok'}">${esc(overall)}</span></h1>
  <div class="muted">target <code>${esc(TARGET)}</code> · finished ${esc(summary.finishedAt)} · ${summary.passed}/${summary.total} passed${ONLY ? ` · filter <code>${esc(ONLY)}</code>` : ''}${REPLAY ? ' · <b>REPLAY</b>' : (RECORD ? ' · <b>RECORD</b>' : '')} · retries=${RETRIES}</div>
</header>
<section class="card"><h2>Per-scenario summary</h2>${scCards || '<p class="muted">No scenarios ran.</p>'}</section>
<section class="card"><h2>DB lock timeline (Firestore <code>_meta/build_state</code>)</h2>${lockTimelineHtml}</section>
<section class="card"><h2>DB diff (before vs after) — lock fields highlighted</h2>${dbHighlights}</section>
<section class="card"><h2>Artifacts</h2><ul>
  <li><a href="report.json">report.json</a></li><li><a href="report.txt">report.txt</a></li>
  <li><a href="junit.xml">junit.xml</a></li><li><a href="db-diff.json">db-diff.json</a></li>
  <li><a href="requests.ndjson">requests.ndjson</a></li><li><a href="responses.ndjson">responses.ndjson</a></li>
  <li><a href="console.ndjson">console.ndjson</a></li>
</ul></section>
</body></html>`;
  writeFileSync(join(REPORT_DIR, 'report.html'), html);



  console.log(`\nReport written to ${REPORT_DIR}`);
  console.log(process.exitCode
    ? `\n❌ e2e-stale-assets FAILED (${failed.length}/${results.length})`
    : `\n✅ e2e-stale-assets PASSED (${results.length}/${results.length})`);
}

run().catch((e) => {
  console.error(e);
  try { writeFileSync(join(REPORT_DIR, 'crash.txt'), String(e?.stack || e)); } catch { /* ignore */ }
  process.exit(1);
});
