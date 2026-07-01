#!/usr/bin/env node
/**
 * HEAD vs GET monitor — runs standalone (CI / cron / laptop) against the
 * two live hosts. Prints a compact report and exits non-zero ONLY when a
 * GET (real browser fetch) fails. HEAD-only 404s are logged as
 * informational because Firebase Hosting / Fastly commonly return 404 to
 * HEAD probes while GET works fine.
 *
 * Also usable via GET /api/public/monitor-head-get on the live site — this
 * script is a thin wrapper that hits the two hosts directly so it works
 * even if the endpoint itself is down.
 */

const HOSTS = (process.env.MONITOR_HOSTS ||
  "https://phlabs.co.uk,https://prohealthpeptides.co.uk")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Tunable via env — defaults tightened from the previous 15s / no-retry setup.
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const HEAD_TIMEOUT_MS  = num(process.env.MONITOR_HEAD_TIMEOUT_MS, 5000);
const GET_TIMEOUT_MS   = num(process.env.MONITOR_GET_TIMEOUT_MS, 8000);
const ASSET_TIMEOUT_MS = num(process.env.MONITOR_ASSET_TIMEOUT_MS, 8000);
const RETRIES          = num(process.env.MONITOR_RETRIES, 2);           // extra attempts
const RETRY_BASE_MS    = num(process.env.MONITOR_RETRY_BASE_MS, 400);   // exp backoff base

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 phlabs-monitor/1.0";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function timedFetch(url, init = {}, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA, ...(init.headers || {}) },
    });
    return { res, ms: Date.now() - t0 };
  } catch (e) {
    return { error: e && e.message || String(e), ms: Date.now() - t0 };
  } finally {
    clearTimeout(t);
  }
}

// Retry on transient failures: network error, timeout/abort, 5xx, 408, 429.
// 2xx/3xx/4xx (except 408/429) return immediately — those are real signals.
async function fetchWithRetries(url, init, timeoutMs, retries = RETRIES) {
  let last;
  const attempts = Math.max(1, retries + 1);
  for (let i = 0; i < attempts; i++) {
    const r = await timedFetch(url, init, timeoutMs);
    last = r;
    const transient = !r.res
      || r.res.status >= 500
      || r.res.status === 408
      || r.res.status === 429;
    if (!transient) return { ...r, attempts: i + 1 };
    if (i < attempts - 1) await sleep(RETRY_BASE_MS * Math.pow(2, i));
  }
  return { ...last, attempts };
}

async function checkHost(host) {
  const alerts = [];
  const info = [];

  const [head, get] = await Promise.all([
    fetchWithRetries(host + "/", { method: "HEAD" }, HEAD_TIMEOUT_MS),
    fetchWithRetries(host + "/", { method: "GET", headers: { accept: "text/html" } }, GET_TIMEOUT_MS),
  ]);

  if (head.attempts > 1) info.push(`HEAD needed ${head.attempts} attempts`);
  if (get.attempts > 1)  info.push(`GET needed ${get.attempts} attempts`);

  const headStatus = head.res ? head.res.status : `ERR(${head.error})`;
  const getStatus = get.res ? get.res.status : `ERR(${get.error})`;

  const headStatus = head.res ? head.res.status : `ERR(${head.error})`;
  const getStatus = get.res ? get.res.status : `ERR(${get.error})`;

  if (!get.res) {
    alerts.push(`GET failed: ${get.error}`);
    return { host, headStatus, getStatus, alerts, info };
  }
  if (!get.res.ok) alerts.push(`GET returned ${get.res.status}`);

  const html = await get.res.text().catch(() => "");

  // Collect every <script src="/assets/*.js"> tag; note whether it's a
  // module entry (type="module") so we can require at least one entry.
  const scriptRe = /<script\b([^>]*?)\bsrc=["']([^"']*\/assets\/[^"']+\.js)["']([^>]*)>/gi;
  const scripts = [];
  let match;
  while ((match = scriptRe.exec(html)) !== null) {
    const attrs = (match[1] + " " + match[3]).toLowerCase();
    scripts.push({
      url: new URL(match[2], host + "/").toString(),
      isModule: /\btype\s*=\s*["']?module\b/.test(attrs),
    });
  }

  if (scripts.length === 0) {
    alerts.push("HTML missing /assets/*.js references");
  } else {
    if (!scripts.some((s) => s.isModule)) {
      alerts.push("HTML has no <script type=\"module\"> entry bundle");
    }

    // Validate every referenced asset in parallel (bounded by browser fetch).
    const checks = await Promise.all(scripts.map(async (s) => {
      const js = await fetchWithRetries(s.url, { method: "GET" }, ASSET_TIMEOUT_MS);
      if (!js.res) return { s, err: `fetch failed: ${js.error}` };
      if (!js.res.ok) return { s, err: `HTTP ${js.res.status}` };
      const body = await js.res.text().catch(() => "");
      const ct = (js.res.headers.get("content-type") || "").toLowerCase();
      if (body.length < 50) return { s, err: `too small (${body.length}b)` };
      if (ct && !/(javascript|ecmascript)/.test(ct)) return { s, err: `wrong ct: ${ct}` };
      if (/^\s*<!doctype|<html[\s>]/i.test(body.slice(0, 512))) return { s, err: "body is HTML" };
      return { s, ok: true };
    }));

    const failed = checks.filter((c) => !c.ok);
    const okCount = checks.length - failed.length;
    info.push(`asset bundles: ${okCount}/${checks.length} ok (${scripts.filter((s) => s.isModule).length} module entry)`);
    for (const f of failed) {
      const name = f.s.url.split("/assets/")[1] || f.s.url;
      alerts.push(`asset /assets/${name} — ${f.err}`);
    }
  }

  if (head.res && !head.res.ok && get.res.ok) {
    info.push(`HEAD ${head.res.status} while GET ${get.res.status} — HEAD-probe artefact, ignored`);
  }

  return { host, headStatus, getStatus, alerts, info };
}

const results = await Promise.all(HOSTS.map(checkHost));
let hadAlert = false;
for (const r of results) {
  console.log(`\n${r.host}`);
  console.log(`  HEAD=${r.headStatus}  GET=${r.getStatus}`);
  for (const i of r.info) console.log(`  ℹ️  ${i}`);
  for (const a of r.alerts) { console.log(`  ❌ ${a}`); hadAlert = true; }
  if (!r.alerts.length) console.log("  ✅ GET healthy");
}
if (hadAlert) {
  console.error("\nMONITOR ALERT — one or more GETs failed.");
  process.exit(1);
}
console.log("\nAll GETs healthy.");
