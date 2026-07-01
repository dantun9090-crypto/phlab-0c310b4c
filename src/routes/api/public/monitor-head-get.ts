/**
 * HEAD vs GET monitor for phlabs.co.uk + prohealthpeptides.co.uk.
 *
 * Compares HEAD and GET responses for each host and only reports an alert
 * when GET (real browser fetch) fails: non-200 status, missing JS bundle
 * reference in HTML, or unreachable entry bundle. HEAD-only failures
 * (many CDNs / Firebase Hosting return 404 to HEAD probes even when GET
 * works fine) are surfaced as informational, never as alerts.
 *
 * GET /api/public/monitor-head-get -> JSON report, 200 if all GETs healthy,
 * 503 otherwise. No auth, no PII, safe for uptime pingers.
 */
import { createFileRoute } from "@tanstack/react-router";

const HOSTS = ["https://phlabs.co.uk", "https://prohealthpeptides.co.uk"];
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 phlabs-monitor/1.0";

interface HostReport {
  host: string;
  head: { status: number; ok: boolean; ms: number; error?: string };
  get: {
    status: number;
    ok: boolean;
    ms: number;
    bytes: number;
    hasScript: boolean;
    entry?: string;
    entryStatus?: number;
    entryOk?: boolean;
    entryBytes?: number;
    error?: string;
  };
  alert: boolean;
  alertReasons: string[];
  informational: string[];
}

async function timed(url: string, init: RequestInit): Promise<Response & { ms: number } | { error: string; ms: number }> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      ...init,
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": UA, ...(init.headers || {}) },
    });
    (res as any).ms = Date.now() - t0;
    return res as Response & { ms: number };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
  }
}

async function checkHost(host: string): Promise<HostReport> {
  const [headRes, getRes] = await Promise.all([
    timed(host + "/", { method: "HEAD" }),
    timed(host + "/", { method: "GET", headers: { accept: "text/html" } }),
  ]);

  const report: HostReport = {
    host,
    head: { status: 0, ok: false, ms: 0 },
    get: { status: 0, ok: false, ms: 0, bytes: 0, hasScript: false },
    alert: false,
    alertReasons: [],
    informational: [],
  };

  if ("error" in headRes) {
    report.head = { status: 0, ok: false, ms: headRes.ms, error: headRes.error };
  } else {
    report.head = { status: headRes.status, ok: headRes.ok, ms: headRes.ms };
  }

  if ("error" in getRes) {
    report.get = { status: 0, ok: false, ms: getRes.ms, bytes: 0, hasScript: false, error: getRes.error };
    report.alert = true;
    report.alertReasons.push(`GET fetch failed: ${getRes.error}`);
    return report;
  }

  const html = await getRes.text().catch(() => "");
  const bytes = html.length;
  const scriptMatch = html.match(/<script[^>]+src=["']([^"']*\/assets\/[^"']+\.js)["']/i);
  report.get = {
    status: getRes.status,
    ok: getRes.ok,
    ms: (getRes as any).ms,
    bytes,
    hasScript: !!scriptMatch,
    entry: scriptMatch ? scriptMatch[1] : undefined,
  };

  if (!getRes.ok) {
    report.alert = true;
    report.alertReasons.push(`GET returned ${getRes.status}`);
  }
  if (!scriptMatch) {
    report.alert = true;
    report.alertReasons.push("HTML missing /assets/*.js reference (emergency shell?)");
  } else {
    const entryUrl = new URL(scriptMatch[1], host + "/").toString();
    const js = await timed(entryUrl, { method: "GET" });
    if ("error" in js) {
      report.alert = true;
      report.alertReasons.push(`entry JS fetch failed: ${js.error}`);
    } else {
      const jsBody = await js.text().catch(() => "");
      report.get.entryStatus = js.status;
      report.get.entryOk = js.ok;
      report.get.entryBytes = jsBody.length;
      const ctype = (js.headers.get("content-type") || "").toLowerCase();
      if (!js.ok) {
        report.alert = true;
        report.alertReasons.push(`entry JS returned ${js.status}`);
      } else if (jsBody.length < 200) {
        report.alert = true;
        report.alertReasons.push(`entry JS suspiciously small (${jsBody.length}b)`);
      } else if (ctype && !/(javascript|ecmascript)/.test(ctype)) {
        report.alert = true;
        report.alertReasons.push(`entry JS wrong content-type: ${ctype}`);
      } else if (/^\s*<!doctype|<html[\s>]/i.test(jsBody.slice(0, 512))) {
        report.alert = true;
        report.alertReasons.push("entry JS body is HTML (stale asset fallback)");
      }
    }
  }

  // HEAD-only anomalies are informational (Firebase Hosting / Fastly often
  // 404 on HEAD probes even when GET works). Never alert on them.
  if (!report.head.ok && report.get.ok) {
    report.informational.push(
      `HEAD ${report.head.status || "ERR"} while GET ${report.get.status} — HEAD-probe artefact, not a real outage`,
    );
  }

  return report;
}

export const Route = createFileRoute("/api/public/monitor-head-get")({
  server: {
    handlers: {
      GET: async () => {
        const reports = await Promise.all(HOSTS.map(checkHost));
        const alerting = reports.filter((r) => r.alert);
        const body = {
          timestamp: new Date().toISOString(),
          overall: alerting.length === 0 ? "PASS" : "ALERT",
          alertCount: alerting.length,
          alerts: alerting.map((r) => ({ host: r.host, reasons: r.alertReasons })),
          reports,
        };
        return new Response(JSON.stringify(body, null, 2), {
          status: alerting.length === 0 ? 200 : 503,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
          },
        });
      },
      HEAD: async () => new Response(null, { status: 200 }),
    },
  },
});
