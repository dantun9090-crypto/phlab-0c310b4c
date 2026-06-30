/**
 * Lightweight Sentry-style client error reporter.
 *
 * Posts uncaught errors, unhandled rejections, and React error-boundary
 * crashes to /api/public/error-monitor with router/build context. No
 * third-party SDK — keeps bundle small and avoids extra network beacons.
 *
 * Deduped by (message + first stack frame) within a session and rate-
 * limited to 8 events/min so a render-loop cannot flood the endpoint.
 */

const SEEN = new Set<string>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 8;
const recent: number[] = [];

function buildId(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return (
    document.querySelector('meta[name="x-build-id"]')?.getAttribute("content") ||
    undefined
  );
}

function firstFrame(stack?: string): string {
  if (!stack) return "";
  const line = stack.split("\n").find((l) => l.includes("at ") || l.includes("@")) || "";
  return line.trim().slice(0, 200);
}

function shouldSend(message: string, stack?: string): boolean {
  const key = `${message}::${firstFrame(stack)}`;
  if (SEEN.has(key)) return false;
  SEEN.add(key);
  const now = Date.now();
  while (recent.length && now - recent[0] > RATE_WINDOW_MS) recent.shift();
  if (recent.length >= RATE_MAX) return false;
  recent.push(now);
  return true;
}

export interface ReportOptions {
  source: "window.error" | "unhandledrejection" | "error-boundary" | "manual";
  message: string;
  stack?: string;
  routeId?: string;
}

export function reportClientError(opts: ReportOptions): void {
  try {
    if (typeof window === "undefined") return;
    const message = String(opts.message || "").slice(0, 2000);
    if (!message) return;
    if (!shouldSend(message, opts.stack)) return;

    const payload = {
      type: "client_exception" as const,
      path: location.pathname + location.search,
      referrer: document.referrer || undefined,
      userAgent: navigator.userAgent,
      message: `[${opts.source}] ${message}`,
      stack: opts.stack?.slice(0, 8000),
      routeId: opts.routeId,
      buildId: buildId(),
    };

    const body = JSON.stringify(payload);
    const url = "/api/public/error-monitor";
    // sendBeacon is fire-and-forget and survives navigation/unload.
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    }
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
      credentials: "omit",
    }).catch(() => undefined);
  } catch {
    /* never let the reporter throw */
  }
}

let installed = false;
export function installClientErrorReporter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener(
    "error",
    (event) => {
      const err = (event as ErrorEvent).error;
      const message =
        (err && (err.message as string)) || (event as ErrorEvent).message || "Unknown error";
      const stack = err && typeof err.stack === "string" ? err.stack : undefined;
      reportClientError({ source: "window.error", message, stack });
    },
    true,
  );

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      const reason = (event as PromiseRejectionEvent).reason;
      const message =
        (reason && (reason.message as string)) || String(reason) || "Unhandled promise rejection";
      const stack = reason && typeof reason.stack === "string" ? reason.stack : undefined;
      reportClientError({ source: "unhandledrejection", message, stack });
    },
    true,
  );
}
