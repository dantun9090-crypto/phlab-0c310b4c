#!/usr/bin/env node
/**
 * Playwright UI test for the e2e stale-asset HTML report.
 *
 * Verifies the browser-side behaviour of report.html WITHOUT needing a full
 * e2e run: we render a minimal HTML page containing the same client script
 * (scripts/lib/e2e-report-client.mjs) plus a synthetic mismatch bundle, then
 * exercise:
 *
 *   1. Global "Download mismatch bundle (all scenarios)" button — captures
 *      the download, parses the JSON, and validates it against
 *      validateGlobalMismatchBundle (the same schema the report enforces).
 *   2. Filter selections persist via localStorage — pick filter values,
 *      reload the page, assert the selects are restored.
 *   3. Global "Download as ZIP" button — captures the ZIP, asserts the PK
 *      magic bytes are present and the file is non-empty.
 *
 * Usage:
 *   node scripts/e2e-stale-report-ui.mjs
 *   (exits non-zero on failure; writes details to stdout)
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { REPORT_CLIENT_SCRIPT } from './lib/e2e-report-client.mjs';
import {
  BUNDLE_SCHEMA_VERSION,
  MIN_SUPPORTED_SCHEMA_VERSION,
  validateMismatchBundle,
  validateGlobalMismatchBundle,
} from './lib/e2e-diff-helpers.mjs';

const WORK = join(tmpdir(), 'phlabs-e2e-stale-report-ui');
mkdirSync(WORK, { recursive: true });

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log(`✅ ${msg}`); return; }
  console.log(`❌ ${msg}`); failures++;
}

// ── synthetic bundle (shape must satisfy validateMismatchBundle) ────────────
function makeItem(over = {}) {
  return {
    match: true, url: 'http://localhost:8080/assets/main.js', index: 0,
    reasons: [], kinds: [], resourceType: 'script', bodyRedacted: false,
    redirectChain: [], timing: { fixture: { startedAt: 1, durationMs: 5, recordedAt: 2 }, live: { startedAt: 3, durationMs: 7, recordedAt: 4 } },
    fixture: { status: 200, headers: null, body: null, bodyBytes: 0, redirectChain: [], timing: { startedAt: 1, durationMs: 5, recordedAt: 2 } },
    live:    { status: 200, headers: null, body: null, bodyBytes: 0, redirectChain: [], timing: { startedAt: 3, durationMs: 7, recordedAt: 4 } },
    ...over,
  };
}
function makeScenario(name, items) {
  return {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    scenario: name,
    generatedAt: new Date().toISOString(),
    redaction: { redactBodies: false, hashBodies: false, maxBodyBytes: 4000, redactHeaders: [], redactUrlParams: [] },
    thresholds: { maxMismatches: 0, maxStatusMismatches: 0, maxBodyByteDelta: 0, observed: {}, breached: [] },
    summary: { matchCount: items.filter((i) => i.match).length, mismatchCount: items.filter((i) => !i.match).length, statusMismatchCount: 0, maxBodyDelta: 0 },
    items,
  };
}

const scenarios = [
  makeScenario('js-chunk-404', [
    makeItem({ index: 0 }),
    makeItem({ index: 1, match: false, reasons: ['status'], kinds: ['status'], url: 'http://localhost:8080/assets/x.js' }),
  ]),
  makeScenario('css-link-error', [
    makeItem({ index: 0, resourceType: 'stylesheet', url: 'http://localhost:8080/assets/main.css' }),
  ]),
];
const globalBundle = {
  schemaVersion: BUNDLE_SCHEMA_VERSION,
  generatedAt: new Date().toISOString(),
  redaction: { redactBodies: false, hashBodies: false, maxBodyBytes: 4000, redactHeaders: [], redactUrlParams: [] },
  scenarios,
};

// Render minimal HTML mirroring report.html structure (filters + drilldown + buttons).
function renderHtml() {
  const renderItem = (it) =>
    `<details class="drill" data-match="${it.match ? '1' : '0'}" data-rtype="${it.resourceType}" data-kinds="${(it.kinds.length ? it.kinds : ['match']).join(' ')}" data-redacted="${it.bodyRedacted ? '1' : '0'}">
      <summary>${it.match ? '✅ match' : '❌ ' + it.reasons.join(',')} · <code>${it.url}</code> [#${it.index}]</summary>
    </details>`;
  const renderScenario = (sc) => {
    const b64 = Buffer.from(JSON.stringify(sc), 'utf8').toString('base64');
    return `<section><h3>${sc.scenario}</h3>
      <div class="filters" data-scope="${sc.scenario}">
        <label>match: <select data-filter="match"><option value="">all</option><option value="0">mismatches only</option><option value="1">matches only</option></select></label>
        <label>resource: <select data-filter="rtype"><option value="">all</option><option value="script">script</option><option value="stylesheet">stylesheet</option></select></label>
        <label>kind: <select data-filter="kind"><option value="">all</option><option value="status">status</option><option value="body">body</option></select></label>
        <label>redacted: <select data-filter="redacted"><option value="">any</option><option value="1">redacted</option><option value="0">not</option></select></label>
        <button type="button" data-bundle="${sc.scenario}" data-bundle-b64="${b64}">⬇ bundle</button>
        <span data-visible-count></span>
      </div>
      <div class="drilldown" data-drilldown="${sc.scenario}">${sc.items.map(renderItem).join('')}</div>
    </section>`;
  };
  const gb64 = Buffer.from(JSON.stringify(globalBundle), 'utf8').toString('base64');
  return `<!doctype html><html><head><meta charset="utf-8"><title>ui-test</title>
    <script>${REPORT_CLIENT_SCRIPT}</script></head><body>
    <header><h1>ui-test</h1>
      <button type="button" data-global-bundle="1" data-global-bundle-b64="${gb64}">⬇ Download mismatch bundle (all scenarios)</button>
      <button type="button" data-global-bundle="1" data-global-bundle-b64="${gb64}" data-mismatch-only="1">⬇ Download mismatches only (JSON)</button>
      <button type="button" data-global-zip="1" data-global-bundle-b64="${gb64}">⬇ Download as ZIP</button>
      <button type="button" data-global-zip="1" data-global-bundle-b64="${gb64}" data-mismatch-only="1">⬇ Download mismatches only (ZIP)</button>
    </header>
    ${scenarios.map(renderScenario).join('')}
  </body></html>`;
}

const htmlPath = join(WORK, 'report.html');
writeFileSync(htmlPath, renderHtml());
const fileUrl = 'file://' + htmlPath;

async function captureDownload(page, trigger) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  const dest = join(WORK, download.suggestedFilename());
  await download.saveAs(dest);
  return { path: dest, name: download.suggestedFilename() };
}

(async () => {
  const launchOpts = { headless: true };
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) launchOpts.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  const browser = await chromium.launch(launchOpts);

  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });

  // 1) Global JSON bundle: download, parse, validate against schema.
  const json = await captureDownload(page, () => page.click('button[data-global-bundle]'));
  assert(existsSync(json.path), `JSON bundle downloaded → ${json.name}`);
  const parsed = JSON.parse(readFileSync(json.path, 'utf8'));
  const v = validateGlobalMismatchBundle(parsed);
  assert(v.ok, `downloaded global bundle validates (${v.errors.join('; ') || 'no errors'})`);
  assert(parsed.schemaVersion === BUNDLE_SCHEMA_VERSION, 'global bundle carries schemaVersion');
  assert(parsed.exportedAt && typeof parsed.exportedAt === 'string', 'global bundle stamped with exportedAt');
  assert(parsed.filtersApplied && typeof parsed.filtersApplied === 'object', 'global bundle records filtersApplied');
  for (const sc of parsed.scenarios) {
    const sv = validateMismatchBundle(sc);
    assert(sv.ok, `nested scenario "${sc.scenario}" validates (${sv.errors.join('; ') || 'no errors'})`);
    for (const it of sc.items) {
      assert(Array.isArray(it.redirectChain), `item ${sc.scenario}#${it.index} has redirectChain`);
      assert(it.timing && it.timing.fixture && it.timing.live, `item ${sc.scenario}#${it.index} has timing.{fixture,live}`);
    }
  }

  // 2) Filter persistence: set selects, reload, assert restored.
  await page.selectOption('.filters[data-scope="js-chunk-404"] select[data-filter="match"]', '0');
  await page.selectOption('.filters[data-scope="js-chunk-404"] select[data-filter="rtype"]', 'script');
  await page.selectOption('.filters[data-scope="css-link-error"] select[data-filter="kind"]', 'status');
  await page.waitForTimeout(50); // allow change handler to write localStorage
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(50);
  const restoredMatch = await page.inputValue('.filters[data-scope="js-chunk-404"] select[data-filter="match"]');
  const restoredRtype = await page.inputValue('.filters[data-scope="js-chunk-404"] select[data-filter="rtype"]');
  const restoredKind  = await page.inputValue('.filters[data-scope="css-link-error"] select[data-filter="kind"]');
  assert(restoredMatch === '0', `filter "match" restored from localStorage (got "${restoredMatch}")`);
  assert(restoredRtype === 'script', `filter "rtype" restored from localStorage (got "${restoredRtype}")`);
  assert(restoredKind === 'status', `filter "kind" restored from localStorage (got "${restoredKind}")`);

  // 3) ZIP download: PK magic + non-empty.
  const zip = await captureDownload(page, () => page.click('button[data-global-zip]:not([data-mismatch-only])'));
  const bytes = readFileSync(zip.path);
  assert(bytes.length > 22, `ZIP non-trivial size (${bytes.length}B)`);
  assert(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04, 'ZIP starts with PK\\x03\\x04 local-file magic');
  const eocd = bytes.slice(bytes.length - 22);
  assert(eocd[0] === 0x50 && eocd[1] === 0x4b && eocd[2] === 0x05 && eocd[3] === 0x06, 'ZIP ends with EOCD record');

  // 3b) Parse ZIP STORE entries and verify manifest references every scenario file.
  const zipEntries = parseZipStore(bytes);
  const names = new Set(zipEntries.map((e) => e.name));
  assert(names.has('manifest.json'), 'ZIP contains manifest.json');
  const manifest = JSON.parse(zipEntries.find((e) => e.name === 'manifest.json').text);
  assert(Array.isArray(manifest.scenarios) && manifest.scenarios.length === scenarios.length,
    `manifest lists ${scenarios.length} scenarios (got ${manifest.scenarios?.length})`);
  for (const m of manifest.scenarios) {
    assert(typeof m.file === 'string' && names.has(m.file), `manifest scenario "${m.scenario}" references existing file "${m.file}"`);
    const entry = zipEntries.find((e) => e.name === m.file);
    const sc = JSON.parse(entry.text);
    const sv = validateMismatchBundle(sc);
    assert(sv.ok, `ZIP scenario "${m.scenario}" validates (${sv.errors.join('; ') || 'no errors'})`);
    assert(sc.schemaVersion === BUNDLE_SCHEMA_VERSION, `ZIP scenario "${m.scenario}" carries current schemaVersion`);
  }

  // 4) Mismatch-only JSON: assert only items with match===false survive, redirectChain+timing intact.
  const mmJson = await captureDownload(page, () => page.click('button[data-global-bundle][data-mismatch-only]'));
  const mm = JSON.parse(readFileSync(mmJson.path, 'utf8'));
  assert(mm.mismatchOnly === true, 'mismatch-only JSON stamped with mismatchOnly:true');
  const mmv = validateGlobalMismatchBundle(mm);
  assert(mmv.ok, `mismatch-only JSON validates (${mmv.errors.join('; ') || 'no errors'})`);
  let totalKept = 0;
  for (const sc of mm.scenarios) {
    for (const it of sc.items) {
      assert(it.match === false, `mismatch-only items are all mismatches (saw match=${it.match})`);
      assert(Array.isArray(it.redirectChain), 'mismatch-only item keeps redirectChain');
      assert(it.timing && it.timing.fixture && it.timing.live, 'mismatch-only item keeps timing.{fixture,live}');
      totalKept++;
    }
  }
  assert(totalKept >= 1, `mismatch-only bundle is non-empty (kept ${totalKept})`);

  // 4b) Mismatch-only ZIP: parse + assert per-scenario items are mismatch-only.
  const mmZip = await captureDownload(page, () => page.click('button[data-global-zip][data-mismatch-only]'));
  const mmZipBytes = readFileSync(mmZip.path);
  const mmZipEntries = parseZipStore(mmZipBytes);
  const mmManifest = JSON.parse(mmZipEntries.find((e) => e.name === 'manifest.json').text);
  assert(mmManifest.mismatchOnly === true, 'mismatch-only ZIP manifest carries mismatchOnly:true');
  for (const m of mmManifest.scenarios) {
    const sc = JSON.parse(mmZipEntries.find((e) => e.name === m.file).text);
    for (const it of sc.items) {
      assert(it.match === false, `ZIP mismatch-only scenario "${m.scenario}" item is mismatch`);
    }
  }

  // 5) Progress indicator: click button, synchronously read aria-busy + disabled
  // before the setTimeout-deferred work runs.
  const dlPromise = page.waitForEvent('download');
  const busyState = await page.evaluate(() => {
    const btn = document.querySelector('button[data-global-zip]:not([data-mismatch-only])');
    btn.click();
    return { busy: btn.getAttribute('aria-busy'), disabled: btn.disabled, text: btn.textContent };
  });
  assert(busyState.busy === 'true', `progress: button has aria-busy="true" during work (got "${busyState.busy}")`);
  assert(busyState.disabled === true, 'progress: button is disabled during work');
  assert(/⏳/.test(busyState.text || ''), `progress: button shows spinner glyph (text="${busyState.text}")`);
  const dl5 = await dlPromise;
  await dl5.saveAs(join(WORK, 'progress-' + dl5.suggestedFilename()));
  await page.waitForTimeout(50);
  const restored = await page.evaluate(() => {
    const btn = document.querySelector('button[data-global-zip]:not([data-mismatch-only])');
    return { busy: btn.getAttribute('aria-busy'), disabled: btn.disabled };
  });
  assert(restored.busy === null && restored.disabled === false, 'progress: button restored after work completes');

  // 6) Backward-compat schemaVersion: older bundle validates with warnings (not errors).
  // Simulate an older schemaVersion bundle by patching a known-good one.
  const older = JSON.parse(JSON.stringify(parsed));
  older.schemaVersion = MIN_SUPPORTED_SCHEMA_VERSION; // == current today, but exercise path
  const ov = validateGlobalMismatchBundle(older);
  assert(ov.ok, 'min-supported schemaVersion validates ok');
  // Newer-than-supported must fail with a clear error.
  const newer = JSON.parse(JSON.stringify(parsed));
  newer.schemaVersion = BUNDLE_SCHEMA_VERSION + 99;
  const nv = validateGlobalMismatchBundle(newer);
  assert(!nv.ok, 'schemaVersion above current is rejected');
  assert(nv.errors.join(' ').match(/newer than supported/), 'rejection message names the version drift');

  await browser.close();
  console.log(`\nWork dir: ${WORK}`);
  if (failures) { console.log(`\n❌ ${failures} assertion(s) failed`); process.exit(1); }
  console.log(`\n✅ all UI assertions passed`);
})().catch((e) => { console.error(e); process.exit(1); });

// ── Minimal STORE-only ZIP reader (no deps) ──────────────────────────────────
// Parses Local File Headers sequentially. Only supports STORE (method 0),
// which matches what scripts/lib/e2e-report-client.mjs writes.
function parseZipStore(buf) {
  const entries = [];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let i = 0;
  while (i + 4 <= buf.length) {
    const sig = dv.getUint32(i, true);
    if (sig !== 0x04034b50) break; // hit central dir or EOCD
    const method = dv.getUint16(i + 8, true);
    const compSize = dv.getUint32(i + 18, true);
    const nameLen = dv.getUint16(i + 26, true);
    const extraLen = dv.getUint16(i + 28, true);
    const name = buf.slice(i + 30, i + 30 + nameLen).toString('utf8');
    const dataStart = i + 30 + nameLen + extraLen;
    const data = buf.slice(dataStart, dataStart + compSize);
    if (method !== 0) throw new Error(`unexpected compression method ${method} for ${name}`);
    entries.push({ name, data, text: data.toString('utf8') });
    i = dataStart + compSize;
  }
  return entries;
}
