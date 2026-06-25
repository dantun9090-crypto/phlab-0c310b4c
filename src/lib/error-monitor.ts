/**
 * Client-side error monitoring: catches fetch responses with 5xx / 429
 * status, dispatches a `page_not_found` for SPA 404s, sends each event to
 * GA4 (gtag + dataLayer) as a separate named event, and POSTs to the
 * server-side `/api/public/error-monitor` endpoint which handles
 * rolling-window threshold alerts (email/Slack).
 *
 * Safe to call multiple times — idempotent via a window flag.
 */

type MonitorEventType = "page_not_found" | "server_error" | "rate_limited";

interface ReportInput {
  type: MonitorEventType;
  path: string;
  status?: number;
  referrer?: string;
  message?: string;
}

const FLAG = "__phl_error_monitor_installed__";
const DEDUPE_TTL_MS = 30_000;
const recentlySent = new Map<string, number>();

// First-party origins where we care about response status. We intentionally
// IGNORE third-party domains (Firestore, gtag, etc.) because their 4xx/5xx
// are not site outages from a visitor perspective.
function isFirstParty(url: string): boolean {
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin === window.location.origin) return true;
    const h = u.hostname.toLowerCase();
    return h === "phlabs.co.uk" || h === "www.phlabs.co.uk";
  } catch {
    return false;
  }
}

function shouldIgnorePath(path: string): boolean {
  // The monitor endpoint itself + GA / analytics beacons must never be reported
  // (would create an infinite loop).
  return (
    path.startsWith("/api/public/error-monitor") ||
    path.startsWith("/api/public/csp-report") ||
    path.includes("google-analytics.com") ||
    path.includes("googletagmanager.com")
  );
}

function dedupeKey(input: ReportInput): string {
  return `${input.type}|${input.path}|${input.status ?? ""}`;
}

function sendGa4(input: ReportInput): void {
  try {
    const w = window as unknown as {
      gtag?: (...args: unknown[]) => void;
      dataLayer?: unknown[];
    };
    const payload = {
      page_path: input.path,
      page_location: window.location.href,
      page_referrer: input.referrer ?? document.referrer ?? "(direct)",
      status_code: input.status,
      error_message: input.message,
      non_interaction: true,
    };
    // Each error type goes out as its OWN GA4 event so they can be filtered
    // independently in Reports → Engagement → Events.
    w.gtag?.("event", input.type, payload);
    // Also map to GA4's standard `exception` for ad-hoc dashboards.
    w.gtag?.("event", "exception", {
      description: `${input.type}:${input.status ?? ""} ${input.path}`,
      fatal: false,
    });
    (w.dataLayer ||= []).push({ event: input.type, ...payload });
  } catch {
    /* monitoring must never throw */
  }
}

function sendBeacon(input: ReportInput): void {
  try {
    const body = JSON.stringify({
      type: input.type,
      path: input.path,
      status: input.status,
      referrer: input.referrer ?? document.referrer ?? undefined,
      userAgent: navigator.userAgent,
      message: input.message,
    });
    const url = "/api/public/error-monitor";
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) return;
    }
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never throw */
  }
}

/**
 * Public API — call from anywhere (e.g. NotFound page).
 */
export function reportClientError(input: ReportInput): void {
  if (typeof window === "undefined") return;
  if (shouldIgnorePath(input.path)) return;

  const key = dedupeKey(input);
  const now = Date.now();
  const last = recentlySent.get(key);
  if (last && now - last < DEDUPE_TTL_MS) return;
  recentlySent.set(key, now);
  // Trim memory occasionally.
  if (recentlySent.size > 200) {
    for (const [k, t] of recentlySent) {
      if (now - t > DEDUPE_TTL_MS) recentlySent.delete(k);
    }
  }

  sendGa4(input);
  sendBeacon(input);
}

/**
 * Install the global fetch wrapper. Must be idempotent — RootComponent
 * mounts may run more than once across HMR / hydration.
 */
export function installErrorMonitor(): void {
  if (typeof window === "undefined") return;
  // Marketing landings skip the global fetch wrap to avoid TBT on LCP.
  // Errors on /compound are still surfaced by the browser/GA via the
  // separate onerror path, and there are no first-party fetches on this
  // route worth monitoring.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { isMarketingRoute } = require("@/lib/is-marketing-route") as typeof import("@/lib/is-marketing-route");
  if (isMarketingRoute()) return;
  const w = window as unknown as Record<string, unknown>;
  if (w[FLAG]) return;
  w[FLAG] = true;

  const origFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await origFetch(...args);
    try {
      const reqUrl =
        typeof args[0] === "string"
          ? args[0]
          : args[0] instanceof URL
          ? args[0].toString()
          : (args[0] as Request).url;
      if (isFirstParty(reqUrl)) {
        const pathOnly = (() => {
          try {
            return new URL(reqUrl, window.location.origin).pathname;
          } catch {
            return reqUrl;
          }
        })();
        if (!shouldIgnorePath(pathOnly)) {
          if (res.status === 429) {
            reportClientError({
              type: "rate_limited",
              path: pathOnly,
              status: 429,
            });
          } else if (res.status >= 500 && res.status <= 599) {
            reportClientError({
              type: "server_error",
              path: pathOnly,
              status: res.status,
            });
          }
        }
      }
    } catch {
      /* never break the response */
    }
    return res;
  };
}
