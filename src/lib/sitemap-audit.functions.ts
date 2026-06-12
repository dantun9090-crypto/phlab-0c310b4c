/**
 * Sitemap Audit — server function powering the Admin → SEO → Sitemap Audit tab.
 *
 * Cross-references three sources of truth:
 *   1. The live /sitemap.xml served by this app.
 *   2. The live /robots.txt User-agent:* Disallow rules.
 *   3. The known set of indexable app routes (from KNOWN_PUBLIC_ROUTES below)
 *      plus the dynamic product list.
 *
 * Categorises every divergence as one of:
 *   - "missing"             → route is indexable but absent from sitemap
 *   - "extra_blocked"       → URL in sitemap that policy says shouldn't be
 *   - "extra_404"           → URL in sitemap that returns >= 400
 *   - "expected_exclusion"  → false positive: a "missing" entry that is
 *                              intentionally excluded (transactional/feed/etc.)
 *
 * Auth: requires Supabase session (admin gate handled by /admin shell).
 */

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
// Server-only modules under src/lib/server/* are blocked from the client
// bundle by the TanStack import-protection plugin. Load them dynamically
// inside handler bodies below (never at module scope).
import {
  exclusionReason,
  isIndexable,
  ROBOTS_RULES,
  type ExclusionReason,
} from "@/lib/sitemap-policy";

// DOMAIN GUARD: SITE_URL ze seo-meta to jedyne źródło prawdy dla kanonicznego hosta.
// Patrz scripts/check-url-consistency.ts.
import { SITE_URL } from "@/lib/seo-meta";
const BASE_URL = SITE_URL;

/**
 * Per-admin rate limiter. The Firestore-backed variant is the source of
 * truth at runtime — Cloudflare Worker isolates do not share memory, so
 * counting prior `kind: "run"` rows in `sitemap_audit_log` gives a real
 * shared cap across isolates. The in-memory variant is retained for unit
 * tests and as a cheap pre-check.
 */
export const MAX_AUDIT_RUNS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;
const runWindow = new Map<string, number[]>();

export function checkAuditRateLimit(uid: string): {
  allowed: boolean;
  remaining: number;
  resetMs: number;
} {
  const now = Date.now();
  const arr = (runWindow.get(uid) ?? []).filter((t) => now - t < HOUR_MS);
  if (arr.length >= MAX_AUDIT_RUNS_PER_HOUR) {
    runWindow.set(uid, arr);
    return { allowed: false, remaining: 0, resetMs: HOUR_MS - (now - arr[0]) };
  }
  arr.push(now);
  runWindow.set(uid, arr);
  return {
    allowed: true,
    remaining: MAX_AUDIT_RUNS_PER_HOUR - arr.length,
    resetMs: HOUR_MS,
  };
}

/**
 * Firestore-backed rate limit: counts `kind: "run"` rows for this uid in
 * the last hour. Shared across all Worker isolates. If Firestore is
 * unreachable, we fail OPEN (return allowed=true) so a transient outage
 * does not lock admins out — the in-memory pre-check still applies and
 * any abuse remains visible in the audit log.
 */
export async function checkAuditRateLimitPersistent(uid: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetMs: number;
}> {
  const now = Date.now();
  try {
    const { listDocsAdmin } = await import("@/lib/server/firestore-admin");
    const rows = await listDocsAdmin("sitemap_audit_log", {
      where: { field: "uid", op: "EQUAL", value: uid },
      orderBy: "timestamp",
      direction: "DESCENDING",
      limit: MAX_AUDIT_RUNS_PER_HOUR * 3,
    });
    const recentRuns = rows.filter((r: Record<string, unknown>) => {
      if (r.kind !== "run") return false;
      const ts = r.timestamp;
      const t = typeof ts === "string" ? Date.parse(ts) : 0;
      return t > 0 && now - t < HOUR_MS;
    });
    if (recentRuns.length >= MAX_AUDIT_RUNS_PER_HOUR) {
      const oldest = recentRuns[recentRuns.length - 1].timestamp as string;
      const oldestT = Date.parse(oldest);
      return {
        allowed: false,
        remaining: 0,
        resetMs: HOUR_MS - (now - oldestT),
      };
    }
    return {
      allowed: true,
      remaining: MAX_AUDIT_RUNS_PER_HOUR - recentRuns.length,
      resetMs: HOUR_MS,
    };
  } catch (err) {
    console.warn(
      "[sitemap-audit] persistent rate-limit check failed, failing open",
      (err as Error).message,
    );
    return { allowed: true, remaining: MAX_AUDIT_RUNS_PER_HOUR, resetMs: HOUR_MS };
  }
}

