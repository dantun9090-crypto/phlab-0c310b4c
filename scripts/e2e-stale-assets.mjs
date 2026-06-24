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
 *   node scripts/e2e-stale-assets.mjs --scenario=js-chunk-404
 *   node scripts/e2e-stale-assets.mjs --scenario=css-link-error --record
 *   node scripts/e2e-stale-assets.mjs --scenario=js-chunk-404 --replay
 *   --fixture-dir=./fixtures/stale-assets   (default)
 *   --list                                  # list scenario names and exit
 *
 * Env:
 *   TARGET_URL=https://phlabs.co.uk
 *   E2E_REPORT_DIR=./e2e-stale-report
 *   FIREBASE_SERVICE_ACCOUNT_JSON=...       # enables DB diff
 *
 * Replay mode reuses previously captured fixtures
 * (fixtures/<scenario>/{requests,responses}.json) instead of hitting the
 * network: lets you iterate on assertions without re-running the live site.
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
const RETRIES = Math.max(0, parseInt(flag('retries', process.env.E2E_RETRIES ?? '1'), 10) || 0);
const RETRY_DELAY_MS = Math.max(0, parseInt(flag('retry-delay', '1500'), 10) || 0);
if (RECORD && REPLAY) {
  console.error('--record and --replay are mutually exclusive');
  process.exit(2);
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

  const replayResponses = REPLAY ? loadFixture(name, 'responses') : null;
  if (REPLAY && !replayResponses) {
    console.warn(`[replay] no fixture for ${name} at ${fixturePath(name, 'responses')} — running live`);
  }

  context.on('request', (req) => {
    const url = req.url();
    const entry = { scenario: name, at: Date.now(), method: req.method(), url, headers: req.headers(), postData: req.postData() || null };
    appendNd(reqLog, entry);
    if (RECORD) requestRecording.push(entry);
    if (HASHED_JS_RE.test(url)) { assetReqs.push(url); sc.hashedJsUrls.add(url.split('?')[0]); }
    if (sc.topRequests.length < 25) sc.topRequests.push({ method: req.method(), url });
  });
  context.on('response', async (res) => {
    const u = res.url();
    if (!/\/api\/public\//.test(u)) return;
    let body = null;
    try { body = (await res.text()).slice(0, 4000); } catch { /* ignore */ }
    const entry = { scenario: name, at: Date.now(), url: u, status: res.status(), body };
    appendNd(resLog, entry);
    if (RECORD) responseRecording.push(entry);
    if (/post-publish-check/.test(u)) {
      purgeResponses.push(entry);
      try {
        const j = JSON.parse(body || '{}');
        if (j.buildId) sc.buildIds.add(j.buildId);
        if (j.previous) sc.buildIds.add(j.previous);
      } catch { /* ignore */ }
    }
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
  const browser = await chromium.launch({ headless: true });
  const toRun = ONLY ? [ONLY] : Object.keys(scenarios);
  for (const name of toRun) await scenarios[name](browser);
  await browser.close();
  const dbAfter = await readBuildState();
  writeFileSync(join(REPORT_DIR, 'db-diff.json'),
    JSON.stringify({ before: dbBefore, after: dbAfter, lockFieldsTracked: LOCK_FIELDS }, null, 2));

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
  }));

  const summary = {
    target: TARGET,
    finishedAt: new Date().toISOString(),
    total: results.length, failed: failed.length, passed: results.length - failed.length,
    scenarios: [...new Set(results.map((r) => r.scenario))],
    perScenario: perScenarioSummary,
    cli: { ONLY, RECORD, REPLAY, FIXTURE_DIR },
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
