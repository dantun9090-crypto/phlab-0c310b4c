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

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 phlabs-monitor/1.0";

async function timedFetch(url, init = {}, ms = 15000) {
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

async function checkHost(host) {
  const alerts = [];
  const info = [];

  const [head, get] = await Promise.all([
    timedFetch(host + "/", { method: "HEAD" }),
    timedFetch(host + "/", { method: "GET", headers: { accept: "text/html" } }),
  ]);

  const headStatus = head.res ? head.res.status : `ERR(${head.error})`;
  const getStatus = get.res ? get.res.status : `ERR(${get.error})`;

  if (!get.res) {
    alerts.push(`GET failed: ${get.error}`);
    return { host, headStatus, getStatus, alerts, info };
  }
  if (!get.res.ok) alerts.push(`GET returned ${get.res.status}`);

  const html = await get.res.text().catch(() => "");
  const m = html.match(/<script[^>]+src=["']([^"']*\/assets\/[^"']+\.js)["']/i);
  if (!m) {
    alerts.push("HTML missing /assets/*.js reference");
  } else {
    const entryUrl = new URL(m[1], host + "/").toString();
    const js = await timedFetch(entryUrl);
    if (!js.res) alerts.push(`entry JS fetch failed: ${js.error}`);
    else if (!js.res.ok) alerts.push(`entry JS returned ${js.res.status}`);
    else {
      const body = await js.res.text().catch(() => "");
      const ct = (js.res.headers.get("content-type") || "").toLowerCase();
      if (body.length < 200) alerts.push(`entry JS too small (${body.length}b)`);
      else if (ct && !/(javascript|ecmascript)/.test(ct)) alerts.push(`entry JS wrong ct: ${ct}`);
      else if (/^\s*<!doctype|<html[\s>]/i.test(body.slice(0, 512))) alerts.push("entry JS body is HTML");
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
