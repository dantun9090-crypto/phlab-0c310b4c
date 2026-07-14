/**
 * In-app cache & Service Worker policy verifier.
 *
 * Runs once on boot in the browser and asserts, against the *live* origin
 * serving this session, that:
 *
 *   1. No Service Worker is currently controlling the page.
 *   2. No SW registrations are active for our scope.
 *   3. If `/sw.js` is still served, its source is the kill switch — i.e.
 *      it does NOT install a `fetch` handler that intercepts navigations.
 *   4. The current HTML document's cache headers match our deploy-safe
 *      contract:
 *        - `Cache-Control` contains `no-store`  OR  (`max-age=0` +
 *          `must-revalidate` + `no-cache`).
 *        - `CDN-Cache-Control` / `Surrogate-Control` forces `no-store`.
 *        - `cf-cache-status` is not `HIT` / `STALE` / `REVALIDATED` /
 *          `UPDATING` (Cloudflare must not replay a shell across deploys).
 *
 * Result is exposed on `window.__phlabsCachePolicy` and a
 * `phlabs:cache-policy` CustomEvent is dispatched so the admin panel (or
 * any debug widget) can pick it up. Failures are console.warn'd with a
 * clear tag so post-deploy QA and Playwright specs can grep for them.
 *
 * Intentionally passive: never registers, unregisters, or purges anything
 * — that stays the responsibility of `src/lib/sw-register.ts` and the
 * `/sw.js` kill-switch itself. This module only observes and reports.
 */

export type CheckStatus = "pass" | "fail" | "skip";

export interface PolicyCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

export interface PolicyReport {
  ok: boolean;
  checkedAt: string;
  url: string;
  checks: PolicyCheck[];
}

declare global {
  interface Window {
    __phlabsCachePolicy?: PolicyReport;
    __phlabsCachePolicyInit?: boolean;
  }
}

function parseCacheControl(header: string | null): {
  raw: string;
  noStore: boolean;
  noCache: boolean;
  mustRevalidate: boolean;
  maxAge: number | null;
} {
  const raw = (header || "").toLowerCase();
  const maxAgeMatch = raw.match(/(?:^|,\s*)max-age\s*=\s*(\d+)/);
  return {
    raw,
    noStore: raw.includes("no-store"),
    noCache: /(?:^|,\s*)no-cache(?:\s|,|$)/.test(raw),
    mustRevalidate: raw.includes("must-revalidate"),
    maxAge: maxAgeMatch ? Number(maxAgeMatch[1]) : null,
  };
}

