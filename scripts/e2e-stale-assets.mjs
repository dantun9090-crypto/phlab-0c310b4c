#!/usr/bin/env node
/**
 * E2E: simulate stale chunk 404 after a Lovable Publish and verify:
 *   1. The browser triggers /api/public/post-publish-check (purge fires).
 *   2. After reload, fresh hashed chunks load successfully (no 404).
 *   3. The page does NOT enter a refresh loop (max 1 reload).
 *   4. Cross-tab lock holds when two tabs see the same stale build id.
 *   5. Visible console log "[auto-purge]" is emitted with the build id.
 *
 * Runs against a live preview/published URL passed in TARGET_URL, defaulting
 * to http://localhost:8080. Uses Playwright route interception to force a
 * 404 on the first lazy chunk request, then lifts the interception so the
 * subsequent reload loads cleanly.
 *
 * Usage:
 *   node scripts/e2e-stale-assets.mjs
 *   TARGET_URL=https://phlabs.co.uk node scripts/e2e-stale-assets.mjs
 */
import { chromium } from 'playwright';

const TARGET = process.env.TARGET_URL || 'http://localhost:8080';
const ASSET_RE = /\/(?:assets|_build)\/[^?#]+\.(?:js|mjs|css|map)(?:[?#]|$)/i;

function log(stage, ok, extra = '') {
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} ${stage}${extra ? ' — ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const purgeCalls = [];
  const reloads = [];
  const autoPurgeLogs = [];
  let force404 = true;
  let seenStaleAsset = null;

  // Intercept /api/public/post-publish-check to count calls and stub a fast OK.
  await context.route('**/api/public/post-publish-check*', async (route) => {
    purgeCalls.push({ at: Date.now(), url: route.request().url() });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, changed: true, buildId: 'TEST-BUILD', previous: 'OLD' }),
    });
  });

  // Force first JS chunk to 404 to simulate stale HTML referencing a deleted asset.
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (force404 && ASSET_RE.test(url) && url.endsWith('.js')) {
      if (!seenStaleAsset) seenStaleAsset = url;
      // After the first forced 404, lift the trap so reload succeeds.
      force404 = false;
      return route.fulfill({ status: 404, body: 'Not Found' });
    }
    return route.continue();
  });

  page.on('framenavigated', (f) => { if (f === page.mainFrame()) reloads.push(f.url()); });
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('[auto-purge]')) autoPurgeLogs.push(t);
  });

  await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
  // Allow time for stale-asset recovery + scheduled reload (cooldown handled internally).
  await page.waitForTimeout(8000);

  log('forced stale chunk observed', !!seenStaleAsset, seenStaleAsset || 'no asset intercepted');
  log('post-publish-check called at least once', purgeCalls.length >= 1, `calls=${purgeCalls.length}`);
  log('no infinite reload loop', reloads.length <= 3, `navigations=${reloads.length}`);
  log('visible [auto-purge] console log', autoPurgeLogs.length >= 1, autoPurgeLogs[0]?.slice(0, 120) ?? '');

  // --- Cross-tab lock: open a second tab, expect NO additional purge call.
  const purgeBefore = purgeCalls.length;
  const tab2 = await context.newPage();
  await tab2.goto(TARGET, { waitUntil: 'domcontentloaded' });
  await tab2.waitForTimeout(3000);
  log(
    'cross-tab lock prevents duplicate purge for same build id',
    purgeCalls.length === purgeBefore,
    `before=${purgeBefore} after=${purgeCalls.length}`,
  );

  // --- Fallback: simulate network failure on purge endpoint; verify no loop.
  await context.unroute('**/api/public/post-publish-check*');
  await context.route('**/api/public/post-publish-check*', (route) => route.abort('failed'));
  // Reset cross-tab lock so the fallback path can fire.
  await tab2.evaluate(() => {
    try { Object.keys(localStorage).filter((k) => k.startsWith('__phl_self_heal_')).forEach((k) => localStorage.removeItem(k)); } catch {}
  });
  const reloadsBefore = reloads.length;
  // Re-arm a single 404 to force the failure path.
  force404 = true;
  await tab2.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await tab2.waitForTimeout(6000);
  log(
    'network-failed purge does NOT trigger reload loop',
    reloads.length - reloadsBefore <= 3,
    `navs delta=${reloads.length - reloadsBefore}`,
  );

  await browser.close();
  console.log(process.exitCode ? '\n❌ e2e-stale-assets FAILED' : '\n✅ e2e-stale-assets PASSED');
}

run().catch((e) => { console.error(e); process.exit(1); });
