#!/usr/bin/env node
/**
 * E2E: stale-asset recovery for phlabs.co.uk.
 *
 * Independently simulates three stale-build signals and asserts that the
 * client (a) calls /api/public/post-publish-check BEFORE the next load,
 * (b) reloads at most once and serves fresh hashed chunks, (c) emits a
 * visible "[auto-purge]" console log, and (d) honours the cross-tab and
 * network-failure locks.
 *
 * Scenarios (each runs in an isolated BrowserContext so locks/state don't
 * leak between them):
 *   1. JS chunk 404                  — classic stale lazy import
 *   2. Sourcemap 404 (skipped map)   — DevTools fetch fails silently in prod
 *   3. CSS <link> load error         — stale stylesheet referenced by HTML
 *   4. Cross-tab lock                — two tabs same build id, ONE purge call
 *   5. Network-fail fallback         — purge endpoint aborts, NO reload loop
 *
 * On ANY assertion failure the reporter writes a self-contained bundle to
 * $E2E_REPORT_DIR (default ./e2e-stale-report/) containing:
 *   - report.json / report.txt   — summary + per-scenario diagnostics
 *   - requests.ndjson            — every captured request payload + status
 *   - responses.ndjson           — response bodies for /api/public/* calls
 *   - console.ndjson             — full browser console log
 *   - db-diff.json               — before/after _meta/build_state snapshot
 *                                  (only when FIREBASE_SERVICE_ACCOUNT_JSON set)
 *   - screenshots/<scenario>.png — final viewport per scenario
 *
 * Usage:
 *   node scripts/e2e-stale-assets.mjs
 *   TARGET_URL=https://phlabs.co.uk node scripts/e2e-stale-assets.mjs
 *   E2E_REPORT_DIR=/tmp/report node scripts/e2e-stale-assets.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const TARGET = process.env.TARGET_URL || 'http://localhost:8080';
const REPORT_DIR = process.env.E2E_REPORT_DIR || join(process.cwd(), 'e2e-stale-report');
const ASSET_RE = /\/(?:assets|_build)\/[^?#]+\.(?:js|mjs|css|map)(?:[?#]|$)/i;
const SHOTS = join(REPORT_DIR, 'screenshots');
mkdirSync(SHOTS, { recursive: true });

const reqLog = join(REPORT_DIR, 'requests.ndjson');
const resLog = join(REPORT_DIR, 'responses.ndjson');
const conLog = join(REPORT_DIR, 'console.ndjson');
for (const p of [reqLog, resLog, conLog]) writeFileSync(p, '');

const results = []; // { scenario, stage, ok, extra, diagnostics }
let currentScenario = '(setup)';

function record(stage, ok, extra = '', diagnostics = null) {
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} [${currentScenario}] ${stage}${extra ? ' — ' + extra : ''}`);
  results.push({ scenario: currentScenario, stage, ok, extra, diagnostics: ok ? null : diagnostics });
  if (!ok) process.exitCode = 1;
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
  } catch (e) {
    return { error: String(e) };
  }
}

// ---------- one scenario harness ----------
async function withContext(browser, name, fn) {
  currentScenario = name;
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const purgeCalls = [];
  const autoPurgeLogs = [];
  const reloads = [];
  const allConsole = [];

  context.on('request', (req) => {
    appendNd(reqLog, {
      scenario: name, at: Date.now(), method: req.method(), url: req.url(),
      headers: req.headers(), postData: req.postData() || null,
    });
  });
  context.on('response', async (res) => {
    const u = res.url();
    if (!/\/api\/public\//.test(u)) return;
    let body = null;
    try { body = (await res.text()).slice(0, 4000); } catch { /* ignore */ }
    appendNd(resLog, { scenario: name, at: Date.now(), url: u, status: res.status(), body });
  });

  // Stub /api/public/post-publish-check (deterministic + cheap).
  await context.route('**/api/public/post-publish-check*', async (route) => {
    purgeCalls.push({ at: Date.now(), url: route.request().url() });
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, changed: true, buildId: 'E2E-NEW', previous: 'E2E-OLD' }),
    });
  });

  const page = await context.newPage();
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) reloads.push({ at: Date.now(), url: f.url() }); });
  page.on('console', (msg) => {
    const entry = { scenario: name, at: Date.now(), type: msg.type(), text: msg.text() };
    allConsole.push(entry);
    appendNd(conLog, entry);
    if (msg.text().includes('[auto-purge]')) autoPurgeLogs.push(msg.text());
  });

  try {
    await fn({ context, page, purgeCalls, autoPurgeLogs, reloads, allConsole });
  } finally {
    try { await page.screenshot({ path: join(SHOTS, `${name}.png`) }); } catch { /* ignore */ }
    await context.close();
  }
}

function diag(extra) {
  return {
    target: TARGET,
    scenario: currentScenario,
    hint: 'See requests.ndjson / responses.ndjson / console.ndjson for full payloads.',
    ...extra,
  };
}