interface UnauthorizedContext {
  reason: string;
  uid?: string;
  email?: string | null;
  idTokenPresent: boolean;
}

async function logUnauthorized(ctx: UnauthorizedContext): Promise<void> {
  let ip = "unknown";
  let ua = "unknown";
  try {
    const req = getRequest();
    ip =
      req?.headers.get("cf-connecting-ip") ??
      req?.headers.get("x-forwarded-for") ??
      "unknown";
    ua = req?.headers.get("user-agent")?.slice(0, 256) ?? "unknown";
  } catch {
    /* best-effort */
  }
  console.warn(
    "[sitemap-audit] UNAUTHORIZED",
    JSON.stringify({ ...ctx, ip, ua, ts: new Date().toISOString() }),
  );
  try {
    const { addDocAdmin } = await import("@/lib/server/firestore-admin");
    await addDocAdmin("sitemap_audit_log", {
      kind: "unauthorized",
      reason: ctx.reason,
      uid: ctx.uid ?? null,
      email: ctx.email ?? null,
      idTokenPresent: ctx.idTokenPresent,
      ip,
      ua,
      timestamp: new Date(),
    });
  } catch (err) {
    console.warn("[sitemap-audit] alert persistence failed", (err as Error).message);
  }
}

async function logAuthorizedRun(
  uid: string,
  email: string | null,
  remaining: number,
): Promise<void> {
  try {
    const { addDocAdmin } = await import("@/lib/server/firestore-admin");
    await addDocAdmin("sitemap_audit_log", {
      kind: "run",
      uid,
      email,
      remaining,
      timestamp: new Date(),
    });
  } catch {
    /* non-blocking */
  }
}



/**
 * Hand-curated list of every page route that SHOULD be in the sitemap.
 * Dynamic product/article entries are added at runtime by the audit.
 *
 * Update this when adding a new top-level indexable page.
 */
export const KNOWN_PUBLIC_ROUTES: readonly string[] = [
  "/",
  "/products",
  "/research",
  "/quality-control",
  "/lab-reports",
  "/resources",
  "/storage-guide",
  "/about",
  "/contact",
  "/shipping-policy",
  "/refund-policy",
  "/terms-and-conditions",
  "/privacy-policy",
  "/cookies",
];

export interface SitemapAuditReport {
  ranAt: string;
  sitemapUrl: string;
  sitemapStatus: number;
  totalUrlsInSitemap: number;
  totalIndexableRoutes: number;
  ok: boolean;
  missing: Array<{ path: string; note?: string }>;
  extraBlocked: Array<{ path: string; reason: ExclusionReason }>;
  extra404: Array<{ path: string; status: number }>;
  expectedExclusions: Array<{ path: string; reason: ExclusionReason }>;
  robotsRulesApplied: number;
  errors: string[];
}

function parseSitemapXml(xml: string): string[] {
  const locs: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    try {
      const u = new URL(m[1]);
      locs.push(u.pathname);
    } catch {
      /* skip malformed */
    }
  }
  return locs;
}

async function headStatus(url: string): Promise<number> {
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "manual" });
    return r.status;
  } catch {
    return 0;
  }
}

