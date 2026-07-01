#!/usr/bin/env bun
/**
 * Optional preflight: HEAD-check every URL in the generated sitemap feeds
 * against a live host and report non-200/3xx responses.
 *
 * Usage:
 *   bun run check:sitemap-urls-live                 # warn-only (exit 0)
 *   STRICT=1 bun run check:sitemap-urls-live        # fail on any bad URL (exit 1)
 *   BASE=https://phlabs.co.uk bun run check:sitemap-urls-live
 *   CONCURRENCY=16 TIMEOUT_MS=8000 bun run check:sitemap-urls-live
 *
 * Some CDNs/origins return 405 for HEAD; those URLs are retried once with GET
 * before being flagged. Redirects (3xx) are treated as OK by default because
 * they resolve to a real page; set STRICT_REDIRECTS=1 to flag them too.
 */
import { XMLParser } from "fast-xml-parser";
import { Route as sitemapRoute } from "../src/routes/sitemap[.]xml";
import { Route as bingFeedRoute } from "../src/routes/bing-feed[.]xml";

type Feed = { label: string; handler: () => Promise<Response> };

const FEEDS: Feed[] = [
  { label: "/sitemap.xml", handler: sitemapRoute.options.server.handlers.GET },
  { label: "/bing-feed.xml", handler: bingFeedRoute.options.server.handlers.GET },
];

const STRICT = process.env.STRICT === "1";
const STRICT_REDIRECTS = process.env.STRICT_REDIRECTS === "1";
const BASE = (process.env.BASE ?? "https://phlabs.co.uk").replace(/\/$/, "");
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY ?? 8));
const TIMEOUT_MS = Math.max(1000, Number(process.env.TIMEOUT_MS ?? 10_000));

async function extractLocs(feed: Feed): Promise<string[]> {
  const res = await feed.handler();
  const xml = await res.text();
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
  const urls = parsed?.urlset?.url;
  const arr = Array.isArray(urls) ? urls : urls ? [urls] : [];
  return arr.map((u: any) => String(u.loc ?? "").trim()).filter(Boolean);
}

type Probe = {
  url: string;
  status: number | "ERROR";
  method: "HEAD" | "GET";
  ok: boolean;
  detail?: string;
};

async function probe(url: string): Promise<Probe> {
  // Rewrite absolute URL onto BASE so we always hit the target host.
  let target: string;
  try {
    const u = new URL(url);
    target = `${BASE}${u.pathname}${u.search}`;
  } catch {
    return { url, status: "ERROR", method: "HEAD", ok: false, detail: "invalid URL" };
  }

  const tryOnce = async (method: "HEAD" | "GET"): Promise<Probe> => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(target, {
        method,
        redirect: STRICT_REDIRECTS ? "manual" : "follow",
        signal: ac.signal,
        headers: { "user-agent": "phlabs-sitemap-preflight/1.0" },
      });
      const ok = STRICT_REDIRECTS
        ? r.status >= 200 && r.status < 300
        : r.status >= 200 && r.status < 400;
      return { url, status: r.status, method, ok };
    } catch (e) {
      return {
        url,
        status: "ERROR",
        method,
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      };
    } finally {
      clearTimeout(t);
    }
  };

  const head = await tryOnce("HEAD");
  // Some origins reject HEAD (405/501) — retry with GET before flagging.
  if (!head.ok && (head.status === 405 || head.status === 501)) {
    return tryOnce("GET");
  }
  return head;
}

async function runPool(urls: string[]): Promise<Probe[]> {
  const results: Probe[] = new Array(urls.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, urls.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= urls.length) return;
      results[idx] = await probe(urls[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log(`🌐 HEAD-checking sitemap URLs against ${BASE}`);
  console.log(`   concurrency=${CONCURRENCY} timeout=${TIMEOUT_MS}ms strict=${STRICT} strictRedirects=${STRICT_REDIRECTS}`);

  let totalBad = 0;
  for (const feed of FEEDS) {
    const locs = await extractLocs(feed);
    console.log(`\n▶ ${feed.label} — probing ${locs.length} URLs…`);
    const results = await runPool(locs);
    const bad = results.filter((r) => !r.ok);
    const okCount = results.length - bad.length;
    console.log(`  ${bad.length === 0 ? "✓" : "✗"} ok:${okCount} bad:${bad.length}`);
    if (bad.length > 0) {
      totalBad += bad.length;
      // Group by status for a clean summary.
      const groups = new Map<string, Probe[]>();
      for (const b of bad) {
        const k = String(b.status);
        const list = groups.get(k) ?? [];
        list.push(b);
        groups.set(k, list);
      }
      for (const [status, items] of [...groups.entries()].sort()) {
        console.log(`  ── status ${status} (${items.length}):`);
        for (const it of items) {
          const detail = it.detail ? ` — ${it.detail}` : "";
          console.log(`     [${it.method}] ${it.url}${detail}`);
        }
      }
    }
  }

  if (totalBad === 0) {
    console.log("\n✅ All sitemap URLs responded 2xx/3xx.");
    return;
  }
  const msg = `\n${STRICT ? "❌" : "⚠️ "} ${totalBad} URL(s) returned non-200/3xx.`;
  if (STRICT) {
    console.error(msg);
    process.exit(1);
  } else {
    console.warn(`${msg} (warn-only; set STRICT=1 to fail the build)`);
  }
}

main().catch((e) => {
  console.error("check-sitemap-urls-live crashed:", e);
  process.exit(1);
});
