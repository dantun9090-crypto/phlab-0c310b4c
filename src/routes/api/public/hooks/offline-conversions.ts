/**
 * Google Ads OFFLINE CONVERSION feed (click conversions / gclid import).
 *
 * URL: GET https://phlabs.co.uk/api/public/hooks/offline-conversions?key=<CRON_SECRET>
 * Alias (identical CSV): /api/public/hooks/offline-conversions.csv — required
 * by the Ads Data Manager "Set up import" flow, which validates the file
 * format from the URL extension and rejects extension-less URLs.
 *
 * Google Ads → Goals → Conversions → Uploads → Schedules fetches this URL
 * daily (source type HTTPS) and matches each `gclid` back to the original
 * ad click. This recovers conversions the browser tag could NOT record:
 * consent declined, ad-blocker, or a bank-app redirect that lost the tab.
 *
 * Which orders are exported:
 *   - paid (any post-payment status), paymentProvider wallid/peptidepay
 *     (bank_transfer fires client-side at checkout by design and is excluded
 *     to avoid double counting),
 *   - has a captured adClickIds.gclid (see src/lib/gclid-capture.ts),
 *   - NO adsClientConversionAt marker — i.e. the success page never
 *     confirmed a consented browser-side Ads conversion (see
 *     src/routes/api/payments/status.ts). This is the dedup key against the
 *     live tag. Google additionally ignores exact re-uploads (same gclid +
 *     conversion name + timestamp), so re-fetching the same row is safe.
 *   - paidAt within the last 90 days (Google's click-conversion lookback
 *     limit — older clicks can never match).
 *
 * Auth: reuses CRON_SECRET (constant-time compare). Accepted either as the
 * `key` query param or as the HTTP Basic password (the Ads scheduled-upload
 * UI offers username/password fields; any username works). On failure the
 * route answers 401 with a WWW-Authenticate challenge — Google's HTTPS
 * connector only presents the stored Basic credentials after such a
 * challenge and reports a bare 403 as "Invalid credentials".
 *
 * CSV format follows Google's "Upload conversions from clicks" template:
 *   Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency
 * Conversion Name must EXACTLY match the conversion action name in Google
 * Ads — override via ADS_IMPORT_CONVERSION_NAME if the action is renamed.
 * The default points at the IMPORT-type action "Purchase (offline import)":
 * Google rejects offline uploads into WEBSITE (tag) conversion actions
 * ("isn't set up for uploading conversions") — imports require an action
 * created via Goals → Conversions → New conversion action → Import.
 */
import { createFileRoute } from "@tanstack/react-router";
import { NO_STORE_HEADERS } from "@/lib/no-store-headers";

const CONVERSION_NAME =
  (process.env.ADS_IMPORT_CONVERSION_NAME || "").trim() || "Purchase (offline import)";

/** Only post-payment states are exported (see header comment). */
const PAID_STATUSES = new Set(["paid", "processing", "shipped", "delivered", "completed"]);

/** Providers whose conversions fire client-side are excluded from the import. */
const OFFLINE_PROVIDERS = new Set(["wallid", "peptidepay"]);

function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function extractProvidedSecret(request: Request): string {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (key) return key;
  // HTTP Basic: any username, password = secret.
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = atob(auth.slice(6).trim());
      const idx = decoded.indexOf(":");
      return idx >= 0 ? decoded.slice(idx + 1) : decoded;
    } catch {
      return "";
    }
  }
  return "";
}

/** Firestore admin reads may surface dates as Date, ISO string, or a raw
 * protobuf-ish {_seconds}/{seconds} object depending on the code path. */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof value === "object") {
    const v = value as { _seconds?: unknown; seconds?: unknown; toDate?: unknown };
    if (typeof v.toDate === "function") {
      try {
        const d = (v.toDate as () => Date)();
        return d instanceof Date && Number.isFinite(d.getTime()) ? d : null;
      } catch {
        return null;
      }
    }
    const secs = typeof v._seconds === "number" ? v._seconds : typeof v.seconds === "number" ? v.seconds : null;
    if (secs !== null) return new Date(secs * 1000);
  }
  return null;
}

