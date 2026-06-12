/**
 * CSP violation report sink.
 *
 * Receives reports from two browser APIs:
 *   - legacy `report-uri` directive  → POST application/csp-report
 *   - modern `Reporting-Endpoints`   → POST application/reports+json (array)
 *
 * Both formats are logged via `log.warn` so they surface in
 * `wrangler tail` / Cloudflare Worker logs alongside other Worker events.
 * No PII is persisted; we drop anything we don't explicitly extract.
 *
 * Lives under /api/public/* so Lovable's published-site auth bypasses it,
 * which matches what browsers expect for a public report sink.
 */
import { createFileRoute } from "@tanstack/react-router";

import { log, extractClientIp, truncate } from "@/lib/worker-log";
import { enforceRateLimit } from "@/lib/rate-limit";


type LegacyReport = {
  "csp-report"?: {
    "document-uri"?: string;
    referrer?: string;
    "violated-directive"?: string;
    "effective-directive"?: string;
    "original-policy"?: string;
    "blocked-uri"?: string;
    "status-code"?: number;
    "script-sample"?: string;
    "source-file"?: string;
    "line-number"?: number;
    "column-number"?: number;
    disposition?: string;
  };
};

type ModernReport = {
  type?: string;
  age?: number;
  url?: string;
  user_agent?: string;
  body?: {
    documentURL?: string;
    referrer?: string;
    blockedURL?: string;
    effectiveDirective?: string;
    originalPolicy?: string;
    sourceFile?: string;
    sample?: string;
    disposition?: string;
    statusCode?: number;
    lineNumber?: number;
    columnNumber?: number;
  };
};

function extractLegacy(payload: LegacyReport) {
  const r = payload["csp-report"] ?? {};
  return {
    format: "legacy" as const,
    documentUri: truncate(r["document-uri"]),
    referrer: truncate(r.referrer),
    directive: r["violated-directive"] ?? r["effective-directive"],
    blockedUri: truncate(r["blocked-uri"]),
    sourceFile: truncate(r["source-file"]),
    sample: truncate(r["script-sample"], 128),
    line: r["line-number"],
    column: r["column-number"],
    disposition: r.disposition,
  };
}

function extractModern(report: ModernReport) {
  const b = report.body ?? {};
  return {
    format: "report-to" as const,
    type: report.type,
    documentUri: truncate(b.documentURL ?? report.url),
    referrer: truncate(b.referrer),
    directive: b.effectiveDirective,
    blockedUri: truncate(b.blockedURL),
    sourceFile: truncate(b.sourceFile),
    sample: truncate(b.sample, 128),
    line: b.lineNumber,
    column: b.columnNumber,
    disposition: b.disposition,
  };
}

export const Route = createFileRoute("/api/public/csp-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Rate limit (10/min/IP) — prevents report flooding.
        const limited = await enforceRateLimit(request, "/api/public/csp-report", {
          limit: 10,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) return limited;

        const ip = extractClientIp(request);
        const ua = truncate(request.headers.get("user-agent"));
        const ct = (request.headers.get("content-type") ?? "").toLowerCase();

        // Only accept the two formats browsers actually send.
        const ctOk =
          ct.includes("application/csp-report") ||
          ct.includes("application/reports+json") ||
          ct.includes("application/json");
        if (!ctOk) {
          return new Response(null, { status: 415 });
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          // Some browsers send empty body on dropped reports — accept and move on.
          return new Response(null, { status: 204 });
        }


        const reports: Array<ReturnType<typeof extractLegacy> | ReturnType<typeof extractModern>> = [];
        try {
          if (ct.includes("application/reports+json") && Array.isArray(raw)) {
            for (const item of raw as ModernReport[]) {
              if (item && typeof item === "object") reports.push(extractModern(item));
            }
          } else if (raw && typeof raw === "object") {
            reports.push(extractLegacy(raw as LegacyReport));
          }
        } catch (err) {
          log.warn({
            event: "csp.report.parse_error",
            error: err instanceof Error ? err.message : String(err),
            ip,
            ua,
          });
        }

        for (const r of reports) {
          log.warn({
            event: "csp.violation",
            ip,
            ua,
            ...r,
          });
        }

        // 204 No Content — Reporting API treats anything 2xx as accepted.
        return new Response(null, { status: 204 });
      },
      // Browser preflights some report endpoints (rare, but cheap to satisfy).
      OPTIONS: async () => {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type",
            "access-control-max-age": "86400",
          },
        });
      },
    },
  },
});
