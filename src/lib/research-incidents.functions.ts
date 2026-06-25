/**
 * Admin → Research Incidents.
 *
 * Reads the `error_events` Firestore collection for overlay/regression
 * incidents recorded by the in-page guards on /research and /compound
 * (see PremiumLandingGuard + Research page guard).
 *
 * Also exposes `resolveResearchIncident` for the Admin UI to mark an
 * incident as resolved/dismissed with an audit trail and optional note.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAdmin } from "./server/firebase-auth-admin";
import { addDocAdmin, listDocsAdmin, updateDocAdmin } from "./server/firestore-admin";

export type IncidentStatus = "open" | "resolved" | "dismissed";

export interface IncidentRow {
  id: string;
  type: string;
  path: string;
  createdAt: string;
  referrer?: string;
  userAgent?: string;
  message?: string;
  /** JSON-encoded details payload (kept as string for serialization safety). */
  detailsJson?: string;
  ip?: string;
  status: IncidentStatus;
  resolvedBy?: string;
  resolvedAt?: string;
  note?: string;
}

export interface IncidentsSummary {
  totalLast24h: number;
  totalLast7d: number;
  researchOverlay: number;
  compoundOverlay: number;
  pageNotFoundResearch: number;
  uniqueUserAgents: number;
  lastIncidentAt: string | null;
  /** Open incidents in the last 24h — used for the alert banner. */
  openLast24h: number;
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

function normalizeStatus(v: unknown): IncidentStatus {
  if (v === "resolved" || v === "dismissed") return v;
  return "open";
}

export const listResearchIncidents = createServerFn({ method: "POST" })
  .inputValidator((data) => Input.parse(data))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const limit = data.limit ?? 100;

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
        detailsJson: r.details ? JSON.stringify(r.details) : undefined,
        ip: r.ip ? String(r.ip) : undefined,
        status: normalizeStatus(r.status),
        resolvedBy: r.resolvedBy ? String(r.resolvedBy) : undefined,
        resolvedAt: r.resolvedAt ? toIsoString(r.resolvedAt) : undefined,
        note: r.note ? String(r.note) : undefined,
      });
    }

    const now = Date.now();
    const day = 86_400_000;
    let last24 = 0;
    let last7d = 0;
    let openLast24h = 0;
    let researchOverlay = 0;
    let compoundOverlay = 0;
    let pageNotFoundResearch = 0;
    const uas = new Set<string>();
    let lastIncidentAt: string | null = null;
    for (const i of incidents) {
      const ts = i.createdAt ? Date.parse(i.createdAt) : 0;
      if (ts && (!lastIncidentAt || ts > Date.parse(lastIncidentAt))) lastIncidentAt = i.createdAt;
      if (ts && now - ts < day) {
        last24++;
        if (i.status === "open") openLast24h++;
      }
      if (ts && now - ts < 7 * day) last7d++;
      if (i.status === "open") {
        if (i.type === "research_overlay") researchOverlay++;
        if (i.type === "compound_overlay") compoundOverlay++;
      }
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
      openLast24h,
    };

    return { ok: true as const, incidents, summary };
  });

/* ─────────────────────────────────────────────────────────── */

const ResolveInput = z.object({
  idToken: z.string().min(10),
  id: z.string().min(1).max(200),
  action: z.enum(["resolved", "dismissed", "open"]),
  note: z.string().max(2000).optional(),
});

/**
 * Mark a single incident as resolved / dismissed (or re-open). Writes a
 * status patch on `error_events/{id}` and appends an audit entry to
 * `auditLogs` with adminUid, action, target, before/after, and timestamp.
 */
export const resolveResearchIncident = createServerFn({ method: "POST" })
  .inputValidator((data) => ResolveInput.parse(data))
  .handler(async ({ data }) => {
    const user = await requireFirebaseAdmin(data.idToken);
    const nowIso = new Date().toISOString();

    const before: Record<string, unknown> = { status: "open" };
    const after: Record<string, unknown> = {
      status: data.action,
      resolvedBy: data.action === "open" ? "" : user.uid,
      resolvedAt: data.action === "open" ? "" : nowIso,
      note: data.note ?? "",
    };

    await updateDocAdmin("error_events", data.id, after);

    await addDocAdmin("auditLogs", {
      adminUid: user.uid,
      adminEmail: user.email ?? "",
      action: data.action === "open" ? "incident.reopen" : `incident.${data.action}`,
      target: `error_events/${data.id}`,
      before,
      after,
      timestamp: nowIso,
    });

    return { ok: true as const, id: data.id, status: data.action, at: nowIso };
  });
