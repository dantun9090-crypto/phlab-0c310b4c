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
  // Server injects <meta name="build-id">; older builds used "x-build-id".
  return (
    document.querySelector('meta[name="build-id"]')?.getAttribute("content") ||
    document.querySelector('meta[name="x-build-id"]')?.getAttribute("content") ||
    undefined
  );
}

function release(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return (
    document.querySelector('meta[name="release"]')?.getAttribute("content") ||
    buildId()
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

function isResourceLoadNoise(event: Event): boolean {
  const target = event.target as Element | null;
  if (!target || target === window) return false;
  const tag = target.tagName?.toLowerCase();
  if (!tag || !["script", "img", "link", "iframe"].includes(tag)) return false;
  const url =
    target instanceof HTMLScriptElement ? target.src :
    target instanceof HTMLImageElement ? target.src :
    target instanceof HTMLLinkElement ? target.href :
    target instanceof HTMLIFrameElement ? target.src :
    "";
  try {
    console.warn("[CLIENT ERROR REPORTER] suppressed resource-load noise", tag, url || "[inline]");
  } catch { /* noop */ }
  return true;
}

function isCrossOriginScriptNoise(message: string, stack?: string): boolean {
  const clean = String(message || "").trim();
  if (/^Script error\.?$/i.test(clean)) return true;
  if (/^Unknown error$/i.test(clean) && !stack) return true;
  return false;
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
      release: release(),
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

/**
 * Detect the "third-party mutated DOM out from under React" pattern.
 * Symptoms: `removeChild` / `insertBefore` TypeErrors thrown from inside
 * the React reconciler (xg/Fn/Ut/Hg minified frames or commitDeletion /
 * commitMutationEffects). These are caused by external scripts (analytics
 * pixels, browser extensions, watermark removers) deleting nodes React
 * manages. We log a single diagnostic line and suppress so the user
 * doesn't see an "Unknown error" alert email per page view.
 */
function isDomMutationConflict(message: string, stack?: string): boolean {
  if (!/removeChild|insertBefore|not a child of this node|NotFoundError/i.test(message)) {
    return false;
  }
  const s = stack || "";
  return /commitDeletion|commitMutation|reconciler|\bxg\b|\bFn\b|\bUt\b|\bHg\b|react-dom/i.test(s) || s === "";
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
      if (isResourceLoadNoise(event) || isCrossOriginScriptNoise(message, stack)) {
        event.preventDefault?.();
        return;
      }
      if (isDomMutationConflict(message, stack)) {
        try {
          console.warn(
            "[DOM MUTATION CONFLICT]",
            new Date().toISOString(),
            location.pathname,
            message.slice(0, 200),
          );
          event.preventDefault?.();
        } catch { /* noop */ }
        return; // suppress beacon — known cosmetic third-party conflict
      }
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
      if (isDomMutationConflict(message, stack)) {
        try {
          console.warn(
            "[DOM MUTATION CONFLICT]",
            new Date().toISOString(),
            location.pathname,
            message.slice(0, 200),
          );
          event.preventDefault?.();
        } catch { /* noop */ }
        return;
      }
      reportClientError({ source: "unhandledrejection", message, stack });
    },
    true,
  );
}
