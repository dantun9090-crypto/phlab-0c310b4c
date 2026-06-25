/**
 * Admin → Research Incidents.
 *
 * Reads the `error_events` Firestore collection for overlay/regression
 * incidents recorded by the in-page guards on /research and /compound
 * (see PremiumLandingGuard + Research page guard).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAdmin } from "./server/firebase-auth-admin";
import { listDocsAdmin } from "./server/firestore-admin";

export interface IncidentRow {
  id: string;
  type: string;
  path: string;
  createdAt: string;
  referrer?: string;
  userAgent?: string;
  message?: string;
  details?: Record<string, unknown>;
  ip?: string;
}

export interface IncidentsSummary {
  totalLast24h: number;
  totalLast7d: number;
  researchOverlay: number;
  compoundOverlay: number;
  pageNotFoundResearch: number;
  uniqueUserAgents: number;
  lastIncidentAt: string | null;
}

const Input = z.object({
  idToken: z.string().min(10),
  limit: z.number().int().min(1).max(500).optional(),
});

function toIsoString(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v && "seconds" in (v as Record<string, unknown>)) {
    const s = Number((v as { seconds: number }).seconds || 0);
    return new Date(s * 1000).toISOString();
  }
  try {
    return new Date(v as string).toISOString();
  } catch {
    return "";
  }
}

export const listResearchIncidents = createServerFn({ method: "POST" })
  .inputValidator((data) => Input.parse(data))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const limit = data.limit ?? 100;

    // Pull recent error_events; filter for research/compound incidents in JS
    // (one or two type values, simpler than chained where()s here).
    const rows = await listDocsAdmin("error_events", {
      orderBy: "createdAt",
      direction: "DESCENDING",
      limit,
    });

    const incidents: IncidentRow[] = [];
    for (const r of rows) {
      const id = String(r.id);
      const type = String(r.type ?? "");
      const path = String(r.path ?? "");
      const isResearchPath = path === "/research" || path.startsWith("/research?");
      const isCompoundPath = path === "/compound" || path.startsWith("/compound?");
      const isOverlay = type === "research_overlay" || type === "compound_overlay";
      if (!isOverlay && !(isResearchPath || isCompoundPath)) continue;
      if (id.startsWith("counter_")) continue;
      incidents.push({
        id,
        type,
        path,
        createdAt: toIsoString(r.createdAt),
        referrer: r.referrer ? String(r.referrer) : undefined,
        userAgent: r.userAgent ? String(r.userAgent) : undefined,
        message: r.message ? String(r.message) : undefined,
        details: (r.details as Record<string, unknown> | undefined) ?? undefined,
        ip: r.ip ? String(r.ip) : undefined,
      });
    }

    const now = Date.now();
    const day = 86_400_000;
    let last24 = 0;
    let last7d = 0;
    let researchOverlay = 0;
    let compoundOverlay = 0;
    let pageNotFoundResearch = 0;
    const uas = new Set<string>();
    let lastIncidentAt: string | null = null;
    for (const i of incidents) {
      const ts = i.createdAt ? Date.parse(i.createdAt) : 0;
      if (ts && (!lastIncidentAt || ts > Date.parse(lastIncidentAt))) lastIncidentAt = i.createdAt;
      if (ts && now - ts < day) last24++;
      if (ts && now - ts < 7 * day) last7d++;
      if (i.type === "research_overlay") researchOverlay++;
      if (i.type === "compound_overlay") compoundOverlay++;
      if (i.type === "page_not_found" && (i.path === "/research" || i.path.startsWith("/research"))) {
        pageNotFoundResearch++;
      }
      if (i.userAgent) uas.add(i.userAgent);
    }

    const summary: IncidentsSummary = {
      totalLast24h: last24,
      totalLast7d: last7d,
      researchOverlay,
      compoundOverlay,
      pageNotFoundResearch,
      uniqueUserAgents: uas.size,
      lastIncidentAt,
    };

    return { ok: true as const, incidents, summary };
  });
