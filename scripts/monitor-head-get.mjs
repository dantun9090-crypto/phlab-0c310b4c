#!/usr/bin/env node
/**
 * HEAD vs GET monitor — runs standalone (CI / cron / laptop) against the
 * two live hosts. Prints a compact report, persists every run into the
 * Supabase `monitor_head_get_log` table (status codes, missing bundle
 * patterns, first 2 KB of HTML) so recurring issues can be debugged from
 * the admin panel, and exits non-zero ONLY when a GET (real browser
 * fetch) fails.
 *
 * HEAD-only 404s are logged informational — Firebase Hosting / Fastly
 * commonly return 404 to HEAD probes while GET works fine.
 */

const HOSTS = (process.env.MONITOR_HOSTS ||
  "https://phlabs.co.uk,https://prohealthpeptides.co.uk")
  .split(",").map((s) => s.trim()).filter(Boolean);

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const HEAD_TIMEOUT_MS  = num(process.env.MONITOR_HEAD_TIMEOUT_MS, 5000);
const GET_TIMEOUT_MS   = num(process.env.MONITOR_GET_TIMEOUT_MS, 8000);
const ASSET_TIMEOUT_MS = num(process.env.MONITOR_ASSET_TIMEOUT_MS, 8000);
const RETRIES          = num(process.env.MONITOR_RETRIES, 2);
const RETRY_BASE_MS    = num(process.env.MONITOR_RETRY_BASE_MS, 400);

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

  const headStatus = head.res ? String(head.res.status) : `ERR(${head.error})`;
  const getStatus = get.res ? String(get.res.status) : `ERR(${get.error})`;

  const row = {
    host,
    head_status: headStatus,
    get_status: getStatus,
    head_attempts: head.attempts || 1,
    get_attempts: get.attempts || 1,
    assets_total: null,
    assets_ok: null,
    has_module_entry: null,
    alerts: [],
    info: [],
    missing_bundles: [],
    html_snippet: null,
  };

  if (!get.res) {
    alerts.push(`GET failed: ${get.error}`);
    row.alerts = alerts; row.info = info;
    return { host, headStatus, getStatus, alerts, info, row };
  }
  if (!get.res.ok) alerts.push(`GET returned ${get.res.status}`);

  const html = await get.res.text().catch(() => "");
  row.html_snippet = html.slice(0, 2000);

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

  row.assets_total = scripts.length;
  row.has_module_entry = scripts.some((s) => s.isModule);

  if (scripts.length === 0) {
    alerts.push("HTML missing /assets/*.js references");
    row.missing_bundles.push({ reason: "no-script-tags" });
  } else {
    if (!row.has_module_entry) {
      alerts.push("HTML has no <script type=\"module\"> entry bundle");
      row.missing_bundles.push({ reason: "no-module-entry" });
    }

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
    row.assets_ok = checks.length - failed.length;
    info.push(`asset bundles: ${row.assets_ok}/${checks.length} ok (${scripts.filter((s) => s.isModule).length} module entry)`);
    for (const f of failed) {
      const name = f.s.url.split("/assets/")[1] || f.s.url;
      alerts.push(`asset /assets/${name} — ${f.err}`);
      row.missing_bundles.push({ url: f.s.url, module: f.s.isModule, error: f.err });
    }
  }

  if (head.res && !head.res.ok && get.res.ok) {
    info.push(`HEAD ${head.res.status} while GET ${get.res.status} — HEAD-probe artefact, ignored`);
  }

  row.alerts = alerts;
  row.info = info;
  return { host, headStatus, getStatus, alerts, info, row };
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

// Persist every run to Supabase (best-effort — never fail the job on log write).
const SUPA_URL = process.env.SUPABASE_URL || "https://vvqotfbqmwmukwcmuycg.supabase.co";
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2cW90ZmJxbXdtdWt3Y211eWNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzM4ODYsImV4cCI6MjA5NTMwOTg4Nn0.kGGXrg1MKg1BiNjRslFdpAJwg55Q12Z_5qlayraJguU";
const SOURCE = process.env.MONITOR_SOURCE || "ci";
const RUN_URL = process.env.MONITOR_RUN_URL || process.env.ALERT_RUN_URL || null;
const DISABLE_LOG = process.env.MONITOR_DISABLE_LOG === "1";

if (!DISABLE_LOG) {
  const rows = results.map((r) => ({
    ...r.row,
    had_alert: r.alerts.length > 0,
    source: SOURCE.slice(0, 40),
    run_url: RUN_URL ? String(RUN_URL).slice(0, 500) : null,
  }));
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/monitor_head_get_log`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: SUPA_KEY,
        authorization: `Bearer ${SUPA_KEY}`,
        prefer: "return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) console.warn(`log write: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
    else console.log(`\nlog write: persisted ${rows.length} row(s) to monitor_head_get_log`);
  } catch (e) {
    console.warn(`log write failed: ${e && e.message || e}`);
  }
}

if (hadAlert) {
  console.error("\nMONITOR ALERT — one or more GETs failed.");
  process.exit(1);
}
console.log("\nAll GETs healthy.");
