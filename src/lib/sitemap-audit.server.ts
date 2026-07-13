import { getRequest } from "@tanstack/react-start/server";

import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";
import { addDocAdmin, listDocsAdmin } from "@/lib/server/firestore-admin";
import { exclusionReason, isIndexable, ROBOTS_RULES } from "@/lib/sitemap-policy";
import { SITE_URL } from "@/lib/seo-meta";
import {
  checkAuditRateLimit,
  KNOWN_PUBLIC_ROUTES,
  MAX_AUDIT_RUNS_PER_HOUR,
  type SitemapAuditReport,
} from "@/lib/sitemap-audit.functions";

const HOUR_MS = 60 * 60 * 1000;

async function logUnauthorized(ctx: { reason: string; uid?: string; email?: string | null; idTokenPresent: boolean }) {
  let ip = "unknown";
  let ua = "unknown";
  try {
    const req = getRequest();
    ip = req?.headers.get("cf-connecting-ip") ?? req?.headers.get("x-forwarded-for") ?? "unknown";
    ua = req?.headers.get("user-agent")?.slice(0, 256) ?? "unknown";
  } catch { /* best-effort */ }
  console.warn("[sitemap-audit] UNAUTHORIZED", JSON.stringify({ ...ctx, ip, ua, ts: new Date().toISOString() }));
  try {
    await addDocAdmin("sitemap_audit_log", { kind: "unauthorized", ...ctx, ip, ua, timestamp: new Date() });
  } catch (err) {
    console.warn("[sitemap-audit] alert persistence failed", (err as Error).message);
  }
}

async function checkPersistentRateLimit(uid: string) {
  const now = Date.now();
  try {
    const rows = await listDocsAdmin("sitemap_audit_log", {
      where: { field: "uid", op: "EQUAL", value: uid },
      orderBy: "timestamp",
      direction: "DESCENDING",
      limit: MAX_AUDIT_RUNS_PER_HOUR * 3,
    });
    const recent = rows.filter((r: Record<string, unknown>) => {
      if (r.kind !== "run") return false;
      const ts = r.timestamp;
      const t = typeof ts === "string" ? Date.parse(ts) : 0;
      return t > 0 && now - t < HOUR_MS;
    });
    if (recent.length >= MAX_AUDIT_RUNS_PER_HOUR) {
      const oldest = Date.parse(recent[recent.length - 1].timestamp as string);
      return { allowed: false, remaining: 0, resetMs: HOUR_MS - (now - oldest) };
    }
    return { allowed: true, remaining: MAX_AUDIT_RUNS_PER_HOUR - recent.length, resetMs: HOUR_MS };
  } catch (err) {
    console.warn("[sitemap-audit] persistent rate-limit check failed, failing open", (err as Error).message);
    return { allowed: true, remaining: MAX_AUDIT_RUNS_PER_HOUR, resetMs: HOUR_MS };
  }
}

function parseSitemapXml(xml: string): string[] {
  const locs: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    try { locs.push(new URL(m[1]).pathname); } catch { /* skip */ }
  }
  return locs;
}

async function headStatus(url: string): Promise<number> {
  try { return (await fetch(url, { method: "HEAD", redirect: "manual" })).status; } catch { return 0; }
}

export async function runSitemapAuditServer(data: { idToken: string }): Promise<SitemapAuditReport> {
  let user: { uid: string; email: string | null };
  try {
    user = await requireFirebaseAdmin(data.idToken);
  } catch (err) {
    const msg = (err as Error).message;
    await logUnauthorized({ reason: msg === "not_admin" ? "not_admin" : `auth_failed:${msg}`, idTokenPresent: true });
    throw new Error(msg === "not_admin" ? "forbidden: account is not an admin" : "forbidden: invalid id token");
  }

  const rl = await checkPersistentRateLimit(user.uid);
  checkAuditRateLimit(user.uid);
  if (!rl.allowed) {
    await logUnauthorized({ reason: "rate_limited", uid: user.uid, email: user.email, idTokenPresent: true });
    throw new Error(`rate_limited: max ${MAX_AUDIT_RUNS_PER_HOUR} runs/hour. Try again in ~${Math.ceil(rl.resetMs / 60000)} min.`);
  }
  await addDocAdmin("sitemap_audit_log", { kind: "run", uid: user.uid, email: user.email, remaining: rl.remaining, timestamp: new Date() }).catch(() => undefined);

  const errors: string[] = [];
  const sitemapUrl = `${SITE_URL}/sitemap.xml`;
  let sitemapStatus = 0;
  let sitemapPaths: string[] = [];
  try {
    const r = await fetch(sitemapUrl, { headers: { accept: "application/xml" } });
    sitemapStatus = r.status;
    if (r.ok) sitemapPaths = parseSitemapXml(await r.text());
    else errors.push(`sitemap.xml returned HTTP ${r.status}`);
  } catch (e) {
    errors.push(`sitemap.xml fetch failed: ${(e as Error).message}`);
  }

  const sitemapSet = new Set(sitemapPaths);
  const expected = new Set<string>(KNOWN_PUBLIC_ROUTES);
  for (const p of sitemapPaths) if (p.startsWith("/products/") || p.startsWith("/resources/")) expected.add(p);

  const missing: SitemapAuditReport["missing"] = [];
  const expectedExclusions: SitemapAuditReport["expectedExclusions"] = [];
  for (const path of expected) {
    if (sitemapSet.has(path)) continue;
    const reason = exclusionReason(path);
    if (reason) expectedExclusions.push({ path, reason });
    else missing.push({ path });
  }

  const extraBlocked: SitemapAuditReport["extraBlocked"] = [];
  for (const path of sitemapPaths) if (!isIndexable(path)) extraBlocked.push({ path, reason: exclusionReason(path)! });

  const sample = sitemapPaths.slice(0, 25);
  const statuses = await Promise.all(sample.map((p) => headStatus(`${SITE_URL}${p}`)));
  const extra404 = sample.flatMap((path, i) => statuses[i] >= 400 ? [{ path, status: statuses[i] }] : []);

  return {
    ranAt: new Date().toISOString(), sitemapUrl, sitemapStatus,
    totalUrlsInSitemap: sitemapPaths.length, totalIndexableRoutes: expected.size,
    ok: sitemapStatus === 200 && missing.length === 0 && extraBlocked.length === 0 && extra404.length === 0,
    missing, extraBlocked, extra404, expectedExclusions,
    robotsRulesApplied: ROBOTS_RULES.length, errors,
  };
}