/** Google wants MM/DD/YYYY hh:mm:ss AM/PM plus an explicit zone. The account
 * runs on UK time, and the GMT/BST offset flips through the year, so each row
 * carries its own numeric offset (e.g. +0100 in summer, +0000 in winter). */
function formatAdsTime(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const londonMs = Date.parse(d.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const utcMs = Date.parse(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMin = Math.round((londonMs - utcMs) / 60_000);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}${String(abs % 60).padStart(2, "0")}`;
  return `${get("month")}/${get("day")}/${get("year")} ${get("hour")}:${get("minute")}:${get("second")} ${get("dayPeriod")} ${offset}`;
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Shared CSV builder — also used by the .csv-suffixed alias route
 * (offline-conversions[.]csv.ts) that the Ads Data Manager flow requires. */
export async function getOfflineConversionsCsv(request: Request): Promise<Response> {
  // ---- auth ---------------------------------------------------
  // Trim both sides: a stray space/newline sneaks in easily when the secret
  // is pasted from a phone into the Ads Data Manager password field.
  const expected = (process.env.CRON_SECRET || "").trim();
  const provided = extractProvidedSecret(request).trim();
  if (!expected || !constantTimeEqual(provided, expected)) {
    // 401 + WWW-Authenticate challenge (not a bare 403): Google's HTTPS
    // connector sends the Basic credentials in response to a standard auth
    // challenge; a flat 403 makes it report "Invalid credentials" without
    // ever presenting the password.
    return new Response("forbidden", {
      status: 401,
      headers: {
        ...NO_STORE_HEADERS,
        "www-authenticate": 'Basic realm="offline-conversions", charset="UTF-8"',
      },
    });
  }

  const rows: string[] = [
    "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency",
  ];

  try {
    const { listDocs } = await import("@/lib/firestore-admin");
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const orders = await listDocs<Record<string, unknown>>("orders", {
      where: [["paidAt", ">=", since]],
      orderBy: [["paidAt", "desc"]],
      limit: 500,
    });

    for (const order of orders) {
      const status = String(order.status || "").toLowerCase();
      if (!PAID_STATUSES.has(status)) continue;
      const provider = String(order.paymentProvider || "").toLowerCase();
      if (!OFFLINE_PROVIDERS.has(provider)) continue;
      if (order.adsClientConversionAt) continue; // browser tag already claimed it

      const clickIds = (order.adClickIds || {}) as Record<string, unknown>;
      const gclid = typeof clickIds.gclid === "string" ? clickIds.gclid.trim() : "";
      if (!gclid) continue;

      const paidAt = toDate(order.paidAt);
      if (!paidAt) continue;

      const total =
        typeof order.totalAmount === "number"
          ? order.totalAmount
          : typeof order.total === "number"
            ? order.total
            : null;
      if (total === null || !Number.isFinite(total)) continue;

      const currency = String(order.currency || "GBP").toUpperCase();
      rows.push(
        [gclid, CONVERSION_NAME, formatAdsTime(paidAt), total.toFixed(2), currency]
          .map(csvCell)
          .join(","),
      );
    }
  } catch (err) {
    // Never hard-fail the Ads fetch: a header-only CSV simply imports zero rows,
    // whereas a 5xx makes Google mark the whole scheduled upload as failed.
    console.error("[offline-conversions] firestore read failed:", err);
  }

  return new Response(rows.join("\n") + "\n", {
    status: 200,
    headers: {
      ...NO_STORE_HEADERS,
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="offline-conversions.csv"',
    },
  });
}

export const Route = createFileRoute("/api/public/hooks/offline-conversions")({
  server: {
    handlers: {
      POST: async () =>
        new Response("Method Not Allowed", { status: 405, headers: NO_STORE_HEADERS }),
      GET: async ({ request }) => getOfflineConversionsCsv(request),
    },
  },
});
