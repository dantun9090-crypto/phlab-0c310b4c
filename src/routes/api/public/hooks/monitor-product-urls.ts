import { createFileRoute } from "@tanstack/react-router";
import { fetchAllProducts } from "@/lib/firestore-rest";
import { addDocAdmin } from "@/lib/server/firestore-admin";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Periodic monitor that scans public product URLs and detects regressions:
 *  - /products/{slug}  must return 200 and render the matching product
 *  - /products/{id}    (Firestore document ID, used by Google Merchant feed)
 *                       must return 200 and render the SAME product in place,
 *                       NOT redirect to /products or anywhere else.
 *
 * For each URL we record final HTTP status, redirect chain, and the
 * <link rel="canonical"> value. Anything that ends up on /products (the
 * listing page), on /, on a 3xx loop, or on a non-matching canonical is
 * flagged as an issue.
 *
 * The full scan result is stored in Firestore (`url_monitor_scans`) so the
 * Admin → URL Monitor tab can show history. The HTTP response is a small
 * JSON summary suitable for uptime monitors / Cloudflare cron triggers.
 *
 * Endpoint: GET or POST /api/public/hooks/monitor-product-urls
 * Auth:     none (public, rate-limited). Safe — read-only against the
 *           public site; only writes a single audit doc per scan.
 */

const ORIGIN = "https://phlabs.co.uk";
const FETCH_TIMEOUT_MS = 12_000;
const FETCH_CONCURRENCY = 6;
const USER_AGENT = "PHLabs-UrlMonitor/1.0 (+https://phlabs.co.uk)";
const SCAN_COLLECTION = "url_monitor_scans";

interface UrlCheck {
  url: string;
  kind: "slug" | "id";
  productId: string;
  expectedSlug: string;
  finalUrl: string;
  finalStatus: number;
  redirectChain: string[];
  canonical: string | null;
  ok: boolean;
  issues: string[];
}

interface ScanResult {
  scannedAt: string;
  origin: string;
  totalProducts: number;
  totalChecks: number;
  failedChecks: number;
  durationMs: number;
  checks: UrlCheck[];
}

function pathOf(u: string): string {
  try {
    return new URL(u, ORIGIN).pathname;
  } catch {
    return u;
  }
}

function extractCanonical(html: string): string | null {
  const m = html.match(
    /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i,
  ) || html.match(
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i,
  );
  return m ? m[1] : null;
}

async function fetchWithRedirects(url: string): Promise<{
  finalUrl: string;
  finalStatus: number;
  redirectChain: string[];
  body: string;
}> {
  const chain: string[] = [];
  let current = url;
  let response: Response | null = null;
  for (let i = 0; i < 5; i++) {
    response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get("location");
      if (!loc) break;
      const next = new URL(loc, current).toString();
      chain.push(next);
      current = next;
      continue;
    }
    break;
  }
  if (!response) {
    return { finalUrl: current, finalStatus: 0, redirectChain: chain, body: "" };
  }
  const body = await response.text().catch(() => "");
  return {
    finalUrl: current,
    finalStatus: response.status,
    redirectChain: chain,
    body,
  };
}

async function runOneCheck(
  kind: "slug" | "id",
  productId: string,
  expectedSlug: string,
  pathSegment: string,
): Promise<UrlCheck> {
  const url = `${ORIGIN}/products/${pathSegment}`;
  const expectedCanonicalPath = `/products/${expectedSlug}`;
  const issues: string[] = [];
  try {
    const { finalUrl, finalStatus, redirectChain, body } =
      await fetchWithRedirects(url);
    const finalPath = pathOf(finalUrl);
    const canonical = extractCanonical(body);
    const canonicalPath = canonical ? pathOf(canonical) : null;

    if (finalStatus !== 200) {
      issues.push(`unexpected_status_${finalStatus}`);
    }
    // Slug URL must not redirect off the slug page; ID URL must NOT redirect
    // at all (renders in place — see products_.$slug.tsx).
    if (kind === "id" && redirectChain.length > 0) {
      issues.push(`id_url_redirected_to_${finalPath}`);
    }
    // The most important regression: anything landing on /products listing
    // or the home page instead of a product detail.
    if (
      finalPath === "/products" ||
      finalPath === "/" ||
      finalPath === "/not-found"
    ) {
      issues.push(`landed_on_${finalPath}`);
    }
    // Canonical must point to the slug version, regardless of which URL we
    // hit (Google Merchant feed uses /products/{id} but canonical is slug).
    if (!canonicalPath) {
      issues.push("missing_canonical");
    } else if (canonicalPath !== expectedCanonicalPath) {
      issues.push(`canonical_mismatch:${canonicalPath}`);
    }

    return {
      url,
      kind,
      productId,
      expectedSlug,
      finalUrl,
      finalStatus,
      redirectChain,
      canonical,
      ok: issues.length === 0,
      issues,
    };
  } catch (e) {
    return {
      url,
      kind,
      productId,
      expectedSlug,
      finalUrl: url,
      finalStatus: 0,
      redirectChain: [],
      canonical: null,
      ok: false,
      issues: [`fetch_error:${e instanceof Error ? e.message : String(e)}`],
    };
  }
}

async function runScan(): Promise<ScanResult> {
  const startedAt = Date.now();
  const products = await fetchAllProducts();

  // Build the list of checks: both slug and id URL for every product.
  const tasks: Array<() => Promise<UrlCheck>> = [];
  for (const p of products) {
    if (p.slug) {
      tasks.push(() => runOneCheck("slug", p.id, p.slug, p.slug));
    }
    if (p.id) {
      tasks.push(() => runOneCheck("id", p.id, p.slug, p.id));
    }
  }

  // Simple bounded-concurrency runner.
  const checks: UrlCheck[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(FETCH_CONCURRENCY, tasks.length) }, async () => {
      while (cursor < tasks.length) {
        const i = cursor++;
        checks.push(await tasks[i]());
      }
    }),
  );

  // Stable order: slug-then-id per productId for readability.
  checks.sort((a, b) =>
    a.productId === b.productId
      ? a.kind.localeCompare(b.kind)
      : a.productId.localeCompare(b.productId),
  );

  const failed = checks.filter((c) => !c.ok).length;
  return {
    scannedAt: new Date().toISOString(),
    origin: ORIGIN,
    totalProducts: products.length,
    totalChecks: checks.length,
    failedChecks: failed,
    durationMs: Date.now() - startedAt,
    checks,
  };
}

async function handler(request: Request): Promise<Response> {
  const limited = await enforceRateLimit(request, "monitor-product-urls", {
    limit: 6,
    windowMs: 60_000,
    retryAfterSec: 60,
  });
  if (limited) return limited;

  try {
    const result = await runScan();
    // Best-effort persist; never fail the response if Firestore is down.
    try {
      await addDocAdmin(SCAN_COLLECTION, {
        scannedAt: new Date(),
        origin: result.origin,
        totalProducts: result.totalProducts,
        totalChecks: result.totalChecks,
        failedChecks: result.failedChecks,
        durationMs: result.durationMs,
        // Store only failing checks in detail to keep doc size bounded; if
        // everything passes, store an empty array.
        failingChecks: result.checks.filter((c) => !c.ok),
      });
    } catch (e) {
      console.error("[monitor-product-urls] persist failed", e);
    }
    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: "scan_failed",
        message: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}

export const Route = createFileRoute("/api/public/hooks/monitor-product-urls")({
  server: {
    handlers: {
      GET: async ({ request }) => handler(request),
      POST: async ({ request }) => handler(request),
    },
  },
});
