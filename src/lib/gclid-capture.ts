/**
 * Google Ads click-id capture for offline conversion imports.
 *
 * When someone clicks a Google ad, Google appends a click id to the landing
 * URL: `gclid` (most traffic), `gbraid` / `wbraid` (iOS / privacy-safe
 * variants). These live in the URL — NOT in cookies — so they can be
 * captured even when the visitor declines analytics/marketing storage.
 *
 * We persist them in localStorage (90-day attribution window, matching
 * Google's click-conversion lookback limit) and attach them to the order
 * at checkout. The server-side feed
 * (src/routes/api/public/hooks/offline-conversions.ts) then exports paid
 * orders back to Google Ads as offline click conversions — recovering
 * conversions that the browser tag could not record (consent declined,
 * ad-blocker, bank-app redirect losing the session).
 *
 * IMPORTANT: we deliberately do NOT strip the params from the URL after
 * capture. gtag's conversion linker reads `gclid` from the landing URL
 * when it configures the Ads destination — removing it would break the
 * normal (consented) tag-based attribution.
 *
 * Privacy: click ids are pseudonymous identifiers used for ad measurement.
 * This processing must be disclosed in the shop's privacy policy.
 */

const STORAGE_KEY = "php_ad_click_ids_v1";
/** Google's click-conversion lookback window is 90 days — older ids can
 * never match, so treat them as expired. */
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

const PARAM_NAMES = ["gclid", "gbraid", "wbraid"] as const;
type ParamName = (typeof PARAM_NAMES)[number];

export interface AdClickIds {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  capturedAt?: string;
}

/**
 * Click ids are alphanumeric with a small set of punctuation (Base64url-ish
 * with occasional `.` / `~`). Length guard rejects junk while comfortably
 * covering Google's documented sizes.
 */
const VALUE_RE = /^[A-Za-z0-9_.\-~]{10,500}$/;

function sanitise(value: string | null): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  return VALUE_RE.test(v) ? v : undefined;
}

/**
 * Read the click ids from the current URL and persist them (overwriting any
 * older capture — the most recent ad click wins, mirroring Google's
 * last-click attribution). No-op when no id is present. Safe to call on
 * every page load; idempotent.
 */
export function captureAdClickIdsFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    const found: Partial<Record<ParamName, string>> = {};
    for (const name of PARAM_NAMES) {
      const v = sanitise(params.get(name));
      if (v) found[name] = v;
    }
    if (!Object.keys(found).length) return;
    const payload: AdClickIds = { ...found, capturedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch { /* storage unavailable — private mode etc. */ }
}

/**
 * Return the stored click ids, or null when none / expired (>90 days).
 * Read at checkout and forwarded to `createOrder`.
 */
export function getStoredAdClickIds(): AdClickIds | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdClickIds;
    const ts = Date.parse(String(parsed?.capturedAt ?? ""));
    if (!Number.isFinite(ts) || Date.now() - ts > MAX_AGE_MS) return null;
    const out: AdClickIds = {};
    for (const name of PARAM_NAMES) {
      const candidate = (parsed as Record<string, unknown>)[name];
      const v = sanitise(typeof candidate === "string" ? candidate : null);
      if (v) out[name] = v;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}
