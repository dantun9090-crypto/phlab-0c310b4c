/**
 * Regression guards for the 2026-07-18 Prerender.io quota-burn incident.
 *
 * These assert *behavior at the source-file level* (no live Worker required)
 * so CI catches a regression the moment someone re-broadens the allowlist,
 * re-enables the 15-min cron, or removes a scanner block.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const worker = readFileSync(
  join(ROOT, 'cloudflare/phlabs-prerender.mjs'),
  'utf8',
);
const hook = readFileSync(
  join(ROOT, 'src/routes/api/public/hooks/prerender-recache.ts'),
  'utf8',
);
const monitor = readFileSync(
  join(ROOT, '.github/workflows/googlebot-prerender-monitor.yml'),
  'utf8',
);
const deploy = readFileSync(
  join(ROOT, '.github/workflows/deploy-worker.yml'),
  'utf8',
);

describe('Prerender quota guards (BATCH 1 + 2)', () => {
  it('worker uses an EXPLICIT allowlist, not a catch-all /bot/i', () => {
    expect(worker).toContain('PRERENDER_ALLOWLIST_UAS');
    expect(worker).toContain('/googlebot/i');
    // Old catch-all patterns must be gone.
    expect(worker).not.toMatch(/\/bot\/i\s*,/);
    expect(worker).not.toMatch(/\/crawler\/i\s*,/);
    // Known freeloader scrapers must NOT be in the allowlist.
    expect(worker.toLowerCase()).not.toContain('ahrefsbot');
    expect(worker.toLowerCase()).not.toContain('semrushbot');
    expect(worker.toLowerCase()).not.toContain('mj12bot');
  });

  it('worker bypasses monitoring UAs before the bot branch', () => {
    expect(worker).toMatch(/MONITORING_UA_RX/);
    expect(worker).toMatch(/phlabs-/);
    expect(worker).toMatch(/Chrome-Lighthouse/);
    expect(worker).toMatch(/HeadlessChrome|headless/i);
    // Guard order: monitoring/probe check must gate isCrawler().
    const idxMon = worker.indexOf('isMonitoringUA');
    const idxBot = worker.indexOf('isCrawler(request)');
    expect(idxMon).toBeGreaterThan(0);
    expect(idxBot).toBeGreaterThan(idxMon);
  });

  it('worker never prerenders non-HTML paths (webmanifest, json, etc.)', () => {
    expect(worker).toMatch(/NON_HTML_EXT_RX/);
    expect(worker).toMatch(/webmanifest/);
  });

  it('worker returns 404 at the edge for scanner paths', () => {
    expect(worker).toMatch(/SCANNER_PATH_PREFIXES/);
    for (const p of ['/.env', '/.git', '/wp-', '/phpmyadmin']) {
      expect(worker).toContain(p);
    }
    expect(worker).toMatch(/status:\s*404[\s\S]{0,600}scanner-block/);
  });

  it('worker treats cache-buster probe params as monitoring', () => {
    expect(worker).toMatch(/PROBE_QUERY_PARAMS/);
    expect(worker).toMatch(/__cache_check/);
  });

  it('recache hook honors PRERENDER_RECACHE_ENABLED kill switch', () => {
    expect(hook).toMatch(/PRERENDER_RECACHE_ENABLED/);
    expect(hook).toMatch(/kill_switch/);
  });

  it('recache hook is capped at 50 URLs and mobile-only', () => {
    expect(hook).toMatch(/MAX_URLS_PER_RUN\s*=\s*50/);
    // No desktop-adaptive POST anymore.
    expect(hook).not.toMatch(/recacheBatch\([^)]*,\s*"desktop"\s*\)/);
    expect(hook).toMatch(/recacheBatch\([^)]*,\s*"mobile"\s*\)/);
  });

  it('recache hook skips URLs whose <lastmod> is unchanged', () => {
    expect(hook).toMatch(/lastmodByUrl/);
    expect(hook).toMatch(/no_lastmod_change/);
  });

  it('daily 03:00 UTC recache cron is decommissioned', () => {
    // The cron entry itself and the scheduled job must be gone.
    expect(monitor).not.toMatch(/cron:\s*["']0 3 \* \* \*["']/);
    expect(monitor).not.toMatch(/Prerender\.io recache warm \(daily/);
    expect(monitor).toMatch(/DECOMMISSIONED 2026-07-18/);
  });

  it('deploy-worker recache no longer double-posts desktop+mobile', () => {
    // Original inner loop was `for at in desktop mobile`. Must be gone.
    expect(deploy).not.toMatch(/for at in desktop mobile/);
    expect(deploy).toMatch(/adaptiveType\\":\\"mobile\\"/);
  });
});
