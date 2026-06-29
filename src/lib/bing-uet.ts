/**
 * Microsoft Bing UET — conversion helpers.
 * Tag ID: K120006478 (configured in src/routes/__root.tsx).
 *
 * Fixed purchase value is used (user preference); switch revenue_value to the
 * real order total when conversion data quality matures.
 */
declare global {
  interface Window {
    uetq?: Array<unknown> & {
      push: (...args: unknown[]) => void;
    };
  }
}

const FIRED = new Set<string>();

export function trackBingPurchase(orderId?: string): void {
  if (typeof window === "undefined") return;
  const key = orderId ?? "anon";
  if (FIRED.has(key)) return;
  FIRED.add(key);
  try {
    window.uetq = window.uetq || [];
    window.uetq.push("event", "purchase", {
      event_category: "ecommerce",
      event_label: orderId || "purchase",
      revenue_value: 1,
      currency: "GBP",
    });
  } catch {
    /* no-op */
  }
}