// ---------- main ----------
async function run() {
  const dbBefore = await readBuildState();
  const browser = await chromium.launch({ headless: true });

  // 1) JS chunk 404
  await withContext(browser, 'js-chunk-404', async ({ context, page, purgeCalls, autoPurgeLogs, reloads }) => {
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
    record('post-publish-check called BEFORE reload', purgeCalls.length >= 1 && purgeCalls[0].at <= (reloads[1]?.at ?? Infinity),
      `calls=${purgeCalls.length} reloads=${reloads.length}`, diag({ purgeCalls, reloads }));
    record('no reload loop (≤2 navigations)', reloads.length <= 2, `n=${reloads.length}`, diag({ reloads }));
    record('visible [auto-purge] console log', autoPurgeLogs.length >= 1, autoPurgeLogs[0]?.slice(0, 120) ?? '', diag({ autoPurgeLogs }));
  });

  // 2) Sourcemap 404 — silent in prod; MUST NOT trigger reload but SHOULD log if detected.
  await withContext(browser, 'sourcemap-404', async ({ context, page, reloads, allConsole }) => {
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (/\.map(?:[?#]|$)/.test(url)) return route.fulfill({ status: 404, body: 'Not Found' });
      return route.continue();
    });
    await page.goto(TARGET, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(5000);
    record('sourcemap 404 does NOT cause reload loop', reloads.length <= 2, `n=${reloads.length}`,
      diag({ reloads, lastConsole: allConsole.slice(-20) }));
  });

  // 3) CSS link error — stale stylesheet.
  await withContext(browser, 'css-link-error', async ({ context, page, purgeCalls, autoPurgeLogs, reloads }) => {
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
      record('css stale link detected → purge fired BEFORE reload',
        purgeCalls.length >= 1 && purgeCalls[0].at <= (reloads[1]?.at ?? Infinity),
        `calls=${purgeCalls.length} reloads=${reloads.length}`, diag({ purgeCalls, reloads, seen }));
      record('css recovery does NOT loop', reloads.length <= 2, `n=${reloads.length}`, diag({ reloads }));
      record('visible [auto-purge] console log for css', autoPurgeLogs.length >= 1, '', diag({ autoPurgeLogs }));
    } else {
      record('css asset request observed', false, 'no CSS asset request seen — target may not ship CSS chunks', diag({}));
    }
  });

  // 4) Cross-tab lock — two tabs in SAME context share localStorage.
  await withContext(browser, 'cross-tab-lock', async ({ context, page, purgeCalls }) => {
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
    const tab2 = await context.newPage();
    await tab2.goto(TARGET, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await tab2.waitForTimeout(4000);
    record('cross-tab lock: ONE purge per build id across tabs',
      purgeCalls.length === before,
      `before=${before} after=${purgeCalls.length}`,
      diag({ purgeCallsBefore: before, purgeCallsAfter: purgeCalls.length, allCalls: purgeCalls }));
  });

  // 5) Network-failure fallback.
  await withContext(browser, 'network-fail-fallback', async ({ context, page, reloads }) => {
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
    record('aborted purge endpoint does NOT cause reload loop',
      reloads.length <= 2, `n=${reloads.length}`, diag({ reloads }));
  });

  await browser.close();
  const dbAfter = await readBuildState();
  writeFileSync(join(REPORT_DIR, 'db-diff.json'),
    JSON.stringify({ before: dbBefore, after: dbAfter }, null, 2));

  const failed = results.filter((r) => !r.ok);
  const summary = {
    target: TARGET,
    finishedAt: new Date().toISOString(),
    total: results.length,
    failed: failed.length,
    passed: results.length - failed.length,
    scenarios: [...new Set(results.map((r) => r.scenario))],
    results,
  };
  writeFileSync(join(REPORT_DIR, 'report.json'), JSON.stringify(summary, null, 2));
  writeFileSync(
    join(REPORT_DIR, 'report.txt'),
    [
      `E2E stale-assets — ${TARGET}`,
      `finished: ${summary.finishedAt}`,
      `total: ${summary.total}   passed: ${summary.passed}   failed: ${summary.failed}`,
      '',
      ...results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  [${r.scenario}]  ${r.stage}${r.extra ? '  — ' + r.extra : ''}`),
      '',
      failed.length ? 'See requests.ndjson, responses.ndjson, console.ndjson, db-diff.json, screenshots/ for diagnostics.' : '',
    ].join('\n'),
  );

  // JUnit XML for CI consumers.
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
  console.log(process.exitCode ? `\n❌ e2e-stale-assets FAILED (${failed.length}/${results.length})`
                                : `\n✅ e2e-stale-assets PASSED (${results.length}/${results.length})`);
}

run().catch((e) => {
  console.error(e);
  try { writeFileSync(join(REPORT_DIR, 'crash.txt'), String(e?.stack || e)); } catch { /* ignore */ }
  process.exit(1);
});
