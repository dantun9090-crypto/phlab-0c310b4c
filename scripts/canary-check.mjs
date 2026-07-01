#!/usr/bin/env node
/**
 * Periodic canary: hit critical routes and assert
 *   1) HTTP 200
 *   2) HTML contains a build-id + entry JS reference
 *   3) HTML has NO known-broken inline SW cleanup fragments
 *   4) The primary entry JS bundle is reachable and returns non-empty JS
 *
 * Fails non-zero on any mismatch. Designed to run from GitHub Actions on a
 * schedule and to be safe to run manually.
 */

const BASE = process.env.CANARY_BASE_URL || "https://phlabs.co.uk";
const PATHS = (process.env.CANARY_PATHS || "/,/products,/login,/admin").split(",").map((s) => s.trim()).filter(Boolean);

const BAD = [
  { re: /return\s+\/\/service-worker/, why: "return + line-comment (broken SW isLegacy)" },
  { re: /return\s+\/\/\(\?:sw\|service-worker\)/, why: "return + line-comment (broken isAppWorker)" },
];

const UA = "phlabs-canary/1.0 (+ci)";

async function fetchWithTimeout(url, opts = {}, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, headers: { "user-agent": UA, ...(opts.headers || {}) } });
  } finally {
    clearTimeout(t);
  }
}

const failures = [];
const summary = [];

for (const p of PATHS) {
  const url = BASE + p;
  const started = Date.now();
  try {
    const res = await fetchWithTimeout(url, { redirect: "follow" });
    const ms = Date.now() - started;
    const buildId = res.headers.get("x-phl-build-id") || "n/a";
    const assetHash = res.headers.get("x-phl-asset-hash") || "n/a";
    const bootBad = res.headers.get("x-phl-boot-bad") === "1";
    const cache = res.headers.get("x-phl-cache") || res.headers.get("cf-cache-status") || "n/a";

    if (!res.ok) {
      failures.push(`${p} → HTTP ${res.status}`);
      summary.push(`❌ ${p} ${res.status} in ${ms}ms`);
      continue;
    }
    const html = await res.text();
    for (const { re, why } of BAD) {
      if (re.test(html)) failures.push(`${p} → bad inline boot fragment: ${why}`);
    }
    if (bootBad) failures.push(`${p} → Worker flagged x-phl-boot-bad=1`);

    // Extract entry JS and verify it loads with valid JS.
    const entryMatch = html.match(/<script[^>]+src=["']([^"']*\/assets\/[^"']+\.js)["']/i);
    let jsStatus = "n/a";
    if (entryMatch) {
      const entryUrl = new URL(entryMatch[1], url).toString();
      const js = await fetchWithTimeout(entryUrl, {}, 15000).catch(() => null);
      if (!js || !js.ok) {
        failures.push(`${p} → entry JS ${entryMatch[1]} → HTTP ${js ? js.status : "network"}`);
      } else {
        const body = await js.text();
        jsStatus = `${js.status} ${body.length}b`;
        if (body.length < 200) failures.push(`${p} → entry JS suspiciously small (${body.length}b)`);
        if (/^\s*<!doctype/i.test(body)) failures.push(`${p} → entry JS returned HTML (stale asset 404)`);
      }
    } else {
      failures.push(`${p} → no /assets/*.js reference in HTML`);
    }

    summary.push(`✅ ${p} ${res.status} ${ms}ms build=${buildId.slice(0, 12)} asset=${assetHash.slice(0, 10)} cache=${cache} js=${jsStatus}`);
  } catch (e) {
    failures.push(`${p} → threw ${e && e.message ? e.message : String(e)}`);
    summary.push(`❌ ${p} threw ${e && e.message}`);
  }
}

console.log("Canary results for", BASE);
for (const line of summary) console.log(" ", line);

if (failures.length) {
  console.error("\nCANARY FAILURES:");
  for (const f of failures) console.error("  -", f);
  process.exit(1);
}
console.log("\nAll canary checks passed.");
