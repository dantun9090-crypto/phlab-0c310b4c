/**
 * Server-only Firestore-backed rate-limit check for sitemap audit runs.
 * Extracted from sitemap-audit.functions.ts so that the dynamic import of
 * @/lib/server/firestore-admin does not appear in the client-visible
 * .functions.ts module graph (TanStack import-protection blocks
 * **\/server/** imports from any file reachable by the client bundle,
 * even inside dynamic import() calls).
 */

import { listDocsAdmin } from "@/lib/server/firestore-admin";

export const MAX_AUDIT_RUNS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

export async function checkAuditRateLimitPersistent(uid: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetMs: number;
}> {
  const now = Date.now();
  try {
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
