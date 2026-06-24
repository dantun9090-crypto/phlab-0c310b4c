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
 *   --hash-bodies                     replace redacted/truncated bodies with `sha256:<hex>` so equality is preserved without exposing data
 *   --max-body-bytes=N (default 4000) truncate captured bodies to N bytes (replaced with hash when --hash-bodies)
 *   --redact-headers=a,b,c            comma list of header NAMES to mask (default: authorization,cookie,set-cookie,x-api-key,x-auth-token)
 *   --redact-url-params=a,b,c         comma list of query param NAMES to mask (default: token,key,api_key,access_token,id_token)
 *
 *   Header normalization for live-vs-replay diff:
 *   --normalize-headers                       compare headers case-insensitively, order-independently (and surface as a "headers" mismatch kind)
 *   --normalize-ignore-headers=a,b,c          comma list of header names to ignore in diffs (default volatile set: date,age,server-timing,x-request-id,cf-ray,...)
 *
 *   Artifact persistence:
 *   --artifacts-on-failure-only / --skip-artifacts-on-success
 *                                             only persist HAR, fixtures (non-RECORD), HTML report, ndjson logs, and screenshots when
 *                                             an assertion fails or a live-vs-replay threshold is breached. report.{json,txt} + junit.xml + db-diff.json always written.
 *   --prune-dry-run / --dry-run               log which artifact paths WOULD be kept vs deleted for the current outcome without touching the filesystem.
 *
 * HTML report features (rendered into report.html):
 *   - Global "Download mismatch bundle (all scenarios)" button in the header (respects each scenario's current filter).
 *   - Per-scenario filter selections persist in localStorage so refreshing the report restores the same view.



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
import { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  sha256,
  normalizeHeadersForDiff as _normalizeHeadersForDiff,
  headersEqualNormalized as _headersEqualNormalized,
  redactBody as _redactBody,
  BUNDLE_SCHEMA_VERSION,
  validateMismatchBundle,
  validateGlobalMismatchBundle,
} from './lib/e2e-diff-helpers.mjs';
import { REPORT_CLIENT_SCRIPT } from './lib/e2e-report-client.mjs';





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
// When --hash-bodies is set, redacted/truncated bodies are replaced with a stable
// sha256 hash of the ORIGINAL body so equality comparisons survive redaction.
const HASH_BODIES = !!flag('hash-bodies', false);
const REDACT_HEADERS = new Set(
  String(flag('redact-headers', 'authorization,cookie,set-cookie,x-api-key,x-auth-token'))
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
);
const REDACT_URL_PARAMS = new Set(
  String(flag('redact-url-params', 'token,key,api_key,access_token,id_token'))
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
);
const REDACTED = '[REDACTED]';

// ---------- header normalization for live-vs-replay diff ----------
// Case-insensitive header names + order-independent comparison.
const NORMALIZE_HEADERS = !!flag('normalize-headers', false);
const NORMALIZE_IGNORE_HEADERS = new Set(
  String(flag('normalize-ignore-headers', 'date,age,server-timing,x-request-id,cf-ray,x-amz-cf-id,x-served-by,etag,last-modified'))
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
);

// ---------- artifact persistence ----------
// When set, fixtures/HAR/HTML/ndjson are ONLY persisted on a meaningful failure
// (assertion failure or threshold breach). Successful runs leave only report.{json,txt} + junit.xml.
const ARTIFACTS_ON_FAILURE_ONLY = !!flag('artifacts-on-failure-only', false)
  || !!flag('skip-artifacts-on-success', false);
// Dry-run for the pruning step: report which paths WOULD be kept/deleted
// for the current run outcome, without actually touching the filesystem.
const PRUNE_DRY_RUN = !!flag('prune-dry-run', false) || !!flag('dry-run', false);

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
// Bind the pure helper to this run's CLI-driven redaction config.
function redactBody(body) {
  return _redactBody(body, {
    redactBodies: REDACT_BODIES,
    hashBodies: HASH_BODIES,
    maxBodyBytes: MAX_BODY_BYTES,
    redactedMarker: REDACTED,
  });
}

// Bind the pure helpers to this run's normalize-ignore set.
function normalizeHeadersForDiff(h) { return _normalizeHeadersForDiff(h, NORMALIZE_IGNORE_HEADERS); }
function headersEqualNormalized(a, b) { return _headersEqualNormalized(a, b, NORMALIZE_IGNORE_HEADERS); }




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
  // Build per-item pairs (both matched and mismatched) so the HTML report can drill down into every one.
  const items = [];
  const mismatches = [];
  let statusMismatchCount = 0;
  let maxBodyDelta = 0;
  // Use the matching scenario's HAR (when available) to enrich each item with headers/body/redirect chain.
  const harByUrlStatus = (() => {
    const m = new Map();
    for (const h of sc.har || []) {
      const k = (h.url || '').split('?')[0] + '|' + (h.status ?? '');
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(h);
    }
    return m;
  })();
  const popHar = (url, status) => {
    const k = (url || '').split('?')[0] + '|' + (status ?? '');
    const arr = harByUrlStatus.get(k);
    if (arr && arr.length) return arr.shift();
    return null;
  };
  for (const u of allUrls) {
    const f = fMap.get(u) || [];
    const l = lMap.get(u) || [];
    if (f.length !== l.length) {
      const m = { url: u, kind: 'count', fixture: f.length, live: l.length };
      mismatches.push(m); items.push({ match: false, ...m });
    }
    const n = Math.max(f.length, l.length);
    for (let i = 0; i < n; i++) {
      const fr = f[i], lr = l[i];
      const reasons = [];
      const kinds = []; // structured kinds for HTML filter: status | body | headers | only-live | only-fixture
      if (!fr) { reasons.push('only-live'); kinds.push('only-live'); }
      if (!lr) { reasons.push('only-fixture'); kinds.push('only-fixture'); }
      if (fr && lr) {
        if (fr.status !== lr.status) { reasons.push('status'); kinds.push('status'); statusMismatchCount++; }
        const fb = (fr.body || ''), lb = (lr.body || '');
        if (fb !== lb) {
          const delta = Math.abs(fb.length - lb.length);
          if (delta > maxBodyDelta) maxBodyDelta = delta;
          reasons.push(`body(Δ${delta}B)`); kinds.push('body');
        }
        if (NORMALIZE_HEADERS && !headersEqualNormalized(fr.headers, lr.headers)) {
          reasons.push('headers'); kinds.push('headers');
        }
      }
      const liveHar = lr ? popHar(lr.url, lr.status) : null;
      const resourceType = liveHar?.resourceType
        || (/\.(?:js|mjs)(?:[?#]|$)/.test(u) ? 'script'
          : /\.css(?:[?#]|$)/.test(u) ? 'stylesheet'
          : /\.map(?:[?#]|$)/.test(u) ? 'sourcemap'
          : /post-publish-check/.test(u) ? 'fetch'
          : 'other');
      const bodyRedacted = REDACT_BODIES
        || (HASH_BODIES && (typeof fr?.body === 'string' && fr.body.startsWith('sha256:')
          || typeof lr?.body === 'string' && lr.body.startsWith('sha256:')));
      const isMatch = reasons.length === 0;
      // Always-present fixture-side enrichment (fixtures may not capture redirects/timing —
      // we still expose stable shapes so consumers never have to null-check the schema).
      const fixtureRedirect = Array.isArray(fr?.redirectChain) ? fr.redirectChain : [];
      const fixtureTiming = {
        startedAt: fr?.startedAt ?? fr?.at ?? null,
        durationMs: fr?.durationMs ?? null,
        recordedAt: fr?.at ?? null,
      };
      const liveRedirect = Array.isArray(liveHar?.redirectChain) ? liveHar.redirectChain
        : (Array.isArray(lr?.redirectChain) ? lr.redirectChain : []);
      const liveTiming = {
        startedAt: liveHar?.startedAt ?? lr?.startedAt ?? null,
        durationMs: liveHar?.durationMs ?? lr?.durationMs ?? null,
        recordedAt: lr?.at ?? null,
      };
      const item = {
        match: isMatch, url: u, index: i, reasons, kinds, resourceType, bodyRedacted,
        // Top-level convenience: union of both sides' redirect chains (live preferred when both present).
        redirectChain: liveRedirect.length ? liveRedirect : fixtureRedirect,
        timing: { fixture: fixtureTiming, live: liveTiming },
        fixture: fr ? {
          status: fr.status, headers: fr.headers || null, body: fr.body ?? null,
          bodyBytes: fr.bodyBytes ?? (fr.body ? String(fr.body).length : null),
          redirectChain: fixtureRedirect, timing: fixtureTiming,
        } : null,
        live: lr ? {
          status: lr.status, headers: lr.headers || null, body: lr.body ?? null,
          bodyBytes: lr.bodyBytes ?? (lr.body ? String(lr.body).length : null),
          har: liveHar, redirectChain: liveRedirect, timing: liveTiming,
        } : null,
      };


      items.push(item);
      if (!isMatch) {
        if (!fr) mismatches.push({ url: u, kind: 'only-live', index: i, status: lr.status });
        else if (!lr) mismatches.push({ url: u, kind: 'only-fixture', index: i, status: fr.status });
        else {
          if (fr.status !== lr.status) mismatches.push({ url: u, kind: 'status', index: i, fixture: fr.status, live: lr.status });
          const fb = (fr.body || ''), lb = (lr.body || '');
          if (fb !== lb) mismatches.push({ url: u, kind: 'body', index: i, fixtureBytes: fb.length, liveBytes: lb.length });
        }
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
  // Evaluate thresholds — exceedance is a meaningful regression.
  const thresholds = {
    maxMismatches: MAX_MISMATCHES, maxStatusMismatches: MAX_STATUS_MISMATCHES, maxBodyByteDelta: MAX_BODY_BYTE_DELTA,
    observed: { mismatchCount: mismatches.length, statusMismatchCount, maxBodyDelta },
    breached: [],
  };
  if (mismatches.length > MAX_MISMATCHES) thresholds.breached.push(`mismatches ${mismatches.length} > ${MAX_MISMATCHES}`);
  if (statusMismatchCount > MAX_STATUS_MISMATCHES) thresholds.breached.push(`statusMismatches ${statusMismatchCount} > ${MAX_STATUS_MISMATCHES}`);
  if (maxBodyDelta > MAX_BODY_BYTE_DELTA) thresholds.breached.push(`maxBodyDelta ${maxBodyDelta}B > ${MAX_BODY_BYTE_DELTA}B`);
  return {
    summary: {
      requestsFixture: fixtureReq.length,
      requestsLive: liveReq.length,
      responsesFixture: fixtureResp.length,
      responsesLive: liveResp.length,
      mismatchCount: mismatches.length,
      statusMismatchCount,
      maxBodyDelta,
      matchCount: items.filter((x) => x.match).length,
    },
    purgeTiming,
    thresholds,
    items, // full pair list — used by the HTML drilldown
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

  // HAR-like trace: keep per-request timing/redirect chain + (redacted) headers/body.
  const harByReq = new WeakMap();
  context.on('request', (req) => {
    const url = redactUrl(req.url());
    const startedAt = Date.now();
    const reqHeaders = redactHeaders(req.headers());
    const postData = redactBody(req.postData() || null);
    // Walk redirect chain back to origin (also used for the HAR entry below).
    const redirectChain = [];
    let rPrev = req.redirectedFrom();
    while (rPrev) { redirectChain.push(redactUrl(rPrev.url())); rPrev = rPrev.redirectedFrom(); }
    const entry = { scenario: name, at: startedAt, startedAt, method: req.method(), url, headers: reqHeaders, postData, redirectChain };
    appendNd(reqLog, entry);
    if (RECORD) requestRecording.push(entry);
    sc.liveRequests.push(entry);
    if (HASHED_JS_RE.test(url)) { assetReqs.push(url); sc.hashedJsUrls.add(url.split('?')[0]); }
    if (sc.topRequests.length < 25) sc.topRequests.push({ method: req.method(), url });

    // Walk redirect chain back to origin.
    const redirectChain = [];
    let r = req.redirectedFrom();
    while (r) { redirectChain.push(redactUrl(r.url())); r = r.redirectedFrom(); }
    const har = {
      startedAt,
      method: req.method(),
      url,
      resourceType: req.resourceType(),
      redirectedFrom: redirectChain[0] || null,
      redirectChain,
      requestHeaders: reqHeaders,
      requestBody: postData,
      status: null,
      mimeType: null,
      responseHeaders: null,
      responseBody: null,
      responseBodyBytes: null,
      durationMs: null,
      fromCache: false,
      failed: null,
    };
    harByReq.set(req, har);
    sc.har.push(har);
  });
  context.on('response', async (res) => {
    const u = redactUrl(res.url());
    const har = harByReq.get(res.request());
    let rawBody = null;
    try { rawBody = await res.text(); } catch { /* ignore */ }
    const bodyBytes = rawBody == null ? null : rawBody.length;
    const redacted = redactBody(rawBody);
    if (har) {
      har.status = res.status();
      har.mimeType = res.headers()['content-type'] || null;
      har.responseHeaders = redactHeaders(res.headers());
      har.responseBody = redacted;
      har.responseBodyBytes = bodyBytes;
      har.durationMs = Date.now() - har.startedAt;
      har.fromCache = !!res.fromServiceWorker?.();
    }
    if (!/\/api\/public\//.test(u)) return;
    const entry = {
      scenario: name, at: Date.now(), url: u, status: res.status(),
      headers: redactHeaders(res.headers()),
      body: redacted,
      bodyBytes,
    };
    appendNd(resLog, entry);
    if (RECORD) responseRecording.push(entry);
    sc.liveResponses.push(entry);
    if (/post-publish-check/.test(u)) {
      purgeResponses.push(entry);
      try {
        const j = JSON.parse((REDACT_BODIES ? rawBody : redacted) || '{}');
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
    // Threshold-based assertion: fail only on meaningful regressions.
    if (REPLAY && sc.replayDiff) {
      const t = sc.replayDiff.thresholds;
      const ok = t.breached.length === 0;
      currentScenario = name;
      record('live-vs-replay within configured thresholds', ok,
        ok ? `mismatches=${t.observed.mismatchCount} statusΔ=${t.observed.statusMismatchCount} maxBodyΔ=${t.observed.maxBodyDelta}B`
           : t.breached.join('; '),
        ok ? null : { thresholds: t, sample: sc.replayDiff.mismatches.slice(0, 10) });
    }

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
    cli: { ONLY, RECORD, REPLAY, FIXTURE_DIR, RETRIES, RETRY_DELAY_MS, DETERMINISTIC,
      MAX_MISMATCHES, MAX_STATUS_MISMATCHES, MAX_BODY_BYTE_DELTA,
      REDACT_BODIES, HASH_BODIES, MAX_BODY_BYTES, REDACT_HEADERS: [...REDACT_HEADERS], REDACT_URL_PARAMS: [...REDACT_URL_PARAMS],
      NORMALIZE_HEADERS, NORMALIZE_IGNORE_HEADERS: [...NORMALIZE_IGNORE_HEADERS],
      ARTIFACTS_ON_FAILURE_ONLY },

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
  // Collected as we render each scenario so the global "all bundles" button
  // can export every matched/mismatched pair across scenarios in one click.
  const allBundles = [];
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
        const renderSide = (label, side) => {
          if (!side) return `<div class="side"><b>${label}:</b> <span class="muted">— not present —</span></div>`;
          const hdrs = side.headers ? Object.entries(side.headers).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('\n') : '(none)';
          const body = side.body == null ? '(none)' : esc(String(side.body));
          const chain = side.har?.redirectChain?.length
            ? `<div><b>Redirect chain (${side.har.redirectChain.length}):</b><ol>${side.har.redirectChain.map((u) => `<li><code>${esc(u)}</code></li>`).join('')}</ol></div>` : '';
          const reqHdrs = side.har?.requestHeaders ? Object.entries(side.har.requestHeaders).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('\n') : null;
          const timing = side.har?.durationMs != null ? `<div class="muted">duration ${side.har.durationMs}ms · resourceType ${esc(side.har.resourceType || '')}${side.har.fromCache ? ' · from cache' : ''}${side.har.failed ? ' · failed ' + esc(side.har.failed) : ''}</div>` : '';
          return `<div class="side"><b>${label}</b> · status <code>${esc(side.status)}</code> · ${side.bodyBytes ?? (side.body ? side.body.length : 0)}B
            ${timing}
            ${reqHdrs ? `<details><summary>request headers</summary><pre>${reqHdrs}</pre></details>` : ''}
            <details><summary>response headers</summary><pre>${hdrs}</pre></details>
            <details><summary>response body</summary><pre>${body}</pre></details>
            ${chain}</div>`;
        };
        const items = d.items || [];
        const itemRows = items.map((it) => {
          const cls = it.match ? 'pass' : 'fail';
          const tag = it.match ? '✅ match' : `❌ ${esc(it.reasons.join(', '))}`;
          const dataKinds = esc((it.kinds && it.kinds.length ? it.kinds : ['match']).join(' '));
          return `<details class="drill ${cls}" data-match="${it.match ? '1' : '0'}" data-rtype="${esc(it.resourceType || 'other')}" data-kinds="${dataKinds}" data-redacted="${it.bodyRedacted ? '1' : '0'}"><summary>${tag} · <code>${esc(it.url)}</code> [#${it.index}] <span class="pill">${esc(it.resourceType || 'other')}</span>${it.bodyRedacted ? ' <span class="pill">redacted</span>' : ''}</summary>
            <div class="pair">${renderSide('fixture', it.fixture)}${renderSide('live', it.live)}</div>
          </details>`;
        }).join('') || '<p class="muted">no items captured</p>';
        const tBadge = d.thresholds.breached.length
          ? `<span class="badge bad">thresholds breached: ${esc(d.thresholds.breached.join('; '))}</span>`
          : `<span class="badge ok">within thresholds (max ${d.thresholds.maxMismatches}/${d.thresholds.maxStatusMismatches}/${d.thresholds.maxBodyByteDelta}B)</span>`;
        // Resource-type options for the filter dropdown.
        const rtypes = [...new Set(items.map((it) => it.resourceType || 'other'))].sort();
        const rtypeOpts = ['<option value="">all resource types</option>',
          ...rtypes.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`)].join('');
        const scId = esc(s.scenario);
        // Embed mismatch-bundle data so the in-page button can export without round-tripping.
        const bundle = JSON.stringify({
          scenario: s.scenario,
          generatedAt: new Date().toISOString(),
          redaction: { redactBodies: REDACT_BODIES, hashBodies: HASH_BODIES, maxBodyBytes: MAX_BODY_BYTES, redactHeaders: [...REDACT_HEADERS], redactUrlParams: [...REDACT_URL_PARAMS] },
          thresholds: d.thresholds,
          summary: d.summary,
          items,
        });
        const bundleB64 = Buffer.from(bundle, 'utf8').toString('base64');
        allBundles.push(JSON.parse(bundle));

        return `<details ${d.summary.mismatchCount ? 'open' : ''}><summary>Live vs replay (matches=${d.summary.matchCount}, mismatches=${d.summary.mismatchCount}, statusΔ=${d.summary.statusMismatchCount}, maxBodyΔ=${d.summary.maxBodyDelta}B)</summary>
          <p>${tBadge}</p>
          <h4>Purge call timing (relative to first purge per side)</h4>
          <table class="tbl"><thead><tr><th>#</th><th>fixture</th><th>live</th><th>Δ</th></tr></thead><tbody>${ptRows}</tbody></table>
          <h4>Per-request drilldown (${items.length})</h4>
          <div class="filters" data-scope="${scId}">
            <label>match: <select data-filter="match"><option value="">all</option><option value="0">mismatches only</option><option value="1">matches only</option></select></label>
            <label>resource: <select data-filter="rtype">${rtypeOpts}</select></label>
            <label>kind: <select data-filter="kind"><option value="">all kinds</option><option value="status">status</option><option value="body">body bytes</option><option value="headers">headers</option><option value="only-live">only-live</option><option value="only-fixture">only-fixture</option></select></label>
            <label>redacted: <select data-filter="redacted"><option value="">any</option><option value="1">redacted only</option><option value="0">non-redacted only</option></select></label>
            <button type="button" data-bundle="${scId}" data-bundle-b64="${bundleB64}">⬇ Download mismatch bundle</button>
            <span class="muted" data-visible-count></span>
          </div>
          <div class="drilldown" data-drilldown="${scId}">${itemRows}</div>
          ${d.truncated ? '<p class="muted">(mismatch summary truncated to first 40)</p>' : ''}
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
pre{background:#0b1220;border:1px solid #334155;padding:8px;border-radius:6px;font-size:12px;max-height:240px;overflow:auto;white-space:pre-wrap;word-break:break-all}
.drilldown{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.drill{border:1px solid #334155;border-radius:6px;padding:6px 10px;background:#0b1220}
.drill.pass{border-left:3px solid #10b981}.drill.fail{border-left:3px solid #ef4444}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}
.pair .side{background:#111827;border:1px solid #334155;border-radius:6px;padding:8px}
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0;font-size:13px}
.filters select,.filters button{background:#0b1220;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:4px 8px;font-size:13px}
.filters button{cursor:pointer}.filters button:hover{background:#1e293b}
a{color:#7dd3fc}
</style>
<script>
(function(){
  // Persist HTML report filter selections across reloads (per-scenario, scoped to this report path).
  var LS_KEY='phlabs.e2eStaleReport.filters@'+location.pathname;
  function loadAll(){try{return JSON.parse(localStorage.getItem(LS_KEY)||'{}')||{};}catch(e){return {};}}
  function saveAll(state){try{localStorage.setItem(LS_KEY,JSON.stringify(state));}catch(e){/* quota / disabled */}}
  function apply(scope){
    var root=document.querySelector('[data-drilldown="'+scope+'"]');if(!root)return;
    var ctrls=document.querySelector('.filters[data-scope="'+scope+'"]');if(!ctrls)return;
    var f={match:'',rtype:'',kind:'',redacted:''};
    ctrls.querySelectorAll('select[data-filter]').forEach(function(s){f[s.dataset.filter]=s.value;});
    var n=0;
    root.querySelectorAll('details.drill').forEach(function(el){
      var ok=true;
      if(f.match!==''&&el.dataset.match!==f.match)ok=false;
      if(f.rtype&&el.dataset.rtype!==f.rtype)ok=false;
      if(f.kind&&(' '+el.dataset.kinds+' ').indexOf(' '+f.kind+' ')===-1)ok=false;
      if(f.redacted!==''&&el.dataset.redacted!==f.redacted)ok=false;
      el.style.display=ok?'':'none';if(ok)n++;
    });
    var c=ctrls.querySelector('[data-visible-count]');if(c)c.textContent='('+n+' visible)';
    var all=loadAll();all[scope]=f;saveAll(all);
  }
  function restore(){
    var all=loadAll();
    document.querySelectorAll('.filters[data-scope]').forEach(function(ctrls){
      var scope=ctrls.dataset.scope;var saved=all[scope];if(!saved)return;
      ctrls.querySelectorAll('select[data-filter]').forEach(function(s){
        var v=saved[s.dataset.filter];if(v!=null){
          // Only restore if option exists, else leave default.
          if([].some.call(s.options,function(o){return o.value===v;}))s.value=v;
        }
      });
    });
  }
  function visibleKeys(scope){
    var root=document.querySelector('[data-drilldown="'+scope+'"]');
    var allowed=new Set();
    if(!root)return allowed;
    root.querySelectorAll('details.drill').forEach(function(el){
      if(el.style.display!=='none'){
        var m=el.querySelector('summary').textContent.match(/#(\\d+)/);
        var url=el.querySelector('code').textContent;
        allowed.add(url+'#'+(m?m[1]:''));
      }
    });
    return allowed;
  }
  function currentFilters(ctrls){
    var f={};ctrls.querySelectorAll('select[data-filter]').forEach(function(s){f[s.dataset.filter]=s.value;});return f;
  }
  function download(name,obj){
    var blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download=name;document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},0);
  }
  document.addEventListener('change',function(e){
    var s=e.target.closest('.filters');if(!s||!s.dataset.scope)return;apply(s.dataset.scope);
  });
  document.addEventListener('click',function(e){
    var b=e.target.closest('button[data-bundle]');
    if(b){
      var scope=b.dataset.bundle;
      var ctrls=document.querySelector('.filters[data-scope="'+scope+'"]');
      var allowed=visibleKeys(scope);
      var data=JSON.parse(atob(b.dataset.bundleB64));
      data.items=data.items.filter(function(it){return allowed.has(it.url+'#'+it.index);});
      data.exportedAt=new Date().toISOString();
      data.filterApplied=currentFilters(ctrls);
      return download('mismatch-bundle-'+scope+'.json',data);
    }
    var g=e.target.closest('button[data-global-bundle]');
    if(g){
      // Export every matched/mismatched pair across all scenarios, respecting each
      // scenario's currently-applied filter (resource/kind/match/redacted state).
      var all=JSON.parse(atob(g.dataset.globalBundleB64));
      var perScenarioFilters={};
      all.scenarios=all.scenarios.map(function(sc){
        var ctrls=document.querySelector('.filters[data-scope="'+sc.scenario+'"]');
        var allowed=visibleKeys(sc.scenario);
        perScenarioFilters[sc.scenario]=ctrls?currentFilters(ctrls):null;
        sc.items=sc.items.filter(function(it){return allowed.has(it.url+'#'+it.index);});
        return sc;
      });
      all.exportedAt=new Date().toISOString();
      all.filtersApplied=perScenarioFilters;
      return download('mismatch-bundle-all-scenarios.json',all);
    }
  });
  document.addEventListener('DOMContentLoaded',function(){
    restore();
    document.querySelectorAll('.filters[data-scope]').forEach(function(s){apply(s.dataset.scope);});
  });
})();
</script></head><body>

<header class="top">
  <h1>E2E stale-assets <span class="badge ${failed.length ? 'bad' : 'ok'}">${esc(overall)}</span></h1>
  <div class="muted">target <code>${esc(TARGET)}</code> · finished ${esc(summary.finishedAt)} · ${summary.passed}/${summary.total} passed${ONLY ? ` · filter <code>${esc(ONLY)}</code>` : ''}${REPLAY ? ' · <b>REPLAY</b>' : (RECORD ? ' · <b>RECORD</b>' : '')} · retries=${RETRIES}</div>
  ${allBundles.length ? `<button type="button" data-global-bundle="1" data-global-bundle-b64="${Buffer.from(JSON.stringify({ generatedAt: new Date().toISOString(), redaction: { redactBodies: REDACT_BODIES, hashBodies: HASH_BODIES, maxBodyBytes: MAX_BODY_BYTES, redactHeaders: [...REDACT_HEADERS], redactUrlParams: [...REDACT_URL_PARAMS] }, scenarios: allBundles }), 'utf8').toString('base64')}" style="margin-left:auto;background:#0b1220;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px">⬇ Download mismatch bundle (all scenarios)</button>` : ''}
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

  // --artifacts-on-failure-only: prune optional artifacts when the run is fully clean.
  // Always-kept: report.json, report.txt, junit.xml, db-diff.json (small, CI-friendly).
  // --prune-dry-run / --dry-run: log decisions without touching the filesystem.
  const meaningfulFailure = failed.length > 0
    || perScenarioSummary.some((s) => s.replayDiff && s.replayDiff.thresholds && s.replayDiff.thresholds.breached.length > 0);
  const alwaysKept = ['report.json', 'report.txt', 'junit.xml', 'db-diff.json'].map((n) => join(REPORT_DIR, n));
  const optional = [
    join(REPORT_DIR, 'report.html'),
    join(REPORT_DIR, 'requests.ndjson'),
    join(REPORT_DIR, 'responses.ndjson'),
    join(REPORT_DIR, 'console.ndjson'),
    join(REPORT_DIR, 'screenshots'),
    ...perScenarioSummary.map((s) => join(REPORT_DIR, `har-${s.scenario}.json`)),
    // Fixtures are only "optional" in non-RECORD mode (RECORD writes them as the point of the run).
    ...(RECORD ? [] : perScenarioSummary.map((s) => join(FIXTURE_DIR, s.scenario))),
  ];
  const outcome = meaningfulFailure ? 'failure' : 'success';
  if (ARTIFACTS_ON_FAILURE_ONLY || PRUNE_DRY_RUN) {
    const wouldDelete = (ARTIFACTS_ON_FAILURE_ONLY && !meaningfulFailure)
      ? optional.filter((p) => existsSync(p))
      : [];
    const wouldKeep = [...alwaysKept, ...optional.filter((p) => existsSync(p) && !wouldDelete.includes(p))];
    const tag = PRUNE_DRY_RUN ? '[artifacts-prune][dry-run]' : '[artifacts-on-failure-only]';
    console.log(`${tag} outcome=${outcome} artifacts-on-failure-only=${ARTIFACTS_ON_FAILURE_ONLY} dry-run=${PRUNE_DRY_RUN}`);
    for (const p of wouldKeep) console.log(`${tag}   keep:   ${p}`);
    for (const p of wouldDelete) console.log(`${tag}   delete: ${p}`);
    if (!PRUNE_DRY_RUN && wouldDelete.length) {
      let pruned = 0;
      for (const p of wouldDelete) {
        try { rmSync(p, { recursive: true, force: true }); pruned++; } catch { /* ignore */ }
      }
      console.log(`${tag} pruned ${pruned}/${wouldDelete.length} optional artifact path(s)`);
    } else if (PRUNE_DRY_RUN) {
      console.log(`${tag} no filesystem changes made (dry-run); would delete ${wouldDelete.length} path(s), keep ${wouldKeep.length}`);
    } else {
      console.log(`[artifacts-on-failure-only] outcome=${outcome} → nothing to prune`);
    }
  }






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