async function checkServiceWorker(): Promise<PolicyCheck[]> {
  const checks: PolicyCheck[] = [];
  if (!("serviceWorker" in navigator)) {
    checks.push({ id: "sw.support", label: "Service Worker API present", status: "skip", detail: "unsupported" });
    return checks;
  }

  const controller = navigator.serviceWorker.controller;
  checks.push({
    id: "sw.controller",
    label: "No Service Worker controls the page",
    status: controller ? "fail" : "pass",
    detail: controller ? `controller: ${controller.scriptURL} (${controller.state})` : undefined,
  });

  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    checks.push({
      id: "sw.registrations",
      label: "No active Service Worker registrations",
      status: regs.length === 0 ? "pass" : "fail",
      detail:
        regs.length === 0
          ? undefined
          : regs
              .map(
                (r) =>
                  r.active?.scriptURL ||
                  r.waiting?.scriptURL ||
                  r.installing?.scriptURL ||
                  "(unknown)",
              )
              .join(", "),
    });
  } catch (err) {
    checks.push({
      id: "sw.registrations",
      label: "No active Service Worker registrations",
      status: "skip",
      detail: `getRegistrations failed: ${(err as Error).message}`,
    });
  }

  // Inspect /sw.js source (if served) — must be the kill switch, i.e. no
  // `addEventListener('fetch'...)` that would intercept navigations.
  try {
    const res = await fetch("/sw.js", { cache: "no-store" });
    if (res.status === 404) {
      checks.push({
        id: "sw.source",
        label: "/sw.js is absent or kill-switch",
        status: "pass",
        detail: "404 — no SW served",
      });
    } else if (!res.ok) {
      checks.push({
        id: "sw.source",
        label: "/sw.js is absent or kill-switch",
        status: "skip",
        detail: `HTTP ${res.status}`,
      });
    } else {
      const body = await res.text();
      const hasFetchHandler = /addEventListener\s*\(\s*['"]fetch['"]/.test(body);
      const hasRespondWith = /respondWith\s*\(/.test(body);
      const looksLikeKillSwitch = /unregister\s*\(/.test(body) && !hasFetchHandler && !hasRespondWith;
      const navigationStrategyDisabled = !hasFetchHandler && !hasRespondWith;
      checks.push({
        id: "sw.source",
        label: "/sw.js has no navigation fetch strategy",
        status: navigationStrategyDisabled ? "pass" : "fail",
        detail: navigationStrategyDisabled
          ? looksLikeKillSwitch
            ? "kill switch (unregister only)"
            : "no fetch/respondWith handler"
          : `fetch handler present (hasFetch=${hasFetchHandler}, hasRespondWith=${hasRespondWith})`,
      });
    }
  } catch (err) {
    checks.push({
      id: "sw.source",
      label: "/sw.js has no navigation fetch strategy",
      status: "skip",
      detail: `fetch failed: ${(err as Error).message}`,
    });
  }

  return checks;
}

async function checkHtmlHeaders(): Promise<PolicyCheck[]> {
  const checks: PolicyCheck[] = [];
  const url = location.pathname + location.search;

  let res: Response;
  try {
    // HEAD keeps this cheap; some CDNs strip Cache-Control on HEAD, so
    // fall back to a bypass-cache GET when the header is missing.
    res = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (!res.headers.get("cache-control")) {
      res = await fetch(url, { method: "GET", cache: "no-store", headers: { "cache-control": "no-cache" } });
    }
  } catch (err) {
    checks.push({
      id: "html.fetch",
      label: "Fetch current document headers",
      status: "skip",
      detail: `network error: ${(err as Error).message}`,
    });
    return checks;
  }

  const cc = parseCacheControl(res.headers.get("cache-control"));
  const cdn = (res.headers.get("cdn-cache-control") || res.headers.get("cloudflare-cdn-cache-control") || res.headers.get("surrogate-control") || "").toLowerCase();
  const cf = (res.headers.get("cf-cache-status") || "").toUpperCase();

  const browserOk =
    cc.noStore ||
    (cc.maxAge === 0 && cc.mustRevalidate && cc.noCache);
  checks.push({
    id: "html.browser-cache-control",
    label: "Browser Cache-Control is no-store / no-cache+must-revalidate+max-age=0",
    status: browserOk ? "pass" : "fail",
    detail: cc.raw || "(missing)",
  });

  checks.push({
    id: "html.cdn-cache-control",
    label: "CDN-Cache-Control forces no-store",
    status: cdn.includes("no-store") ? "pass" : "fail",
    detail: cdn || "(missing)",
  });

  const cfBad = ["HIT", "STALE", "REVALIDATED", "UPDATING"].includes(cf);
  checks.push({
    id: "html.cf-cache-status",
    label: "Cloudflare did not replay cached HTML",
    status: cf ? (cfBad ? "fail" : "pass") : "skip",
    detail: cf || "(no cf-cache-status)",
  });

  return checks;
}

/**
 * Run all checks once and stash the report. Safe to call from boot code;
 * self-guards against double-init. Non-blocking — runs on idle.
 */
export function initCachePolicyVerifier(): void {
  if (typeof window === "undefined") return;
  if (window.__phlabsCachePolicyInit) return;
  window.__phlabsCachePolicyInit = true;

  const run = async () => {
    const checks = [...(await checkServiceWorker()), ...(await checkHtmlHeaders())];
    const report: PolicyReport = {
      ok: checks.every((c) => c.status !== "fail"),
      checkedAt: new Date().toISOString(),
      url: location.href,
      checks,
    };
    window.__phlabsCachePolicy = report;

    const failed = checks.filter((c) => c.status === "fail");
    if (failed.length) {
      // eslint-disable-next-line no-console
      console.warn(
        `[cache-policy] ${failed.length} FAIL — SW/HTML cache contract broken`,
        failed,
        report,
      );
    } else {
      // eslint-disable-next-line no-console
      console.info(
        `[cache-policy] OK — SW disabled, HTML no-store contract holds (${checks.length} checks)`,
      );
    }

    try {
      window.dispatchEvent(new CustomEvent("phlabs:cache-policy", { detail: report }));
    } catch {
      /* ignore */
    }
  };

  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof idle === "function") {
    idle(() => void run(), { timeout: 4000 });
  } else {
    setTimeout(() => void run(), 1500);
  }
}
