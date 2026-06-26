/**
 * Lightweight Real-User Web Vitals listener.
 *
 * Uses native PerformanceObserver — no dependencies, ~1KB.
 * Captures LCP, CLS, INP, FCP, TTFB and:
 *   - logs each metric to console with a clear tag (visible in DevTools)
 *   - forwards to window.gtag('event', 'web_vitals', {...}) when GA is loaded
 *   - stamps window.__phlabsVitals so manual audits / Lighthouse / Puppeteer can read final values
 *
 * Regression alerting strategy (per user choice — console/GA only, no DB):
 *   - GA4 receives metric_name + metric_value (ms) + metric_rating (good/needs-improvement/poor)
 *     so you can build a GA4 audience/alert: "LCP poor rate > 10% in last 24h".
 *   - Console group on bad LCP makes regressions obvious during preview QA after publishes.
 */

type Rating = "good" | "needs-improvement" | "poor";

interface VitalRecord {
  name: "LCP" | "CLS" | "INP" | "FCP" | "TTFB";
  value: number;
  rating: Rating;
  id: string;
  path: string;
}

const THRESHOLDS: Record<VitalRecord["name"], [number, number]> = {
  LCP: [2500, 4000],
  CLS: [0.1, 0.25],
  INP: [200, 500],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

declare global {
  interface Window {
    __phlabsVitals?: Partial<Record<VitalRecord["name"], VitalRecord>>;
    gtag?: (...args: unknown[]) => void;
  }
}

function rate(name: VitalRecord["name"], value: number): Rating {
  const [good, poor] = THRESHOLDS[name];
  if (value <= good) return "good";
  if (value <= poor) return "needs-improvement";
  return "poor";
}

// RUM sampling — beacon every "poor" sample + ~15% of others.
// Keeps Firestore write volume tiny while still surfacing trends.
const SAMPLE_RATE = 0.15;

function deviceClass(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth || 1024;
  if (w < 640) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

function connectionClass(): "4g" | "3g" | "2g" | "slow-2g" | "unknown" {
  try {
    const c = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
    const t = c?.effectiveType;
    if (t === "4g" || t === "3g" || t === "2g" || t === "slow-2g") return t;
  } catch {
    /* ignore */
  }
  return "unknown";
}

function sendBeacon(rec: VitalRecord) {
  // Always report "poor" samples; otherwise random-sample.
  if (rec.rating !== "poor" && Math.random() > SAMPLE_RATE) return;
  try {
    const body = JSON.stringify({
      name: rec.name,
      value: rec.value,
      rating: rec.rating,
      path: rec.path,
      device: deviceClass(),
      conn: connectionClass(),
      build: (window as Window & { __PHLABS_BUILD_ID__?: string }).__PHLABS_BUILD_ID__ ?? "",
    });
    const url = "/api/public/web-vitals";
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(url, blob);
      return;
    }
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

function report(name: VitalRecord["name"], value: number, id: string) {
  const rec: VitalRecord = {
    name,
    value: Math.round(name === "CLS" ? value * 1000 : value),
    rating: rate(name, value),
    id,
    path: location.pathname,
  };

  window.__phlabsVitals = { ...(window.__phlabsVitals ?? {}), [name]: rec };

  const tag = `[web-vitals] ${name} ${rec.value}${name === "CLS" ? "" : "ms"} (${rec.rating})`;
  if (rec.rating === "poor") {
    // eslint-disable-next-line no-console
    console.warn(tag, rec);
  } else {
    // eslint-disable-next-line no-console
    console.info(tag);
  }

  try {
    window.gtag?.("event", "web_vitals", {
      metric_name: name,
      metric_value: rec.value,
      metric_rating: rec.rating,
      metric_id: id,
      page_path: rec.path,
    });
  } catch {
    /* ignore */
  }

  sendBeacon(rec);
}

function observe<T extends PerformanceEntry>(
  type: string,
  cb: (entries: T[]) => void,
  opts: PerformanceObserverInit = {},
) {
  try {
    const po = new PerformanceObserver((list) => cb(list.getEntries() as T[]));
    po.observe({ type, buffered: true, ...opts } as PerformanceObserverInit);
    return po;
  } catch {
    return null;
  }
}

import { isMarketingRoute } from "@/lib/is-marketing-route";

export function initWebVitals() {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;
  // Marketing landings opt out of RUM — keeps the main thread quiet for LCP.
  if (isMarketingRoute()) return;
  if ((window as Window & { __phlabsVitalsInit?: boolean }).__phlabsVitalsInit) return;
  (window as Window & { __phlabsVitalsInit?: boolean }).__phlabsVitalsInit = true;

  // LCP — keep latest until page hidden
  let lcpValue = 0;
  let lcpId = "";
  const lcpPo = observe<PerformanceEntry & { renderTime: number; loadTime: number }>(
    "largest-contentful-paint",
    (entries) => {
      const last = entries[entries.length - 1];
      lcpValue = last.renderTime || last.loadTime || last.startTime;
      lcpId = String(last.startTime);
    },
  );

  // CLS — sum session windows
  let clsValue = 0;
  let clsEntries: PerformanceEntry[] = [];
  let sessionValue = 0;
  let sessionEntries: PerformanceEntry[] = [];
  observe<PerformanceEntry & { hadRecentInput: boolean; value: number }>(
    "layout-shift",
    (entries) => {
      for (const entry of entries) {
        if (entry.hadRecentInput) continue;
        const first = sessionEntries[0];
        const last = sessionEntries[sessionEntries.length - 1];
        if (
          sessionEntries.length &&
          (entry.startTime - last.startTime > 1000 ||
            entry.startTime - first.startTime > 5000)
        ) {
          sessionValue = 0;
          sessionEntries = [];
        }
        sessionValue += entry.value;
        sessionEntries.push(entry);
        if (sessionValue > clsValue) {
          clsValue = sessionValue;
          clsEntries = sessionEntries.slice();
        }
      }
    },
  );

  // INP — track worst interaction
  let inpValue = 0;
  let inpId = "";
  observe<PerformanceEntry & { interactionId: number; duration: number }>(
    "event",
    (entries) => {
      for (const e of entries) {
        if (!e.interactionId) continue;
        if (e.duration > inpValue) {
          inpValue = e.duration;
          inpId = String(e.interactionId);
        }
      }
    },
    { durationThreshold: 40 } as PerformanceObserverInit,
  );

  // FCP — single shot
  observe<PerformanceEntry>("paint", (entries) => {
    for (const e of entries) {
      if (e.name === "first-contentful-paint") {
        report("FCP", e.startTime, "fcp");
      }
    }
  });

  // TTFB — from navigation
  try {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav) report("TTFB", nav.responseStart, "ttfb");
  } catch {
    /* ignore */
  }

  // Flush LCP/CLS/INP when page becomes hidden (PWA-safe finalization)
  const flush = () => {
    if (lcpValue) report("LCP", lcpValue, lcpId);
    report("CLS", clsValue, String(clsEntries.length));
    if (inpValue) report("INP", inpValue, inpId);
    try {
      lcpPo?.disconnect();
    } catch {
      /* ignore */
    }
  };

  addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") flush();
    },
    { once: false },
  );
  addEventListener("pagehide", flush, { once: true });
}