export const runSitemapAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { idToken: string }) => {
    if (!data?.idToken || typeof data.idToken !== "string") {
      // Log + alert before throwing so unauthorized attempts are recorded.
      void logUnauthorized({
        reason: "missing_or_invalid_id_token",
        idTokenPresent: !!data?.idToken,
      });
      throw new Error("forbidden: admin id token required");
    }
    return data;
  })
  .handler(async ({ data }): Promise<SitemapAuditReport> => {
    // Admin-only: verify Firebase ID token + isAdmin flag on customers doc.
    let user: { uid: string; email: string | null };
    try {
      user = await requireFirebaseAdmin(data.idToken);
    } catch (err) {
      const msg = (err as Error).message;
      await logUnauthorized({
        reason: msg === "not_admin" ? "not_admin" : `auth_failed:${msg}`,
        idTokenPresent: true,
      });
      throw new Error(
        msg === "not_admin"
          ? "forbidden: account is not an admin"
          : "forbidden: invalid id token",
      );
    }

    // Per-admin rate limit — 10 runs / hour, counted in Firestore so
    // Cloudflare Worker isolates share the same window.
    const rl = await checkAuditRateLimitPersistent(user.uid);
    // Keep the cheap in-memory pre-check current too.
    checkAuditRateLimit(user.uid);
    if (!rl.allowed) {
      await logUnauthorized({
        reason: "rate_limited",
        uid: user.uid,
        email: user.email,
        idTokenPresent: true,
      });
      const mins = Math.ceil(rl.resetMs / 60_000);
      throw new Error(
        `rate_limited: max ${MAX_AUDIT_RUNS_PER_HOUR} runs/hour. Try again in ~${mins} min.`,
      );
    }
    // Await so the row exists before the handler can be re-entered.
    await logAuthorizedRun(user.uid, user.email, rl.remaining);


    const errors: string[] = [];
    const sitemapUrl = `${BASE_URL}/sitemap.xml`;

    // 1. Fetch live sitemap
    let sitemapStatus = 0;
    let sitemapPaths: string[] = [];
    try {
      const r = await fetch(sitemapUrl, {
        headers: { accept: "application/xml" },
      });
      sitemapStatus = r.status;
      if (r.ok) {
        sitemapPaths = parseSitemapXml(await r.text());
      } else {
        errors.push(`sitemap.xml returned HTTP ${r.status}`);
      }
    } catch (e) {
      errors.push(`sitemap.xml fetch failed: ${(e as Error).message}`);
    }

    // 2. Build full set of expected indexable routes (static + dynamic).
    // Dynamic product slugs are read out of the sitemap itself — we trust
    // the generator (which already enforces policy) for them, and instead
    // focus the audit on policy violations + 404s.
    const sitemapSet = new Set(sitemapPaths);
    const expected = new Set<string>(KNOWN_PUBLIC_ROUTES);
    for (const p of sitemapPaths) {
      if (p.startsWith("/products/") || p.startsWith("/resources/")) {
        expected.add(p);
      }
    }

    // 3. Missing — in expected but not in sitemap.
    const missing: SitemapAuditReport["missing"] = [];
    const expectedExclusions: SitemapAuditReport["expectedExclusions"] = [];
    for (const path of expected) {
      if (sitemapSet.has(path)) continue;
      const reason = exclusionReason(path);
      if (reason) {
        expectedExclusions.push({ path, reason });
      } else {
        missing.push({ path });
      }
    }

    // 4. Extra-blocked — in sitemap but policy says exclude.
    const extraBlocked: SitemapAuditReport["extraBlocked"] = [];
    for (const path of sitemapPaths) {
      if (!isIndexable(path)) {
        extraBlocked.push({ path, reason: exclusionReason(path)! });
      }
    }

    // 5. Extra-404 — sample up to 25 sitemap URLs and HEAD them.
    const sample = sitemapPaths.slice(0, 25);
    const extra404: SitemapAuditReport["extra404"] = [];
    const statuses = await Promise.all(
      sample.map((p) => headStatus(`${BASE_URL}${p}`)),
    );
    sample.forEach((p, i) => {
      const s = statuses[i];
      if (s >= 400) extra404.push({ path: p, status: s });
    });

    return {
      ranAt: new Date().toISOString(),
      sitemapUrl,
      sitemapStatus,
      totalUrlsInSitemap: sitemapPaths.length,
      totalIndexableRoutes: expected.size,
      ok:
        sitemapStatus === 200 &&
        missing.length === 0 &&
        extraBlocked.length === 0 &&
        extra404.length === 0,
      missing,
      extraBlocked,
      extra404,
      expectedExclusions,
      robotsRulesApplied: ROBOTS_RULES.length,
      errors,
    };
  });
