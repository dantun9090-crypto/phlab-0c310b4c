#!/usr/bin/env node
/**
 * Automated internal link checker.
 *
 * Crawls the site starting at BASE (default http://localhost:8080), follows
 * every same-origin <a href> it finds, and exits non-zero if any internal
 * URL returns a 404 (or other 4xx/5xx). Used in CI to fail the build when
 * a broken internal link is introduced.
 *
 * Usage:
 *   BASE=http://localhost:8080 node scripts/check-internal-links.mjs
 *   BASE=https://phlabs.co.uk  node scripts/check-internal-links.mjs
 *
 * Env:
 *   BASE          Origin to crawl (default http://localhost:8080)
 *   MAX_PAGES     Safety cap on pages fetched (default 500)
 *   CONCURRENCY   Parallel fetches (default 8)
 *   IGNORE        Comma-separated path prefixes to skip (default admin/api/auth)
 */

const BASE = (process.env.BASE || "http://localhost:8080").replace(/\/$/, "");
const MAX_PAGES = Number(process.env.MAX_PAGES || 500);
const CONCURRENCY = Number(process.env.CONCURRENCY || 8);
const IGNORE = (process.env.IGNORE || "/admin,/api,/auth,/checkout,/cart,/account,/login,/register,/webhook,/server-functions")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const origin = new URL(BASE).origin;

/** @type {Map<string, { status: number, from: Set<string> }>} */
const results = new Map();
const queue = ["/"];
const seen = new Set(["/"]);

function shouldSkip(pathname) {
  return IGNORE.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function normalize(href, fromPath) {
  try {
    const u = new URL(href, origin + fromPath);
    if (u.origin !== origin) return null;
    // strip hash + trailing slash (except root)
    u.hash = "";
    let p = u.pathname;
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return p + (u.search || "");
  } catch {
    return null;
  }
}

const HREF_RE = /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi;

function extractHrefs(html) {
  const out = [];
  let m;
  while ((m = HREF_RE.exec(html)) !== null) {
    const href = m[2] ?? m[3];
    if (href && !href.startsWith("mailto:") && !href.startsWith("tel:") && !href.startsWith("javascript:")) {
      out.push(href);
    }
  }
  return out;
}

async function fetchPath(path, from) {
  const url = origin + path;
  try {
    const res = await fetch(url, { redirect: "manual", headers: { "user-agent": "phlabs-link-checker/1.0" } });
    // Follow one redirect layer for counting purposes but record final status
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (loc) {
        const next = normalize(loc, path);
        if (next && !seen.has(next) && !shouldSkip(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
      results.set(path, { status: res.status, from: new Set([from]) });
      return { status: res.status, html: "" };
    }
    const ct = res.headers.get("content-type") || "";
    const html = ct.includes("text/html") ? await res.text() : "";
    results.set(path, { status: res.status, from: new Set([from]) });
    return { status: res.status, html };
  } catch (err) {
    results.set(path, { status: 0, from: new Set([from]) });
    console.error(`  ✗ network error ${path}: ${err.message}`);
    return { status: 0, html: "" };
  }
}

async function worker() {
  while (queue.length) {
    const path = queue.shift();
    if (!path) return;
    const from = results.get(path)?.from?.values().next().value || "(seed)";
    const { status, html } = await fetchPath(path, from);
    const flag = status === 200 ? "✓" : status >= 400 ? "✗" : "→";
    console.log(`  ${flag} ${status} ${path}`);
    if (status !== 200 || !html) continue;
    if (seen.size >= MAX_PAGES) continue;
    for (const href of extractHrefs(html)) {
      const next = normalize(href, path);
      if (!next) continue;
      if (seen.has(next)) continue;
      if (shouldSkip(next)) continue;
      seen.add(next);
      // record provenance so we can report where the broken link came from
      results.set(next, { status: -1, from: new Set([path]) });
      queue.push(next);
      if (seen.size >= MAX_PAGES) break;
    }
  }
}

console.log(`Link check crawling ${origin} (max ${MAX_PAGES} pages, concurrency ${CONCURRENCY})`);
console.log(`Ignoring prefixes: ${IGNORE.join(", ")}`);

const started = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

const broken = [...results.entries()].filter(([, v]) => v.status >= 400 || v.status === 0);
const ok = [...results.entries()].filter(([, v]) => v.status === 200).length;

console.log("");
console.log(`Checked ${results.size} URLs in ${elapsed}s — ${ok} OK, ${broken.length} broken.`);

if (broken.length) {
  console.log("");
  console.log("Broken internal links:");
  for (const [path, v] of broken) {
    const from = [...v.from].join(", ");
    console.log(`  ${v.status || "ERR"}  ${path}   (linked from: ${from})`);
  }
  process.exit(1);
}
